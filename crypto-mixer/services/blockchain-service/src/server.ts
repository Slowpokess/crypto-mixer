// services/blockchain-service/src/server.ts
import express, { Request, Response } from 'express';
import { BlockchainManager } from './blockchain/manager';
import { TransactionMonitor } from './monitors/transaction.monitor';
import { Logger } from './utils/logger';
import { Database } from './database/connection';
import { MessageQueue } from './queue/rabbitmq';
import BlockchainServiceHealthChecker from './monitoring/BlockchainServiceHealthChecker';
import { HealthCheckUtils } from '../../../backend/utils/monitoring/interfaces/HealthCheckInterface';

class BlockchainService {
  private app: express.Application;
  private blockchainManager: BlockchainManager;
  private transactionMonitor: TransactionMonitor;
  private logger: Logger;
  private db: Database;
  private queue: MessageQueue;
  private healthChecker: BlockchainServiceHealthChecker;

  constructor() {
    this.app = express();
    this.logger = new Logger('BlockchainService');
    this.blockchainManager = new BlockchainManager();
    this.transactionMonitor = new TransactionMonitor();
    this.db = new Database();
    this.queue = new MessageQueue();
    this.healthChecker = BlockchainServiceHealthChecker.getInstance();
  }

  public async start(): Promise<void> {
    try {
      // Initialize connections
      await this.db.connect();
      await this.queue.connect();
      
      // Initialize blockchain connections
      await this.blockchainManager.initialize();
      
      // Настраиваем health checker с blockchain manager
      this.healthChecker.setBlockchainManager(this.blockchainManager);
      
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

    // Health check endpoints
    this.app.get('/health', HealthCheckUtils.createHealthEndpoint(this.healthChecker));
    
    // Detailed health check для blockchain-specific информации
    this.app.get('/health/detailed', async (_req: Request, res: Response): Promise<void> => {
      try {
        const healthStatus = await this.healthChecker.getHealthStatus();
        
        // Добавляем blockchain-specific метрики
        const detailedStatus = {
          ...healthStatus,
          blockchainInfo: {
            connectedCurrencies: Object.keys(healthStatus.details.blockchain?.currencies || {}),
            totalConnectedNodes: healthStatus.details.blockchain?.connectedNodes || 0,
            syncStatus: healthStatus.details.blockchain?.syncStatus || 'unknown'
          },
          systemInfo: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime()
          }
        };
        
        const httpStatus = healthStatus.status === 'healthy' ? 200 :
                          healthStatus.status === 'warning' ? 200 :
                          healthStatus.status === 'critical' ? 503 : 500;
        
        res.status(httpStatus).json(detailedStatus);
      } catch (error) {
        this.logger.error('Detailed health check failed:', error as Error);
        res.status(500).json({
          status: 'critical',
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Быстрая проверка готовности
    this.app.get('/ready', async (_req: Request, res: Response): Promise<void> => {
      try {
        const healthStatus = await this.healthChecker.getHealthStatus();
        const isBlockchainReady = healthStatus.details.blockchain?.connectedNodes || 0 > 0;
        const isDatabaseReady = healthStatus.details.database?.connected || false;
        
        if (isBlockchainReady && isDatabaseReady) {
          res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
            service: 'blockchain-service'
          });
        } else {
          res.status(503).json({
            status: 'not_ready',
            error: 'Blockchain connections or database not available',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Проверка "живости"
    this.app.get('/live', (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Метрики для мониторинга
    this.app.get('/metrics', async (_req: Request, res: Response): Promise<void> => {
      try {
        const healthStatus = await this.healthChecker.getHealthStatus();
        res.set('Content-Type', 'text/plain');
        
        // Простые метрики в формате Prometheus
        let metrics = '';
        metrics += `# HELP blockchain_service_uptime_seconds Total uptime of the blockchain service\n`;
        metrics += `# TYPE blockchain_service_uptime_seconds counter\n`;
        metrics += `blockchain_service_uptime_seconds ${process.uptime()}\n`;
        
        metrics += `# HELP blockchain_service_connected_nodes Number of connected blockchain nodes\n`;
        metrics += `# TYPE blockchain_service_connected_nodes gauge\n`;
        metrics += `blockchain_service_connected_nodes ${healthStatus.details.blockchain?.connectedNodes || 0}\n`;
        
        metrics += `# HELP blockchain_service_pending_transactions Number of pending transactions\n`;
        metrics += `# TYPE blockchain_service_pending_transactions gauge\n`;
        metrics += `blockchain_service_pending_transactions ${healthStatus.details.blockchain?.pendingTransactions || 0}\n`;
        
        // Метрики по валютам
        if (healthStatus.details.blockchain?.currencies) {
          for (const [currency, info] of Object.entries(healthStatus.details.blockchain.currencies)) {
            const currencyInfo = info as any;
            metrics += `# HELP blockchain_service_currency_connected Currency connection status\n`;
            metrics += `# TYPE blockchain_service_currency_connected gauge\n`;
            metrics += `blockchain_service_currency_connected{currency="${currency}"} ${currencyInfo.connected ? 1 : 0}\n`;
            
            if (currencyInfo.lastBlock) {
              metrics += `# HELP blockchain_service_last_block Last processed block height\n`;
              metrics += `# TYPE blockchain_service_last_block gauge\n`;
              metrics += `blockchain_service_last_block{currency="${currency}"} ${currencyInfo.lastBlock}\n`;
            }
          }
        }
        
        res.send(metrics);
      } catch (error) {
        this.logger.error('Metrics endpoint failed:', error as Error);
        res.status(500).json({ error: 'Failed to generate metrics' });
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
    
    try {
      // Остановка мониторинга транзакций
      this.transactionMonitor.stop();
      
      // Очистка health checker
      await this.healthChecker.cleanup();
      
      // Закрытие подключений
      await this.db.disconnect();
      await this.queue.disconnect();
      
      this.logger.info('✅ Blockchain service gracefully shut down');
      process.exit(0);
    } catch (error) {
      this.logger.error('❌ Error during shutdown:', error as Error);
      process.exit(1);
    }
  }
}

// Start service
const service = new BlockchainService();
service.start();