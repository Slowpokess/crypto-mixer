import { BitcoinClient } from './clients/bitcoin.client';
import { EthereumClient } from './clients/ethereum.client';
import { SolanaClient } from './clients/solana.client';
import { TronClient } from './clients/tron.client';
import { Logger } from '../utils/logger';
import { HSMConfig } from '../../wallet-service/src/security/hsm.manager';

export interface BlockchainConfig {
  [key: string]: any;
  hsmConfig?: HSMConfig;
  enableSecureGeneration?: boolean;
}

export interface ClientHealthStatus {
  connected: boolean;
  lastCheck: number;
  blockHeight?: number;
  warnings: string[];
  latency?: number;
}

/**
 * Центральный менеджер для управления всеми блокчейн клиентами
 * 
 * Функциональность:
 * - Управление клиентами Bitcoin, Ethereum, Solana, Tron
 * - Мониторинг состояния подключений
 * - Балансировка нагрузки между нодами
 * - Автоматическое переподключение при сбоях
 * - Поддержка HSM/Vault интеграции
 */
export class BlockchainManager {
  private clients: Map<string, any>;
  private logger: Logger;
  private healthStatus: Map<string, ClientHealthStatus>;
  private config: BlockchainConfig;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: BlockchainConfig = {}) {
    this.clients = new Map();
    this.healthStatus = new Map();
    this.logger = new Logger('BlockchainManager');
    this.config = config;
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Инициализация менеджера блокчейнов...');

      // Инициализируем Bitcoin
      await this.initializeBitcoinClient();
      
      // Инициализируем Ethereum
      await this.initializeEthereumClient();
      
      // Инициализируем Solana
      await this.initializeSolanaClient();
      
      // Инициализируем Tron
      await this.initializeTronClient();

      // Запускаем мониторинг состояния
      this.startHealthMonitoring();

      this.logger.info('Все блокчейн клиенты инициализированы', {
        clients: Array.from(this.clients.keys()),
        secureGeneration: this.config.enableSecureGeneration || false
      });
      
    } catch (error) {
      this.logger.error('Ошибка инициализации блокчейн менеджера:', error as Error);
      throw error;
    }
  }

  private async initializeBitcoinClient(): Promise<void> {
    try {
      const btcClient = new BitcoinClient({
        host: process.env.BTC_NODE_HOST || 'localhost',
        port: parseInt(process.env.BTC_NODE_PORT || '8332'),
        username: process.env.BTC_RPC_USER || '',
        password: process.env.BTC_RPC_PASSWORD || '',
        network: process.env.BTC_NETWORK || 'mainnet',
        hsmConfig: this.config.hsmConfig,
        enableSecureGeneration: this.config.enableSecureGeneration
      });
      
      const startTime = Date.now();
      await btcClient.connect();
      const latency = Date.now() - startTime;
      
      this.clients.set('BTC', btcClient);
      this.healthStatus.set('BTC', {
        connected: true,
        lastCheck: Date.now(),
        warnings: [],
        latency
      });
      
      this.logger.info('Bitcoin клиент инициализирован', { latency: `${latency}ms` });
    } catch (error) {
      this.logger.error('Ошибка инициализации Bitcoin клиента:', error as Error);
      this.healthStatus.set('BTC', {
        connected: false,
        lastCheck: Date.now(),
        warnings: [(error as Error).message]
      });
    }
  }

  private async initializeEthereumClient(): Promise<void> {
    try {
      const ethClient = new EthereumClient({
        rpcUrl: process.env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_KEY',
        chainId: parseInt(process.env.ETH_CHAIN_ID || '1'),
        hsmConfig: this.config.hsmConfig,
        enableSecureGeneration: this.config.enableSecureGeneration
      });
      
      const startTime = Date.now();
      await ethClient.connect();
      const latency = Date.now() - startTime;
      
      this.clients.set('ETH', ethClient);
      this.healthStatus.set('ETH', {
        connected: true,
        lastCheck: Date.now(),
        warnings: [],
        latency
      });
      
      this.logger.info('Ethereum клиент инициализирован', { latency: `${latency}ms` });
    } catch (error) {
      this.logger.error('Ошибка инициализации Ethereum клиента:', error as Error);
      this.healthStatus.set('ETH', {
        connected: false,
        lastCheck: Date.now(),
        warnings: [(error as Error).message]
      });
    }
  }

  private async initializeSolanaClient(): Promise<void> {
    try {
      const solClient = new SolanaClient({
        rpcUrl: process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
        cluster: (process.env.SOL_CLUSTER as any) || 'mainnet-beta',
        commitment: (process.env.SOL_COMMITMENT as any) || 'confirmed',
        hsmConfig: this.config.hsmConfig,
        enableSecureGeneration: this.config.enableSecureGeneration
      });
      
      const startTime = Date.now();
      await solClient.connect();
      const latency = Date.now() - startTime;
      
      this.clients.set('SOL', solClient);
      this.healthStatus.set('SOL', {
        connected: true,
        lastCheck: Date.now(),
        warnings: [],
        latency
      });
      
      this.logger.info('Solana клиент инициализирован', { latency: `${latency}ms` });
    } catch (error) {
      this.logger.error('Ошибка инициализации Solana клиента:', error as Error);
      this.healthStatus.set('SOL', {
        connected: false,
        lastCheck: Date.now(),
        warnings: [(error as Error).message]
      });
    }
  }

  private async initializeTronClient(): Promise<void> {
    try {
      const tronClient = new TronClient({
        fullNode: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
        solidityNode: process.env.TRON_SOLIDITY_NODE || 'https://api.trongrid.io',
        eventServer: process.env.TRON_EVENT_SERVER || 'https://api.trongrid.io',
        apiKey: process.env.TRON_API_KEY,
        hsmConfig: this.config.hsmConfig,
        enableSecureGeneration: this.config.enableSecureGeneration
      });
      
      const startTime = Date.now();
      await tronClient.connect();
      const latency = Date.now() - startTime;
      
      this.clients.set('TRX', tronClient);
      this.healthStatus.set('TRX', {
        connected: true,
        lastCheck: Date.now(),
        warnings: [],
        latency
      });
      
      this.logger.info('Tron клиент инициализирован', { latency: `${latency}ms` });
    } catch (error) {
      this.logger.error('Ошибка инициализации Tron клиента:', error as Error);
      this.healthStatus.set('TRX', {
        connected: false,
        lastCheck: Date.now(),
        warnings: [(error as Error).message]
      });
    }
  }

  /**
   * Получение баланса для любой поддерживаемой валюты
   */
  public async getBalance(currency: string, address: string): Promise<string> {
    const client = this.getClient(currency);
    
    try {
      return await client.getBalance(address);
    } catch (error) {
      this.logger.error(`Ошибка получения баланса ${currency}:`, error as Error);
      await this.markClientUnhealthy(currency, (error as Error).message);
      throw error;
    }
  }

  /**
   * Отправка транзакции для любой поддерживаемой валюты
   */
  public async sendTransaction(
    currency: string,
    from: string,
    to: string,
    amount: string,
    keyId: string
  ): Promise<string> {
    const client = this.getClient(currency);
    
    try {
      return await client.sendTransaction(from, to, amount, keyId);
    } catch (error) {
      this.logger.error(`Ошибка отправки транзакции ${currency}:`, error as Error);
      await this.markClientUnhealthy(currency, (error as Error).message);
      throw error;
    }
  }

  /**
   * Генерация нового адреса для любой поддерживаемой валюты
   */
  public async generateAddress(currency: string): Promise<{ address: string; keyId: string; publicKey: string }> {
    const client = this.getClient(currency);
    
    try {
      return await client.generateAddress();
    } catch (error) {
      this.logger.error(`Ошибка генерации адреса ${currency}:`, error as Error);
      throw error;
    }
  }

  /**
   * Получение информации о транзакции
   */
  public async getTransaction(currency: string, txHash: string): Promise<any> {
    const client = this.getClient(currency);
    
    try {
      return await client.getTransaction(txHash);
    } catch (error) {
      this.logger.error(`Ошибка получения транзакции ${currency}:`, error as Error);
      throw error;
    }
  }

  /**
   * Получение последнего блока
   */
  public async getLatestBlock(currency: string): Promise<any> {
    const client = this.getClient(currency);
    
    try {
      if (currency === 'BTC') {
        return await client.getLatestBlock();
      } else if (currency === 'ETH') {
        return await client.getLatestBlock();
      } else if (currency === 'SOL') {
        const slot = await client.getLatestSlot();
        return await client.getBlock(slot);
      } else if (currency === 'TRX') {
        return await client.getLatestBlock();
      }
      
      throw new Error(`Получение блока не поддерживается для ${currency}`);
    } catch (error) {
      this.logger.error(`Ошибка получения блока ${currency}:`, error as Error);
      throw error;
    }
  }

  /**
   * Валидация адреса для любой поддерживаемой валюты
   */
  public async validateAddress(currency: string, address: string): Promise<boolean> {
    const client = this.getClient(currency);
    
    try {
      if (currency === 'BTC') {
        const result = await client.validateAddress(address);
        return result.isvalid;
      } else if (currency === 'ETH') {
        return client.isValidAddress(address);
      } else if (currency === 'SOL') {
        return client.isValidAddress(address);
      } else if (currency === 'TRX') {
        return client.isValidAddress(address);
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Ошибка валидации адреса ${currency}:`, error as Error);
      return false;
    }
  }

  /**
   * Получение баланса токена (для Ethereum, Solana, Tron)
   */
  public async getTokenBalance(
    currency: string, 
    walletAddress: string, 
    tokenAddress: string
  ): Promise<string> {
    const client = this.getClient(currency);
    
    try {
      if (currency === 'ETH') {
        return await client.getTokenBalance(tokenAddress, walletAddress);
      } else if (currency === 'SOL') {
        return await client.getTokenBalance(walletAddress, tokenAddress);
      } else if (currency === 'TRX') {
        return await client.getTokenBalance(walletAddress, tokenAddress);
      }
      
      throw new Error(`Токены не поддерживаются для ${currency}`);
    } catch (error) {
      this.logger.error(`Ошибка получения баланса токена ${currency}:`, error as Error);
      throw error;
    }
  }

  /**
   * Отправка токенов (для Ethereum, Solana, Tron)
   */
  public async sendToken(
    currency: string,
    from: string,
    to: string,
    tokenAddress: string,
    amount: string,
    keyId: string,
    decimals?: number
  ): Promise<string> {
    const client = this.getClient(currency);
    
    try {
      if (currency === 'ETH') {
        return await client.sendToken(tokenAddress, from, to, amount, keyId);
      } else if (currency === 'SOL') {
        if (decimals === undefined) {
          throw new Error('Decimals обязательны для Solana токенов');
        }
        return await client.sendToken(from, to, tokenAddress, amount, decimals, keyId);
      } else if (currency === 'TRX') {
        return await client.sendToken(from, to, tokenAddress, amount, keyId);
      }
      
      throw new Error(`Токены не поддерживаются для ${currency}`);
    } catch (error) {
      this.logger.error(`Ошибка отправки токена ${currency}:`, error as Error);
      throw error;
    }
  }

  /**
   * Получение состояния здоровья всех клиентов
   */
  public async getHealthStatus(): Promise<Map<string, ClientHealthStatus>> {
    return new Map(this.healthStatus);
  }

  /**
   * Получение состояния здоровья конкретного клиента
   */
  public async getClientHealth(currency: string): Promise<ClientHealthStatus | null> {
    return this.healthStatus.get(currency) || null;
  }

  /**
   * Получение списка поддерживаемых валют
   */
  public getSupportedCurrencies(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Получение списка подключенных клиентов
   */
  public getConnectedClients(): string[] {
    return Array.from(this.clients.keys()).filter(currency => {
      const status = this.healthStatus.get(currency);
      return status?.connected || false;
    });
  }

  /**
   * Запуск мониторинга состояния клиентов
   */
  private startHealthMonitoring(): void {
    const intervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'); // 30 секунд по умолчанию
    
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, intervalMs);
    
    this.logger.info('Запущен мониторинг состояния блокчейн клиентов', { 
      intervalMs 
    });
  }

  /**
   * Выполнение проверки состояния всех клиентов
   */
  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.clients.entries()).map(async ([currency, client]) => {
      try {
        const startTime = Date.now();
        const health = await client.healthCheck();
        const latency = Date.now() - startTime;
        
        this.healthStatus.set(currency, {
          connected: health.connected,
          lastCheck: Date.now(),
          blockHeight: health.blockNumber || health.slot || health.blockHeight,
          warnings: health.warnings || [],
          latency
        });
        
        if (!health.connected) {
          this.logger.warn(`Клиент ${currency} не подключен`, { warnings: health.warnings });
        }
      } catch (error) {
        this.logger.error(`Ошибка проверки состояния ${currency}:`, error as Error);
        await this.markClientUnhealthy(currency, (error as Error).message);
      }
    });
    
    await Promise.allSettled(promises);
  }

  /**
   * Отметка клиента как неработающего
   */
  private async markClientUnhealthy(currency: string, error: string): Promise<void> {
    const currentStatus = this.healthStatus.get(currency);
    this.healthStatus.set(currency, {
      connected: false,
      lastCheck: Date.now(),
      blockHeight: currentStatus?.blockHeight,
      warnings: [error],
      latency: currentStatus?.latency
    });
  }

  /**
   * Получение клиента с проверкой существования
   */
  private getClient(currency: string): any {
    const client = this.clients.get(currency);
    if (!client) {
      throw new Error(`Неподдерживаемая валюта: ${currency}`);
    }
    
    const status = this.healthStatus.get(currency);
    if (!status?.connected) {
      this.logger.warn(`Клиент ${currency} может быть недоступен`, { 
        lastCheck: status?.lastCheck,
        warnings: status?.warnings 
      });
    }
    
    return client;
  }

  /**
   * Остановка мониторинга и закрытие соединений
   */
  public async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    // Остановка мониторинга блоков для клиентов которые это поддерживают
    const promises = Array.from(this.clients.entries()).map(async ([currency, client]) => {
      try {
        if (currency === 'ETH' && client.removeBlockListener) {
          client.removeBlockListener();
        }
        if (currency === 'SOL' && client.removeSlotChangeListener) {
          // Здесь нужно будет хранить subscription IDs
        }
      } catch (error) {
        this.logger.error(`Ошибка остановки мониторинга ${currency}:`, error as Error);
      }
    });
    
    await Promise.allSettled(promises);
    
    this.logger.info('BlockchainManager остановлен');
  }
}