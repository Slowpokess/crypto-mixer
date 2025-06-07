import { EventEmitter } from 'events';
import { Database } from '../database/connection';
import { MessageQueue } from '../queue/rabbitmq';
import { Logger } from '../utils/logger';
import { BlockchainManager } from '../blockchain/manager';

export interface TransactionMonitorConfig {
  pollInterval: number; // в миллисекундах
  maxRetries: number;
  batchSize: number;
  currencies: string[];
}

export interface MonitoredTransaction {
  id: string;
  currency: string;
  txHash: string;
  address?: string; // для мониторинга входящих транзакций на адрес
  status: 'pending' | 'confirmed' | 'failed' | 'unknown';
  confirmations: number;
  requiredConfirmations: number;
  createdAt: number;
  updatedAt: number;
  blockHeight?: number;
  retryCount: number;
  onConfirmed?: (tx: MonitoredTransaction) => Promise<void>;
  onFailed?: (tx: MonitoredTransaction) => Promise<void>;
}

export interface BlockMonitoringState {
  currency: string;
  lastProcessedBlock: number;
  isMonitoring: boolean;
  subscriptionId?: number;
  intervalId?: NodeJS.Timeout;
}

/**
 * Универсальный мониторинг транзакций для всех поддерживаемых блокчейнов
 * 
 * Функциональность:
 * - Мониторинг подтверждений транзакций
 * - Отслеживание входящих транзакций на адреса
 * - Мониторинг новых блоков
 * - Обработка событий подтверждения/провала
 * - Retry логика для неуспешных проверок
 */
export class TransactionMonitor extends EventEmitter {
  private db: Database;
  private queue: MessageQueue;
  private logger: Logger;
  private blockchainManager: BlockchainManager;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;
  private config: TransactionMonitorConfig;
  private monitoredTransactions: Map<string, MonitoredTransaction>;
  private monitoredAddresses: Map<string, Set<string>>; // currency -> Set<address>
  private blockMonitoringState: Map<string, BlockMonitoringState>;
  private isRunning: boolean;
  private advancedMonitoringInterval?: NodeJS.Timeout;

  constructor(config?: TransactionMonitorConfig) {
    super();
    this.db = new Database();
    this.queue = new MessageQueue();
    this.logger = new Logger('TransactionMonitor');
    this.blockchainManager = new BlockchainManager();
    this.monitoringIntervals = new Map();
    this.monitoredTransactions = new Map();
    this.monitoredAddresses = new Map();
    this.blockMonitoringState = new Map();
    this.isRunning = false;
    
    // Конфигурация по умолчанию
    this.config = config || {
      pollInterval: 30000, // 30 секунд
      maxRetries: 3,
      batchSize: 50,
      currencies: ['BTC', 'ETH', 'SOL', 'TRX']
    };
    
    // Инициализируем состояние мониторинга блоков для каждой валюты
    this.config.currencies.forEach(currency => {
      this.monitoredAddresses.set(currency, new Set());
      this.blockMonitoringState.set(currency, {
        currency,
        lastProcessedBlock: 0,
        isMonitoring: false
      });
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Мониторинг транзакций уже запущен');
      return;
    }

    this.isRunning = true;
    
    // Запускаем старую систему мониторинга адресов
    this.startBitcoinMonitoring();
    this.startEthereumMonitoring();
    this.startSolanaMonitoring();
    this.startTronMonitoring();
    
    // Запускаем новую систему мониторинга блоков
    await this.startAdvancedBlockMonitoring();
    
    // Запускаем периодическую проверку транзакций
    this.startAdvancedTransactionPolling();

    // Listen for new addresses to monitor
    await this.queue.subscribe('monitor.address', async (message) => {
      const { currency, address, mixRequestId } = message;
      await this.addAddressToMonitor(currency, address, mixRequestId);
    });

    this.logger.info('Мониторинг транзакций запущен (гибридный режим)', {
      currencies: this.config.currencies,
      pollInterval: this.config.pollInterval,
      batchSize: this.config.batchSize
    });
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

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear all old monitoring intervals
    for (const [currency, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      this.logger.info(`Stopped monitoring for ${currency}`);
    }

    // Останавливаем новую систему мониторинга
    if (this.advancedMonitoringInterval) {
      clearInterval(this.advancedMonitoringInterval);
      this.advancedMonitoringInterval = undefined;
    }

    // Останавливаем мониторинг блоков
    await this.stopAdvancedBlockMonitoring();

    this.logger.info('Мониторинг транзакций остановлен');
  }

  /**
   * Добавление транзакции для мониторинга
   */
  public addTransaction(
    currency: string,
    txHash: string,
    requiredConfirmations: number = 1,
    onConfirmed?: (tx: MonitoredTransaction) => Promise<void>,
    onFailed?: (tx: MonitoredTransaction) => Promise<void>
  ): string {
    const id = `${currency}-${txHash}-${Date.now()}`;
    
    const transaction: MonitoredTransaction = {
      id,
      currency,
      txHash,
      status: 'pending',
      confirmations: 0,
      requiredConfirmations,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      onConfirmed,
      onFailed
    };

    this.monitoredTransactions.set(id, transaction);
    
    this.logger.info('Добавлена транзакция для мониторинга', {
      id,
      currency,
      txHash: txHash.substring(0, 10) + '...',
      requiredConfirmations
    });

    return id;
  }

  /**
   * Добавление адреса для мониторинга входящих транзакций (новый метод)
   */
  public addAdvancedAddressMonitoring(
    currency: string,
    address: string,
    onTransaction?: (tx: any) => Promise<void>
  ): void {
    const addresses = this.monitoredAddresses.get(currency);
    if (addresses) {
      addresses.add(address);
      
      this.logger.info('Добавлен адрес для продвинутого мониторинга', {
        currency,
        address: address.substring(0, 10) + '...'
      });
    } else {
      throw new Error(`Валюта ${currency} не поддерживается для мониторинга адресов`);
    }
  }

  /**
   * Удаление адреса из мониторинга
   */
  public removeAdvancedAddressMonitoring(currency: string, address: string): void {
    const addresses = this.monitoredAddresses.get(currency);
    if (addresses) {
      addresses.delete(address);
      
      this.logger.info('Адрес удален из продвинутого мониторинга', {
        currency,
        address: address.substring(0, 10) + '...'
      });
    }
  }

  /**
   * Получение статуса транзакции
   */
  public getTransactionStatus(id: string): MonitoredTransaction | null {
    return this.monitoredTransactions.get(id) || null;
  }

  /**
   * Получение всех отслеживаемых транзакций
   */
  public getAllMonitoredTransactions(): MonitoredTransaction[] {
    return Array.from(this.monitoredTransactions.values());
  }

  /**
   * Получение статистики мониторинга
   */
  public getMonitoringStats(): {
    totalTransactions: number;
    pendingTransactions: number;
    confirmedTransactions: number;
    failedTransactions: number;
    monitoredAddresses: { [currency: string]: number };
    blockHeights: { [currency: string]: number };
  } {
    const transactions = Array.from(this.monitoredTransactions.values());
    
    return {
      totalTransactions: transactions.length,
      pendingTransactions: transactions.filter(tx => tx.status === 'pending').length,
      confirmedTransactions: transactions.filter(tx => tx.status === 'confirmed').length,
      failedTransactions: transactions.filter(tx => tx.status === 'failed').length,
      monitoredAddresses: Object.fromEntries(
        Array.from(this.monitoredAddresses.entries()).map(([currency, addresses]) => [
          currency,
          addresses.size
        ])
      ),
      blockHeights: Object.fromEntries(
        Array.from(this.blockMonitoringState.entries()).map(([currency, state]) => [
          currency,
          state.lastProcessedBlock
        ])
      )
    };
  }

  /**
   * Запуск продвинутого мониторинга блоков
   */
  private async startAdvancedBlockMonitoring(): Promise<void> {
    for (const currency of this.config.currencies) {
      try {
        await this.startBlockMonitoringForCurrency(currency);
      } catch (error) {
        this.logger.error(`Ошибка запуска продвинутого мониторинга блоков для ${currency}:`, error as Error);
      }
    }
  }

  /**
   * Запуск мониторинга блоков для конкретной валюты
   */
  private async startBlockMonitoringForCurrency(currency: string): Promise<void> {
    const state = this.blockMonitoringState.get(currency);
    if (!state || state.isMonitoring) {
      return;
    }

    try {
      // Получаем текущую высоту блока
      const latestBlock = await this.blockchainManager.getLatestBlock(currency);
      let currentHeight = 0;

      if (currency === 'BTC') {
        currentHeight = latestBlock.height;
      } else if (currency === 'ETH') {
        currentHeight = latestBlock.number;
      } else if (currency === 'SOL') {
        currentHeight = latestBlock.parentSlot || 0;
      } else if (currency === 'TRX') {
        currentHeight = latestBlock.block_header.raw_data.number;
      }

      state.lastProcessedBlock = currentHeight;
      state.isMonitoring = true;

      // Запускаем polling для мониторинга новых блоков
      state.intervalId = setInterval(async () => {
        await this.checkNewBlocks(currency);
      }, this.config.pollInterval);

      this.logger.info(`Запущен продвинутый мониторинг блоков для ${currency}`, {
        startingBlock: currentHeight
      });

    } catch (error) {
      this.logger.error(`Ошибка инициализации продвинутого мониторинга блоков ${currency}:`, error as Error);
    }
  }

  /**
   * Остановка продвинутого мониторинга блоков
   */
  private async stopAdvancedBlockMonitoring(): Promise<void> {
    for (const [currency, state] of this.blockMonitoringState.entries()) {
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = undefined;
      }
      state.isMonitoring = false;

      this.logger.info(`Остановлен продвинутый мониторинг блоков для ${currency}`);
    }
  }

  /**
   * Проверка новых блоков для валюты
   */
  private async checkNewBlocks(currency: string): Promise<void> {
    const state = this.blockMonitoringState.get(currency);
    if (!state || !state.isMonitoring) {
      return;
    }

    try {
      const latestBlock = await this.blockchainManager.getLatestBlock(currency);
      let currentHeight = 0;

      if (currency === 'BTC') {
        currentHeight = latestBlock.height;
      } else if (currency === 'ETH') {
        currentHeight = latestBlock.number;
      } else if (currency === 'SOL') {
        currentHeight = latestBlock.parentSlot || 0;
      } else if (currency === 'TRX') {
        currentHeight = latestBlock.block_header.raw_data.number;
      }

      if (currentHeight > state.lastProcessedBlock) {
        // Обрабатываем пропущенные блоки
        for (let height = state.lastProcessedBlock + 1; height <= currentHeight; height++) {
          await this.processBlock(currency, height);
        }
        
        state.lastProcessedBlock = currentHeight;
      }

    } catch (error) {
      this.logger.error(`Ошибка проверки новых блоков ${currency}:`, error as Error);
    }
  }

  /**
   * Обработка конкретного блока
   */
  private async processBlock(currency: string, blockHeight: number): Promise<void> {
    try {
      // Здесь можно добавить логику обработки транзакций в блоке
      // для поиска входящих транзакций на отслеживаемые адреса
      
      this.logger.debug(`Обработан блок ${currency} #${blockHeight}`);
      
    } catch (error) {
      this.logger.error(`Ошибка обработки блока ${currency} #${blockHeight}:`, error as Error);
    }
  }

  /**
   * Запуск периодической проверки транзакций
   */
  private startAdvancedTransactionPolling(): void {
    this.advancedMonitoringInterval = setInterval(async () => {
      await this.checkPendingTransactions();
    }, this.config.pollInterval);
  }

  /**
   * Проверка статуса отслеживаемых транзакций
   */
  private async checkPendingTransactions(): Promise<void> {
    const pendingTransactions = Array.from(this.monitoredTransactions.values())
      .filter(tx => tx.status === 'pending')
      .slice(0, this.config.batchSize);

    if (pendingTransactions.length === 0) {
      return;
    }

    const promises = pendingTransactions.map(async (tx) => {
      await this.checkTransactionStatus(tx);
    });

    await Promise.allSettled(promises);
  }

  /**
   * Проверка статуса конкретной транзакции
   */
  private async checkTransactionStatus(tx: MonitoredTransaction): Promise<void> {
    try {
      const txInfo = await this.blockchainManager.getTransaction(tx.currency, tx.txHash);
      
      if (!txInfo) {
        // Транзакция не найдена
        tx.retryCount++;
        if (tx.retryCount >= this.config.maxRetries) {
          await this.markTransactionFailed(tx, 'Транзакция не найдена после максимального количества попыток');
        }
        return;
      }

      // Обновляем информацию о транзакции
      await this.updateTransactionInfo(tx, txInfo);

    } catch (error) {
      this.logger.error(`Ошибка проверки транзакции ${tx.txHash}:`, error as Error);
      
      tx.retryCount++;
      if (tx.retryCount >= this.config.maxRetries) {
        await this.markTransactionFailed(tx, (error as Error).message);
      }
    }
  }

  /**
   * Обновление информации о транзакции
   */
  private async updateTransactionInfo(tx: MonitoredTransaction, txInfo: any): Promise<void> {
    let confirmations = 0;
    let isConfirmed = false;

    // Вычисляем количество подтверждений в зависимости от валюты
    if (tx.currency === 'BTC') {
      confirmations = txInfo.confirmations || 0;
      isConfirmed = confirmations >= tx.requiredConfirmations;
    } else if (tx.currency === 'ETH') {
      const latestBlock = await this.blockchainManager.getLatestBlock(tx.currency);
      if (txInfo.transaction && txInfo.transaction.blockNumber) {
        confirmations = latestBlock.number - txInfo.transaction.blockNumber + 1;
        isConfirmed = confirmations >= tx.requiredConfirmations;
      }
    } else if (tx.currency === 'SOL') {
      // Для Solana используем slot confirmations
      if (txInfo.slot) {
        const latestSlot = await this.blockchainManager.getClient('SOL').getLatestSlot();
        confirmations = latestSlot - txInfo.slot + 1;
        isConfirmed = confirmations >= tx.requiredConfirmations;
      }
    } else if (tx.currency === 'TRX') {
      // Для Tron проверяем статус и количество подтверждений
      isConfirmed = txInfo.ret && txInfo.ret[0]?.contractRet === 'SUCCESS';
      confirmations = isConfirmed ? tx.requiredConfirmations : 0;
    }

    tx.confirmations = confirmations;
    tx.updatedAt = Date.now();

    if (isConfirmed && tx.status === 'pending') {
      await this.markTransactionConfirmed(tx);
    }
  }

  /**
   * Отметка транзакции как подтвержденной
   */
  private async markTransactionConfirmed(tx: MonitoredTransaction): Promise<void> {
    tx.status = 'confirmed';
    tx.updatedAt = Date.now();

    this.logger.info('Транзакция подтверждена', {
      id: tx.id,
      currency: tx.currency,
      txHash: tx.txHash.substring(0, 10) + '...',
      confirmations: tx.confirmations
    });

    if (tx.onConfirmed) {
      try {
        await tx.onConfirmed(tx);
      } catch (error) {
        this.logger.error('Ошибка выполнения callback подтверждения транзакции:', error as Error);
      }
    }

    // Удаляем из мониторинга после обработки
    setTimeout(() => {
      this.monitoredTransactions.delete(tx.id);
    }, 60000); // Удаляем через 1 минуту
  }

  /**
   * Отметка транзакции как неуспешной
   */
  private async markTransactionFailed(tx: MonitoredTransaction, reason: string): Promise<void> {
    tx.status = 'failed';
    tx.updatedAt = Date.now();

    this.logger.warn('Транзакция помечена как неуспешная', {
      id: tx.id,
      currency: tx.currency,
      txHash: tx.txHash.substring(0, 10) + '...',
      reason,
      retryCount: tx.retryCount
    });

    if (tx.onFailed) {
      try {
        await tx.onFailed(tx);
      } catch (error) {
        this.logger.error('Ошибка выполнения callback провала транзакции:', error as Error);
      }
    }

    // Удаляем из мониторинга после обработки
    setTimeout(() => {
      this.monitoredTransactions.delete(tx.id);
    }, 300000); // Удаляем через 5 минут для failed транзакций
  }
}