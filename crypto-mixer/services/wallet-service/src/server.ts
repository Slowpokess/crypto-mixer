import express from 'express';
import { WalletManager } from './managers/wallet.manager';
import { HSMManager } from './security/hsm.manager';
import { KeyRotationService } from './services/key-rotation.service';
import { BalanceMonitor } from './monitors/balance.monitor';
import { Database } from './database/connection';
import { MessageQueue } from './queue/rabbitmq';
import { Logger } from './utils/logger';

class WalletService {
  private app: express.Application;
  private walletManager: WalletManager;
  private hsmManager: HSMManager;
  private keyRotationService: KeyRotationService;
  private balanceMonitor: BalanceMonitor;
  private db: Database;
  private queue: MessageQueue;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.logger = new Logger('WalletService');
    this.db = new Database();
    this.queue = new MessageQueue();
  }

  public async start(): Promise<void> {
    try {
      await this.db.connect();
      await this.queue.connect();

      if (process.env.HSM_ENABLED === 'true') {
        this.hsmManager = new HSMManager({
          pin: process.env.HSM_PIN!,
          slotId: parseInt(process.env.HSM_SLOT_ID || '0'),
        });
        await this.hsmManager.initialize();
        this.logger.info('HSM initialized successfully');
      }

      this.walletManager = new WalletManager(this.db, this.hsmManager);
      this.keyRotationService = new KeyRotationService(this.walletManager);
      this.balanceMonitor = new BalanceMonitor(this.walletManager, this.queue);

      this.setupRoutes();
      await this.balanceMonitor.start();
      await this.keyRotationService.start();
      await this.setupQueueListeners();

      const port = process.env.PORT || 3003;
      this.app.listen(port, () => {
        this.logger.info(`Wallet Service running on port ${port}`);
      });

    } catch (error) {
      this.logger.error('Failed to start Wallet Service:', error);
      process.exit(1);
    }
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', hsm: this.hsmManager?.isConnected() });
    });

    this.app.post('/internal/wallet/create', async (req, res) => {
      try {
        const { currency, type } = req.body;
        const wallet = await this.walletManager.createWallet(currency, type);
        res.json({ address: wallet.address });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.get('/internal/wallet/balance/:currency', async (req, res) => {
      try {
        const { currency } = req.params;
        const balances = await this.walletManager.getWalletBalances(currency);
        res.json(balances);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  private async setupQueueListeners(): Promise<void> {
    await this.queue.subscribe('wallet.create', async (message) => {
      const { currency, type, count } = message;
      await this.walletManager.createMultipleWallets(currency, type, count);
    });

    await this.queue.subscribe('wallet.sign', async (message) => {
      const { walletId, transaction } = message;
      const signedTx = await this.walletManager.signTransaction(walletId, transaction);
      
      await this.queue.publish('wallet.signed', {
        walletId,
        signedTransaction: signedTx,
        requestId: message.requestId,
      });
    });

    await this.queue.subscribe('wallet.update_balance', async (message) => {
      const { address, currency, balance } = message;
      await this.walletManager.updateBalance(address, currency, balance);
    });
  }
}

const service = new WalletService();
service.start();