import { 
  BaseHealthChecker, 
  DatabaseHealthDetails, 
  CacheHealthDetails, 
  BlockchainHealthDetails,
  MessageQueueHealthDetails,
  VaultHealthDetails,
  HSMHealthDetails,
  DependencyHealthDetails,
  HealthCheckConfig
} from '../../../../backend/utils/monitoring/interfaces/HealthCheckInterface';
import { Logger } from '../utils/logger';

/**
 * Реализация Health Check для Blockchain сервиса crypto-mixer
 * Специализируется на проверке подключений к блокчейн сетям
 */
export class BlockchainServiceHealthChecker extends BaseHealthChecker {
  private static instance: BlockchainServiceHealthChecker | null = null;
  private logger: Logger;
  private blockchainManager: any = null;

  constructor() {
    super('crypto-mixer-blockchain-service', process.env.npm_package_version || '1.0.0', {
      enabledChecks: {
        database: true,
        cache: false, // Blockchain service обычно не использует кэш напрямую
        blockchain: true, // Основная функция сервиса
        messageQueue: true,
        vault: false,
        hsm: false,
        dependencies: true
      },
      timeouts: {
        database: 5000,
        cache: 0,
        blockchain: 15000, // Блокчейн может отвечать медленно
        messageQueue: 5000,
        vault: 0,
        hsm: 0,
        dependencies: 8000
      },
      thresholds: {
        responseTime: {
          warning: 3000,
          critical: 15000
        },
        memoryUsage: {
          warning: 80,
          critical: 90
        },
        diskUsage: {
          warning: 85,
          critical: 95
        },
        cpuUsage: {
          warning: 75,
          critical: 90
        }
      }
    });

    this.logger = new Logger('BlockchainHealthChecker');
  }

  /**
   * Получение синглтон экземпляра
   */
  public static getInstance(): BlockchainServiceHealthChecker {
    if (!BlockchainServiceHealthChecker.instance) {
      BlockchainServiceHealthChecker.instance = new BlockchainServiceHealthChecker();
    }
    return BlockchainServiceHealthChecker.instance;
  }

  /**
   * Установка менеджера блокчейнов
   */
  public setBlockchainManager(manager: any): void {
    this.blockchainManager = manager;
  }

  /**
   * Blockchain service имеет свою локальную БД для метаданных
   */
  protected async checkDatabase(): Promise<DatabaseHealthDetails> {
    const startTime = Date.now();
    
    try {
      // Попытка импорта connection модуля
      const connectionModule = await import('../database/connection');
      const connection = connectionModule.default || connectionModule.connection;
      
      if (!connection) {
        throw new Error('Database connection not available');
      }

      // Тест подключения
      const testQuery = 'SELECT NOW() as current_time, version() as version';
      const result = await connection.query(testQuery);
      
      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        responseTime,
        activeConnections: 1, // Blockchain service обычно использует одно подключение
        maxConnections: 10,
        lastQuery: `Test query (${responseTime}ms)`,
        version: result?.rows?.[0]?.version?.split(' ')[1] || 'unknown'
      };

    } catch (error) {
      this.logger.error('Database health check failed', { error });
      
      return {
        connected: false,
        responseTime: Date.now() - startTime,
        activeConnections: 0,
        maxConnections: 0,
        lastQuery: `Failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Blockchain service обычно не использует Redis кэш
   */
  protected async checkCache(): Promise<CacheHealthDetails> {
    return {
      connected: false,
      responseTime: 0,
      memoryUsage: 0,
      hitRatio: 0,
      evictions: 0
    };
  }

  /**
   * Основная проверка - состояние блокчейн подключений
   */
  protected async checkBlockchain(): Promise<BlockchainHealthDetails> {
    const startTime = Date.now();
    
    try {
      if (!this.blockchainManager) {
        // Попытка получить manager из глобального состояния
        try {
          const managerModule = await import('../blockchain/manager');
          this.blockchainManager = managerModule.default || managerModule.manager;
        } catch (importError) {
          throw new Error('Blockchain manager not available');
        }
      }

      // Получение списка поддерживаемых валют
      const supportedCurrencies = await this.blockchainManager.getSupportedCurrencies();
      const currencies: { [currency: string]: any } = {};
      let connectedNodes = 0;
      let totalPendingTxs = 0;
      let minBlockHeight = Number.MAX_SAFE_INTEGER;

      // Проверка каждой валюты
      for (const currency of supportedCurrencies) {
        try {
          const client = await this.blockchainManager.getClient(currency);
          
          if (!client) {
            currencies[currency] = {
              connected: false,
              lastBlock: 0,
              balance: '0',
              pendingTxs: 0,
              error: 'Client not available'
            };
            continue;
          }

          // Проверка подключения к ноде
          const isConnected = await client.isConnected();
          
          if (isConnected) {
            connectedNodes++;
            
            // Получение информации о блокчейне
            const [blockHeight, balance, pendingTxsCount] = await Promise.all([
              client.getCurrentBlockHeight().catch(() => 0),
              client.getBalance().catch(() => '0'),
              client.getPendingTransactionsCount().catch(() => 0)
            ]);

            currencies[currency] = {
              connected: true,
              lastBlock: blockHeight,
              balance: balance.toString(),
              pendingTxs: pendingTxsCount,
              nodeVersion: await client.getNodeVersion().catch(() => 'unknown'),
              networkName: await client.getNetworkName().catch(() => 'unknown'),
              peersCount: await client.getPeersCount().catch(() => 0)
            };

            totalPendingTxs += pendingTxsCount;
            if (blockHeight > 0 && blockHeight < minBlockHeight) {
              minBlockHeight = blockHeight;
            }

          } else {
            currencies[currency] = {
              connected: false,
              lastBlock: 0,
              balance: '0',
              pendingTxs: 0,
              error: 'Not connected to node'
            };
          }

        } catch (currencyError) {
          currencies[currency] = {
            connected: false,
            lastBlock: 0,
            balance: '0',
            pendingTxs: 0,
            error: currencyError instanceof Error ? currencyError.message : String(currencyError)
          };
        }
      }

      // Определение статуса синхронизации
      let syncStatus: 'synced' | 'syncing' | 'not_synced' = 'not_synced';
      if (connectedNodes > 0) {
        // Проверяем синхронизацию - здесь упрощенная логика
        const totalCurrencies = supportedCurrencies.length;
        const connectedRatio = connectedNodes / totalCurrencies;
        
        if (connectedRatio >= 0.8) {
          syncStatus = 'synced';
        } else if (connectedRatio >= 0.5) {
          syncStatus = 'syncing';
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        connectedNodes,
        syncStatus,
        lastBlockHeight: minBlockHeight === Number.MAX_SAFE_INTEGER ? 0 : minBlockHeight,
        pendingTransactions: totalPendingTxs,
        responseTime,
        currencies
      };

    } catch (error) {
      this.logger.error('Blockchain health check failed', { error });
      
      return {
        connectedNodes: 0,
        syncStatus: 'not_synced',
        lastBlockHeight: 0,
        pendingTransactions: 0,
        responseTime: Date.now() - startTime,
        currencies: {},
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Проверка состояния RabbitMQ для blockchain events
   */
  protected async checkMessageQueue(): Promise<MessageQueueHealthDetails> {
    const startTime = Date.now();
    
    try {
      // Попытка импорта RabbitMQ модуля
      const rabbitModule = await import('../queue/rabbitmq');
      const rabbit = rabbitModule.default || rabbitModule.rabbit;
      
      if (!rabbit) {
        throw new Error('RabbitMQ connection not available');
      }

      // Проверка подключения
      const isConnected = await rabbit.isConnected();
      
      if (!isConnected) {
        throw new Error('Not connected to RabbitMQ');
      }

      // Получение информации о очередях блокчейн сервиса
      const queues = await rabbit.getQueuesInfo();
      const blockchainQueues: Record<string, any> = {};
      
      // Фильтруем только очереди блокчейн сервиса
      const blockchainQueueNames = [
        'blockchain.bitcoin.transactions',
        'blockchain.ethereum.transactions', 
        'blockchain.solana.transactions',
        'blockchain.tron.transactions',
        'blockchain.events',
        'blockchain.confirmations'
      ];

      for (const queueName of blockchainQueueNames) {
        const queueInfo = queues[queueName];
        if (queueInfo) {
          blockchainQueues[queueName] = {
            messages: queueInfo.messageCount || 0,
            consumers: queueInfo.consumerCount || 0,
            ready: queueInfo.messageCount || 0,
            unacked: queueInfo.unackedCount || 0
          };
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        queues: blockchainQueues,
        channels: await rabbit.getChannelsCount(),
        version: await rabbit.getVersion(),
        responseTime
      };

    } catch (error) {
      this.logger.error('RabbitMQ health check failed', { error });
      
      return {
        connected: false,
        queues: {},
        channels: 0,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Blockchain service обычно не использует Vault
   */
  protected async checkVault(): Promise<VaultHealthDetails> {
    return {
      sealed: true,
      standby: false,
      version: 'not_used',
      responseTime: 0
    };
  }

  /**
   * Blockchain service обычно не использует HSM
   */
  protected async checkHSM(): Promise<HSMHealthDetails> {
    return {
      connected: false,
      sessions: 0,
      slots: {}
    };
  }

  /**
   * Проверка зависимых сервисов
   */
  protected async checkDependencies(): Promise<DependencyHealthDetails[]> {
    const dependencies: DependencyHealthDetails[] = [];
    const checkPromises = [];

    // Основной backend
    checkPromises.push(
      this.checkDependencyService('backend',
        process.env.BACKEND_HOST || 'localhost',
        parseInt(process.env.BACKEND_PORT || '5000'),
        '/health'
      )
    );

    // Mixer API
    checkPromises.push(
      this.checkDependencyService('mixer-api',
        process.env.MIXER_API_HOST || 'localhost',
        parseInt(process.env.MIXER_API_PORT || '3000'),
        '/health'
      )
    );

    // Wallet service
    checkPromises.push(
      this.checkDependencyService('wallet-service',
        process.env.WALLET_SERVICE_HOST || 'localhost',
        parseInt(process.env.WALLET_SERVICE_PORT || '3002'),
        '/health'
      )
    );

    // Monitoring service
    checkPromises.push(
      this.checkDependencyService('monitoring-service',
        process.env.MONITORING_SERVICE_HOST || 'localhost',
        parseInt(process.env.MONITORING_SERVICE_PORT || '3004'),
        '/health'
      )
    );

    const results = await Promise.allSettled(checkPromises);
    
    const serviceNames = ['backend', 'mixer-api', 'wallet-service', 'monitoring-service'];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        dependencies.push(result.value);
      } else {
        dependencies.push({
          service: serviceNames[i],
          status: 'critical',
          responseTime: 0,
          lastChecked: new Date().toISOString(),
          error: result.reason?.message || 'Unknown error'
        });
      }
    }

    return dependencies;
  }

  /**
   * Кастомные проверки для blockchain service
   */
  protected async performCustomChecks(): Promise<Record<string, any>> {
    const customChecks: Record<string, any> = {};

    try {
      // Системные метрики
      const systemMetrics = await this.getSystemMetrics();
      customChecks.systemMetrics = systemMetrics;

      // Проверка доступности внешних blockchain API
      customChecks.externalAPIs = await this.checkExternalAPIs();

      // Проверка синхронизации блоков
      customChecks.blockSyncStatus = await this.checkBlockSyncStatus();

      // Проверка процессинга транзакций
      customChecks.transactionProcessing = await this.checkTransactionProcessing();

      // Проверка Node.js процесса
      customChecks.nodeProcess = {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      };

    } catch (error) {
      customChecks.error = error instanceof Error ? error.message : String(error);
    }

    return customChecks;
  }

  /**
   * Проверка конкретного зависимого сервиса
   */
  private async checkDependencyService(
    serviceName: string,
    host: string,
    port: number,
    path: string
  ): Promise<DependencyHealthDetails> {
    const url = `http://${host}:${port}${path}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeouts.dependencies)
      });
      const responseTime = Date.now() - startTime;

      return {
        service: serviceName,
        status: response.ok ? 'healthy' : 'critical',
        responseTime,
        lastChecked: new Date().toISOString(),
        error: response.ok ? undefined : `HTTP ${response.status}`
      };

    } catch (error) {
      return {
        service: serviceName,
        status: 'critical',
        responseTime: 0,
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Получение системных метрик
   */
  private async getSystemMetrics(): Promise<{
    cpu: number;
    memory: { used: number; total: number; percentage: number };
    disk: { used: number; total: number; percentage: number };
  }> {
    const os = require('os');
    
    // CPU usage (упрощенный расчет)
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    
    // Memory usage
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();
    const memoryPercentage = (usedMemory / totalMemory) * 100;
    
    return {
      cpu: Math.min(100, Math.max(0, cpuUsage)),
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: memoryPercentage
      },
      disk: {
        used: 0,
        total: 0,
        percentage: 0
      }
    };
  }

  /**
   * Проверка внешних blockchain API
   */
  private async checkExternalAPIs(): Promise<{ [api: string]: { status: boolean; responseTime: number } }> {
    const apis: { [api: string]: { status: boolean; responseTime: number } } = {};
    
    const externalAPIs = [
      { name: 'bitcoin-rpc', url: process.env.BITCOIN_RPC_URL },
      { name: 'ethereum-rpc', url: process.env.ETHEREUM_RPC_URL },
      { name: 'solana-rpc', url: process.env.SOLANA_RPC_URL },
      { name: 'tron-api', url: process.env.TRON_API_URL }
    ];

    for (const api of externalAPIs) {
      if (!api.url) {
        apis[api.name] = { status: false, responseTime: 0 };
        continue;
      }

      try {
        const startTime = Date.now();
        const response = await fetch(api.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'getbestblockhash', params: [] }),
          signal: AbortSignal.timeout(5000)
        });
        const responseTime = Date.now() - startTime;
        
        apis[api.name] = {
          status: response.ok,
          responseTime
        };
      } catch (error) {
        apis[api.name] = { status: false, responseTime: 0 };
      }
    }

    return apis;
  }

  /**
   * Проверка статуса синхронизации блоков
   */
  private async checkBlockSyncStatus(): Promise<{
    syncing: boolean;
    blocksAnalyzed: number;
    averageBlockTime: number;
  }> {
    try {
      if (!this.blockchainManager) {
        return { syncing: false, blocksAnalyzed: 0, averageBlockTime: 0 };
      }

      const syncInfo = await this.blockchainManager.getSyncStatus();
      return {
        syncing: syncInfo.syncing || false,
        blocksAnalyzed: syncInfo.blocksAnalyzed || 0,
        averageBlockTime: syncInfo.averageBlockTime || 0
      };
    } catch (error) {
      return { syncing: false, blocksAnalyzed: 0, averageBlockTime: 0 };
    }
  }

  /**
   * Проверка процессинга транзакций
   */
  private async checkTransactionProcessing(): Promise<{
    processedCount: number;
    errorCount: number;
    averageProcessingTime: number;
  }> {
    try {
      if (!this.blockchainManager) {
        return { processedCount: 0, errorCount: 0, averageProcessingTime: 0 };
      }

      const processingStats = await this.blockchainManager.getTransactionStats();
      return {
        processedCount: processingStats.processedCount || 0,
        errorCount: processingStats.errorCount || 0,
        averageProcessingTime: processingStats.averageProcessingTime || 0
      };
    } catch (error) {
      return { processedCount: 0, errorCount: 0, averageProcessingTime: 0 };
    }
  }

  /**
   * Очистка ресурсов
   */
  public async cleanup(): Promise<void> {
    // Очистка подключений к блокчейнам
    if (this.blockchainManager) {
      try {
        await this.blockchainManager.closeAllConnections();
      } catch (error) {
        this.logger.error('Error closing blockchain connections', { error });
      }
    }
  }
}

export default BlockchainServiceHealthChecker;