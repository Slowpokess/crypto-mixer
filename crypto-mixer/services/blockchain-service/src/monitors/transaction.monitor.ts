import { EventEmitter } from 'events';
import { Database } from '../database/connection';
import { MessageQueue } from '../queue/rabbitmq';
import { Logger } from '../utils/logger';
import { BlockchainManager } from '../blockchain/manager';

export class TransactionMonitor extends EventEmitter {
  private db: Database;
  private queue: MessageQueue;
  private logger: Logger;
  private blockchainManager: BlockchainManager;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;

  constructor() {
    super();
    this.db = new Database();
    this.queue = new MessageQueue();
    this.logger = new Logger('TransactionMonitor');
    this.blockchainManager = new BlockchainManager();
    this.monitoringIntervals = new Map();
  }

  public async start(): Promise<void> {
    // Start monitoring for each blockchain
    this.startBitcoinMonitoring();
    this.startEthereumMonitoring();
    this.startSolanaMonitoring();
    this.startTronMonitoring();

    // Listen for new addresses to monitor
    await this.queue.subscribe('monitor.address', async (message) => {
      const { currency, address, mixRequestId } = message;
      await this.addAddressToMonitor(currency, address, mixRequestId);
    });

    this.logger.info('Transaction monitoring started');
  }

  private startBitcoinMonitoring(): void {
    const interval = setInterval(async () => {
      try {
        const addresses = await this.getMonitoredAddresses('BTC');
        
        for (const addr of addresses) {
          const balance = await this.blockchainManager.getBalance('BTC', addr.address);
          
          if (parseFloat(balance) > 0 && !addr.detected) {
            // Deposit detected
            await this.handleDeposit({
              currency: 'BTC',
              address: addr.address,
              amount: balance,
              mixRequestId: addr.mix_request_id,
            });
          }
        }
      } catch (error) {
        this.logger.error('Bitcoin monitoring error:', error as Error);
      }
    }, 30000); // Check every 30 seconds

    this.monitoringIntervals.set('BTC', interval);
  }

  private startEthereumMonitoring(): void {
    // Similar implementation for Ethereum
    // Uses event subscriptions for better performance
    const interval = setInterval(async () => {
      try {
        const addresses = await this.getMonitoredAddresses('ETH');
        
        for (const addr of addresses) {
          const balance = await this.blockchainManager.getBalance('ETH', addr.address);
          
          if (parseFloat(balance) > 0 && !addr.detected) {
            await this.handleDeposit({
              currency: 'ETH',
              address: addr.address,
              amount: balance,
              mixRequestId: addr.mix_request_id,
            });
          }
        }
      } catch (error) {
        this.logger.error('Ethereum monitoring error:', error as Error);
      }
    }, 15000); // Check every 15 seconds

    this.monitoringIntervals.set('ETH', interval);
  }

  private startSolanaMonitoring(): void {
    // Similar implementation for Solana
    // Uses WebSocket subscriptions
    const interval = setInterval(async () => {
      try {
        const addresses = await this.getMonitoredAddresses('SOL');
        
        for (const addr of addresses) {
          const balance = await this.blockchainManager.getBalance('SOL', addr.address);
          
          if (parseFloat(balance) > 0 && !addr.detected) {
            await this.handleDeposit({
              currency: 'SOL',
              address: addr.address,
              amount: balance,
              mixRequestId: addr.mix_request_id,
            });
          }
        }
      } catch (error) {
        this.logger.error('Solana monitoring error:', error as Error);
      }
    }, 10000); // Check every 10 seconds

    this.monitoringIntervals.set('SOL', interval);
  }

  private startTronMonitoring(): void {
    // Similar implementation for Tron
    const interval = setInterval(async () => {
      try {
        const addresses = await this.getMonitoredAddresses('TRX');
        
        for (const addr of addresses) {
          const balance = await this.blockchainManager.getBalance('TRX', addr.address);
          
          if (parseFloat(balance) > 0 && !addr.detected) {
            await this.handleDeposit({
              currency: 'TRX',
              address: addr.address,
              amount: balance,
              mixRequestId: addr.mix_request_id,
            });
          }
        }
      } catch (error) {
        this.logger.error('Tron monitoring error:', error as Error);
      }
    }, 20000); // Check every 20 seconds

    this.monitoringIntervals.set('TRX', interval);
  }

  private async getMonitoredAddresses(currency: string): Promise<any[]> {
    const query = `
      SELECT * FROM monitored_addresses 
      WHERE currency = $1 AND active = true
    `;
    const result = await this.db.query(query, [currency]);
    return result.rows;
  }

  private async addAddressToMonitor(
    currency: string,
    address: string,
    mixRequestId: string
  ): Promise<void> {
    const query = `
      INSERT INTO monitored_addresses (currency, address, mix_request_id, active)
      VALUES ($1, $2, $3, true)
    `;
    await this.db.query(query, [currency, address, mixRequestId]);
    this.logger.info(`Added ${currency} address to monitor: ${address}`);
  }

  private async handleDeposit(deposit: any): Promise<void> {
    this.logger.info(`Deposit detected: ${deposit.amount} ${deposit.currency} to ${deposit.address}`);

    // Update database
    await this.db.query(
      'UPDATE monitored_addresses SET detected = true WHERE address = $1',
      [deposit.address]
    );

    // Notify mixer service
    await this.queue.publish('deposit.detected', deposit);

    // Emit event
    this.emit('deposit', deposit);
  }

  public stop(): void {
    // Clear all intervals
    for (const [currency, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      this.logger.info(`Stopped monitoring for ${currency}`);
    }
  }
}