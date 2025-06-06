import { WalletManager } from '../managers/wallet.manager';
import { MessageQueue } from '../queue/rabbitmq';
import { Logger } from '../utils/logger';

export class BalanceMonitor {
  private walletManager: WalletManager;
  private queue: MessageQueue;
  private logger: Logger;
  private monitoringInterval: NodeJS.Timer | null = null;

  constructor(walletManager: WalletManager, queue: MessageQueue) {
    this.walletManager = walletManager;
    this.queue = queue;
    this.logger = new Logger('BalanceMonitor');
  }

  public async start(): Promise<void> {
    // Monitor every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      await this.checkBalances();
    }, 5 * 60 * 1000);

    // Initial check
    await this.checkBalances();

    this.logger.info('Balance monitoring started');
  }

  private async checkBalances(): Promise<void> {
    try {
      const currencies = ['BTC', 'ETH', 'SOL', 'USDT_ERC20'];

      for (const currency of currencies) {
        const balances = await this.walletManager.getWalletBalances(currency);
        
        for (const balance of balances) {
          // Check if hot wallets need refilling
          if (balance.wallet_type === 'HOT' && balance.total_balance < this.getMinimumBalance(currency)) {
            await this.requestRefill(currency, balance.wallet_type);
          }

          // Check if any wallet has too much balance
          if (balance.total_balance > this.getMaximumBalance(currency, balance.wallet_type)) {
            await this.requestSweep(currency, balance.wallet_type);
          }
        }

        // Log balance summary
        this.logger.info(`${currency} balances:`, balances);
      }

    } catch (error) {
      this.logger.error('Error checking balances:', error);
    }
  }

  private getMinimumBalance(currency: string): number {
    const minimums: Record<string, number> = {
      BTC: 0.1,
      ETH: 1,
      SOL: 10,
      USDT_ERC20: 1000,
    };

    return minimums[currency] || 0;
  }

  private getMaximumBalance(currency: string, walletType: string): number {
    const maximums: Record<string, Record<string, number>> = {
      HOT: {
        BTC: 1,
        ETH: 10,
        SOL: 100,
        USDT_ERC20: 10000,
      },
      BUFFER: {
        BTC: 5,
        ETH: 50,
        SOL: 500,
        USDT_ERC20: 50000,
      },
      COLD: {
        BTC: 100,
        ETH: 1000,
        SOL: 10000,
        USDT_ERC20: 1000000,
      },
    };

    return maximums[walletType]?.[currency] || Infinity;
  }

  private async requestRefill(currency: string, walletType: string): Promise<void> {
    this.logger.warn(`Requesting refill for ${currency} ${walletType} wallets`);

    await this.queue.publish('wallet.refill.needed', {
      currency,
      walletType,
      timestamp: new Date(),
    });
  }

  private async requestSweep(currency: string, walletType: string): Promise<void> {
    this.logger.warn(`Requesting sweep for ${currency} ${walletType} wallets`);

    await this.queue.publish('wallet.sweep.needed', {
      currency,
      walletType,
      timestamp: new Date(),
    });
  }

  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Balance monitoring stopped');
    }
  }
}