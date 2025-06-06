// services/blockchain-service/src/server.ts
import express, { Request, Response } from 'express';
import { BlockchainManager } from './blockchain/manager';
import { TransactionMonitor } from './monitors/transaction.monitor';
import { Logger } from './utils/logger';
import { Database } from './database/connection';
import { MessageQueue } from './queue/rabbitmq';

class BlockchainService {
  private app: express.Application;
  private blockchainManager: BlockchainManager;
  private transactionMonitor: TransactionMonitor;
  private logger: Logger;
  private db: Database;
  private queue: MessageQueue;

  constructor() {
    this.app = express();
    this.logger = new Logger('BlockchainService');
    this.blockchainManager = new BlockchainManager();
    this.transactionMonitor = new TransactionMonitor();
    this.db = new Database();
    this.queue = new MessageQueue();
  }

  public async start(): Promise<void> {
    try {
      // Initialize connections
      await this.db.connect();
      await this.queue.connect();
      
      // Initialize blockchain connections
      await this.blockchainManager.initialize();
      
      // Start transaction monitoring
      await this.transactionMonitor.start();
      
      // Setup API routes
      this.setupRoutes();
      
      // Start server
      const port = process.env.PORT || 3001;
      this.app.listen(port, () => {
        this.logger.info(`Blockchain Service running on port ${port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        this.logger.info('SIGTERM received, shutting down gracefully');
        await this.shutdown();
      });
      
    } catch (error) {
      this.logger.error('Failed to start blockchain service:', error as Error);
      process.exit(1);
    }
  }

  private setupRoutes(): void {
    this.app.use(express.json());
    
    // Get balance
    this.app.get('/balance/:currency/:address', async (req: Request, res: Response): Promise<void> => {
      try {
        const { currency, address } = req.params;
        
        // Validate required parameters
        const validationError = this.validateRequiredParams(req.params, ['currency', 'address']);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }
        
        // Additional validation for supported currencies
        if (!this.isSupportedCurrency(currency!)) {
          res.status(400).json({ 
            error: `Unsupported currency: ${currency}. Supported: BTC, ETH, SOL, TRON` 
          });
          return;
        }
        
        const balance = await this.blockchainManager.getBalance(currency!, address!);
        res.json({ balance });
      } catch (error) {
        this.logger.error('Error getting balance:', error as Error);
        res.status(500).json({ error: (error as Error).message });
      }
    });
    
    // Send transaction
    this.app.post('/send', async (req: Request, res: Response): Promise<void> => {
      try {
        const { currency, from, to, amount, privateKey } = req.body;
        
        // Validate required body parameters
        const validationError = this.validateRequiredBody(req.body, 
          ['currency', 'from', 'to', 'amount', 'privateKey']
        );
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }
        
        // Validate currency
        if (!this.isSupportedCurrency(currency)) {
          res.status(400).json({ 
            error: `Unsupported currency: ${currency}. Supported: BTC, ETH, SOL, TRON` 
          });
          return;
        }
        
        // Validate amount
        if (typeof amount !== 'number' || amount <= 0) {
          res.status(400).json({ error: 'Amount must be a positive number' });
          return;
        }
        
        // Advanced validation for transaction parameters
        const txValidationError = this.validateTransactionParams({
          currency, from, to, amount, privateKey
        });
        if (txValidationError) {
          res.status(400).json({ error: txValidationError });
          return;
        }
        
        // Convert amount to string for blockchain manager
        const txHash = await this.blockchainManager.sendTransaction(
          currency, from, to, amount.toString(), privateKey
        );
        res.json({ txHash });
      } catch (error) {
        this.logger.error('Error sending transaction:', error as Error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Health check
    this.app.get('/health', async (_req: Request, res: Response): Promise<void> => {
      try {
        const dbHealth = await this.db.healthCheck();
        const queueHealth = await this.queue.healthCheck();
        
        const isHealthy = dbHealth && queueHealth;
        
        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          services: {
            database: dbHealth,
            messageQueue: queueHealth
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  // Validation helper methods
  private validateRequiredParams(params: any, required: string[]): string | null {
    for (const param of required) {
      if (!params[param] || typeof params[param] !== 'string' || params[param].trim() === '') {
        return `Missing or invalid required parameter: ${param}`;
      }
    }
    return null;
  }

  private validateRequiredBody(body: any, required: string[]): string | null {
    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return `Missing required field: ${field}`;
      }
      if (typeof body[field] === 'string' && body[field].trim() === '') {
        return `Field cannot be empty: ${field}`;
      }
    }
    return null;
  }

  private isSupportedCurrency(currency: string): boolean {
    const supportedCurrencies = ['BTC', 'ETH', 'SOL', 'TRON'];
    return supportedCurrencies.includes(currency.toUpperCase());
  }

  private validateTransactionParams(params: {
    currency: string;
    from: string;
    to: string;
    amount: number;
    privateKey: string;
  }): string | null {
    // Validate addresses format (basic validation)
    if (params.currency === 'BTC') {
      if (!this.isValidBitcoinAddress(params.from) || !this.isValidBitcoinAddress(params.to)) {
        return 'Invalid Bitcoin address format';
      }
    } else if (params.currency === 'ETH') {
      if (!this.isValidEthereumAddress(params.from) || !this.isValidEthereumAddress(params.to)) {
        return 'Invalid Ethereum address format';
      }
    }
    
    // Validate amount
    if (params.amount <= 0) {
      return 'Amount must be greater than 0';
    }
    
    // Validate private key format (basic check)
    if (params.privateKey.length < 32) {
      return 'Invalid private key format';
    }
    
    return null;
  }

  private isValidBitcoinAddress(address: string): boolean {
    // Basic Bitcoin address validation (starts with 1, 3, or bc1)
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(address);
  }

  private isValidEthereumAddress(address: string): boolean {
    // Basic Ethereum address validation (0x + 40 hex chars)
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down blockchain service...');
    this.transactionMonitor.stop();
    await this.db.disconnect();
    await this.queue.disconnect();
    process.exit(0);
  }
}

// Start service
const service = new BlockchainService();
service.start();