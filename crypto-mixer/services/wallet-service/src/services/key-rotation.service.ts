import { WalletManager } from '../managers/wallet.manager';
import { Logger } from '../utils/logger';

export class KeyRotationService {
  private walletManager: WalletManager;
  private logger: Logger;
  private rotationInterval: NodeJS.Timer | null = null;

  constructor(walletManager: WalletManager) {
    this.walletManager = walletManager;
    this.logger = new Logger('KeyRotationService');
  }

  public async start(): Promise<void> {
    // Rotate keys every 24 hours
    this.rotationInterval = setInterval(async () => {
      await this.performScheduledRotation();
    }, 24 * 60 * 60 * 1000);

    this.logger.info('Key rotation service started');
  }

  private async performScheduledRotation(): Promise<void> {
    try {
      this.logger.info('Starting scheduled key rotation');

      // Rotate hot wallets that are older than rotation period
      await this.rotateOldWallets();

      this.logger.info('Scheduled key rotation completed');

    } catch (error) {
      this.logger.error('Error during scheduled rotation:', error);
    }
  }

  private async rotateOldWallets(): Promise<void> {
    // Implementation would depend on wallet age tracking
    // For now, this is a placeholder
    this.logger.info('Checking for wallets that need rotation');
  }

  public async rotateWallet(walletId: string): Promise<any> {
    this.logger.info(`Manually rotating wallet ${walletId}`);
    
    try {
      const newWallet = await this.walletManager.rotateWallet(walletId);
      
      this.logger.info(`Wallet ${walletId} rotated successfully. New wallet: ${newWallet.id}`);
      
      return newWallet;
      
    } catch (error) {
      this.logger.error(`Failed to rotate wallet ${walletId}:`, error);
      throw error;
    }
  }

  public stop(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      this.logger.info('Key rotation service stopped');
    }
  }
}