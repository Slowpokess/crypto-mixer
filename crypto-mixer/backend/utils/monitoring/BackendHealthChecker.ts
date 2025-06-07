import { 
  BaseHealthChecker, 
  DatabaseHealthDetails, 
  CacheHealthDetails, 
  BlockchainHealthDetails,
  MessageQueueHealthDetails,
  VaultHealthDetails,
  HSMHealthDetails,
  DependencyHealthDetails,
  HealthCheckConfig,
  HealthCheckUtils
} from './interfaces/HealthCheckInterface';
import { DatabaseManager } from '../../database/DatabaseManager';

// Глобальная ссылка на экземпляр DatabaseManager (будет устанавливаться в server.ts)
let globalDbManager: DatabaseManager | null = null;

export function setGlobalDatabaseManager(dbManager: DatabaseManager): void {
  globalDbManager = dbManager;
}
import { enhancedDbLogger } from '../logger';
import * as redis from 'redis';

/**
 * Реализация Health Check для основного Backend сервиса crypto-mixer
 * Проверяет все критически важные компоненты системы
 */
export class BackendHealthChecker extends BaseHealthChecker {
  private static instance: BackendHealthChecker | null = null;
  private redisClient: redis.RedisClientType | null = null;

  constructor() {
    super('crypto-mixer-backend', process.env.npm_package_version || '1.0.0', {
      enabledChecks: {
        database: true,
        cache: true,
        blockchain: false, // Backend не напрямую связан с блокчейном
        messageQueue: true,
        vault: process.env.VAULT_ENABLED === 'true',
        hsm: process.env.HSM_ENABLED === 'true',
        dependencies: true
      },
      timeouts: {
        database: 10000,
        cache: 5000,
        blockchain: 0,
        messageQueue: 8000,
        vault: 8000,
        hsm: 15000,
        dependencies: 10000
      },
      thresholds: {
        responseTime: {
          warning: 2000,
          critical: 10000
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
  }

  /**
   * Получение синглтон экземпляра
   */
  public static getInstance(): BackendHealthChecker {
    if (!BackendHealthChecker.instance) {
      BackendHealthChecker.instance = new BackendHealthChecker();
    }
    return BackendHealthChecker.instance;
  }

  /**
   * Проверка состояния PostgreSQL базы данных
   */
  protected async checkDatabase(): Promise<DatabaseHealthDetails> {
    const startTime = Date.now();
    
    try {
      if (!globalDbManager) {
        throw new Error('Database manager not initialized');
      }
      
      const dbManager = globalDbManager;
      
      // Используем встроенный healthCheck метод
      const healthResult = await dbManager.healthCheck();
      
      // Получение версии PostgreSQL
      let version = 'unknown';
      let activeConnections = 0;
      let maxConnections = 100;
      
      try {
        const versionResult = await dbManager.query('SELECT version() as pg_version');
        if (Array.isArray(versionResult) && versionResult[0]) {
          version = (versionResult[0] as any).pg_version?.split(' ')[1] || 'unknown';
        }
        
        // Получение статистики активных подключений
        const connectionStats = await dbManager.query(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            max_conn.setting::int as max_connections
          FROM pg_stat_activity 
          CROSS JOIN (SELECT setting FROM pg_settings WHERE name = 'max_connections') max_conn
        `);
        
        if (Array.isArray(connectionStats) && connectionStats[0]) {
          const stats = connectionStats[0] as any;
          activeConnections = parseInt(stats.active_connections || '0');
          maxConnections = parseInt(stats.max_connections || '100');
        }
      } catch (error) {
        // Игнорируем ошибки получения дополнительной информации
      }

      const responseTime = Date.now() - startTime;

      return {
        connected: healthResult.status !== 'critical',
        responseTime,
        activeConnections,
        maxConnections,
        lastQuery: `Health check completed (${responseTime}ms)`,
        version,
        replicationLag: 0
      };

    } catch (error) {
      enhancedDbLogger.error('❌ Database health check failed', { error });
      
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
   * Проверка состояния Redis кэша
   */
  protected async checkCache(): Promise<CacheHealthDetails> {
    const startTime = Date.now();
    
    try {
      // Создание подключения к Redis если его нет
      if (!this.redisClient) {
        this.redisClient = redis.createClient({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          connectTimeout: this.config.timeouts.cache
        });
      }

      // Подключение если не подключен
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }
      
      // Выполнение PING команды
      await this.redisClient.ping();
      
      // Получение информации о памяти
      const info = await this.redisClient.info('memory');
      const memoryLines = info.split('\r\n');
      
      const usedMemory = this.extractInfoValue(memoryLines, 'used_memory');
      const maxMemory = this.extractInfoValue(memoryLines, 'maxmemory') || usedMemory * 2;
      const memoryUsage = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;
      
      // Получение статистики попаданий в кэш
      const statsInfo = await this.redisClient.info('stats');
      const statsLines = statsInfo.split('\r\n');
      
      const keyspaceHits = this.extractInfoValue(statsLines, 'keyspace_hits');
      const keyspaceMisses = this.extractInfoValue(statsLines, 'keyspace_misses');
      const totalRequests = keyspaceHits + keyspaceMisses;
      const hitRatio = totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 100;
      
      const evictions = this.extractInfoValue(statsLines, 'evicted_keys');
      
      // Получение версии Redis
      const serverInfo = await this.redisClient.info('server');
      const serverLines = serverInfo.split('\r\n');
      const version = this.extractInfoStringValue(serverLines, 'redis_version');

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        responseTime,
        memoryUsage,
        hitRatio,
        evictions,
        version
      };

    } catch (error) {
      enhancedDbLogger.error('❌ Redis health check failed', { error });
      
      // Попытка закрыть проблемное соединение
      if (this.redisClient) {
        try {
          await this.redisClient.quit();
        } catch (e) {
          // Игнорируем ошибки при закрытии
        }
        this.redisClient = null;
      }
      
      return {
        connected: false,
        responseTime: Date.now() - startTime,
        memoryUsage: 0,
        hitRatio: 0,
        evictions: 0
      };
    }
  }

  /**
   * Backend сервис не работает напрямую с блокчейном
   */
  protected async checkBlockchain(): Promise<BlockchainHealthDetails> {
    return {
      connectedNodes: 0,
      syncStatus: 'not_synced',
      lastBlockHeight: 0,
      pendingTransactions: 0,
      responseTime: 0,
      currencies: {}
    };
  }

  /**
   * Проверка состояния RabbitMQ
   */
  protected async checkMessageQueue(): Promise<MessageQueueHealthDetails> {
    const startTime = Date.now();
    
    try {
      const host = process.env.RABBITMQ_HOST || 'localhost';
      const port = parseInt(process.env.RABBITMQ_PORT || '15672'); // Management API port
      const user = process.env.RABBITMQ_USER || 'guest';
      const pass = process.env.RABBITMQ_PASS || 'guest';
      
      // Проверка через Management API
      const url = `http://${host}:${port}/api/overview`;
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeouts.messageQueue)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      // Получение информации о очередях
      const queuesUrl = `http://${host}:${port}/api/queues`;
      const queuesResponse = await fetch(queuesUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeouts.messageQueue)
      });

      const queues: Record<string, any> = {};
      if (queuesResponse.ok) {
        const queuesData = await queuesResponse.json() as any[];
        
        for (const queue of queuesData) {
          queues[queue.name] = {
            messages: queue.messages || 0,
            consumers: queue.consumers || 0,
            ready: queue.messages_ready || 0,
            unacked: queue.messages_unacknowledged || 0
          };
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        queues,
        channels: data.object_totals?.channels || 0,
        version: data.rabbitmq_version,
        responseTime
      };

    } catch (error) {
      enhancedDbLogger.error('❌ RabbitMQ health check failed', { error });
      
      // Fallback - проверка TCP порта 5672
      const tcpCheck = await HealthCheckUtils.checkTcpPort(
        process.env.RABBITMQ_HOST || 'localhost',
        parseInt(process.env.RABBITMQ_AMQP_PORT || '5672'),
        3000
      );
      
      return {
        connected: tcpCheck.status,
        queues: {},
        channels: 0
      };
    }
  }

  /**
   * Проверка состояния HashiCorp Vault
   */
  protected async checkVault(): Promise<VaultHealthDetails> {
    const startTime = Date.now();
    
    try {
      const host = process.env.VAULT_HOST || 'localhost';
      const port = parseInt(process.env.VAULT_PORT || '8200');
      const url = `http://${host}:${port}/v1/sys/health`;
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeouts.vault)
      });

      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        // Vault может возвращать различные статусы в зависимости от состояния
        if (response.status === 503) {
          // Vault запечатан
          return {
            sealed: true,
            standby: false,
            version: 'unknown',
            responseTime
          };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const health = await response.json() as any;
      
      return {
        sealed: health.sealed || false,
        standby: health.standby || false,
        version: health.version || 'unknown',
        responseTime,
        lastAuthentication: new Date().toISOString()
      };

    } catch (error) {
      enhancedDbLogger.error('❌ Vault health check failed', { error });
      
      return {
        sealed: true,
        standby: false,
        version: 'unknown',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Проверка состояния HSM (Hardware Security Module)
   */
  protected async checkHSM(): Promise<HSMHealthDetails> {
    const startTime = Date.now();
    
    try {
      // Реальная проверка HSM через PKCS#11 интерфейс
      const hsmManager = await this.getHSMManager();
      
      if (!hsmManager) {
        throw new Error('HSM Manager not available');
      }
      
      // Проверка инициализации HSM
      const isInitialized = await hsmManager.isInitialized();
      if (!isInitialized) {
        throw new Error('HSM not initialized');
      }
      
      // Получение информации о слотах
      const slots = await hsmManager.getSlotInfo();
      const slotsInfo: { [slotId: string]: any } = {};
      
      for (const slot of slots) {
        try {
          // Проверка каждого слота
          const slotStatus = await hsmManager.getSlotStatus(slot.id);
          const tokenInfo = await hsmManager.getTokenInfo(slot.id);
          
          slotsInfo[slot.id.toString()] = {
            connected: slotStatus.connected,
            label: tokenInfo.label || `Slot ${slot.id}`,
            keyCount: await hsmManager.getKeyCount(slot.id),
            serialNumber: tokenInfo.serialNumber,
            manufacturerId: tokenInfo.manufacturerId,
            firmwareVersion: tokenInfo.firmwareVersion,
            freeMemory: tokenInfo.freePublicMemory,
            totalMemory: tokenInfo.totalPublicMemory
          };
        } catch (slotError) {
          enhancedDbLogger.warn(`❌ HSM Slot ${slot.id} check failed`, { error: slotError });
          slotsInfo[slot.id.toString()] = {
            connected: false,
            label: `Slot ${slot.id} (Error)`,
            keyCount: 0,
            error: slotError instanceof Error ? slotError.message : String(slotError)
          };
        }
      }
      
      // Проверка активных сессий
      const activeSessions = await hsmManager.getActiveSessionsCount();
      
      // Тест криптографических операций
      let cryptoTestResult = false;
      try {
        cryptoTestResult = await hsmManager.testCryptographicOperations();
      } catch (cryptoError) {
        enhancedDbLogger.warn('❌ HSM crypto test failed', { error: cryptoError });
      }
      
      // Получение версии HSM
      const version = await hsmManager.getLibraryVersion();
      
      const responseTime = Date.now() - startTime;
      
      // Определение общего статуса подключения
      const connectedSlots = Object.values(slotsInfo).filter((slot: any) => slot.connected);
      const isConnected = connectedSlots.length > 0 && cryptoTestResult;
      
      return {
        connected: isConnected,
        sessions: activeSessions,
        slots: slotsInfo,
        version,
        responseTime,
        cryptoTestPassed: cryptoTestResult,
        libraryPath: hsmManager.getLibraryPath(),
        capabilities: await hsmManager.getCapabilities()
      };

    } catch (error) {
      enhancedDbLogger.error('❌ HSM health check failed', { error });
      
      const responseTime = Date.now() - startTime;
      
      return {
        connected: false,
        sessions: 0,
        slots: {},
        responseTime,
        error: error instanceof Error ? error.message : String(error),
        cryptoTestPassed: false
      };
    }
  }
  
  /**
   * Получение экземпляра HSM Manager
   */
  private async getHSMManager(): Promise<any> {
    try {
      // Динамический импорт HSM Manager
      const HSMManagerModule = await import('../../security/HSMManager');
      // Проверяем есть ли HSMManager в модуле
      if (HSMManagerModule && typeof HSMManagerModule === 'object') {
        const HSMManager = (HSMManagerModule as any).HSMManager;
        if (HSMManager && typeof HSMManager.getInstance === 'function') {
          return HSMManager.getInstance();
        }
        // Альтернативный экспорт
        if (typeof (HSMManagerModule as any).default?.getInstance === 'function') {
          return (HSMManagerModule as any).default.getInstance();
        }
        // Создание нового экземпляра если нет getInstance
        if (typeof HSMManager === 'function') {
          return new HSMManager();
        }
      }
      throw new Error('HSMManager class not found or not properly exported');
    } catch (error) {
      // HSM Manager может быть недоступен в некоторых конфигурациях
      enhancedDbLogger.debug('HSM Manager not available', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Проверка состояния зависимых сервисов
   */
  protected async checkDependencies(): Promise<DependencyHealthDetails[]> {
    const dependencies: DependencyHealthDetails[] = [];
    const checkPromises = [];

    // Mixer API сервис
    checkPromises.push(
      this.checkDependencyService('mixer-api', 
        process.env.MIXER_API_HOST || 'localhost',
        parseInt(process.env.MIXER_API_PORT || '3000'),
        '/health'
      )
    );

    // Blockchain сервис
    checkPromises.push(
      this.checkDependencyService('blockchain-service',
        process.env.BLOCKCHAIN_SERVICE_HOST || 'localhost',
        parseInt(process.env.BLOCKCHAIN_SERVICE_PORT || '3001'),
        '/health'
      )
    );

    // Wallet сервис
    checkPromises.push(
      this.checkDependencyService('wallet-service',
        process.env.WALLET_SERVICE_HOST || 'localhost',
        parseInt(process.env.WALLET_SERVICE_PORT || '3002'),
        '/health'
      )
    );

    // Scheduler сервис
    checkPromises.push(
      this.checkDependencyService('scheduler-service',
        process.env.SCHEDULER_SERVICE_HOST || 'localhost',
        parseInt(process.env.SCHEDULER_SERVICE_PORT || '3003'),
        '/health'
      )
    );

    // Monitoring сервис
    checkPromises.push(
      this.checkDependencyService('monitoring-service',
        process.env.MONITORING_SERVICE_HOST || 'localhost',
        parseInt(process.env.MONITORING_SERVICE_PORT || '3004'),
        '/health'
      )
    );

    const results = await Promise.allSettled(checkPromises);
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        dependencies.push(result.value);
      } else {
        dependencies.push({
          service: ['mixer-api', 'blockchain-service', 'wallet-service', 'scheduler-service', 'monitoring-service'][i],
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
   * Выполнение кастомных проверок специфичных для backend
   */
  protected async performCustomChecks(): Promise<Record<string, any>> {
    const customChecks: Record<string, any> = {};

    try {
      // Проверка системных ресурсов
      const systemMetrics = await HealthCheckUtils.getSystemMetrics();
      customChecks.systemMetrics = systemMetrics;

      // Проверка доступного места на диске
      customChecks.diskSpace = await this.checkDiskSpace();

      // Проверка состояния логов
      customChecks.logging = await this.checkLoggingSystem();

      // Проверка конфигурации
      customChecks.configuration = this.checkConfiguration();

      // Проверка процессов Node.js
      customChecks.nodeProcess = this.checkNodeProcess();

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
      const checkResult = await HealthCheckUtils.checkHttpService(
        url,
        this.config.timeouts.dependencies,
        200
      );

      return {
        service: serviceName,
        status: checkResult.status ? 'healthy' : 'critical',
        responseTime: checkResult.responseTime,
        lastChecked: new Date().toISOString(),
        error: checkResult.error
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
   * Проверка доступного места на диске
   */
  private async checkDiskSpace(): Promise<{ available: number; total: number; percentage: number }> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const stats = await fs.statfs(path.resolve('./'));
      const total = stats.bavail * stats.bsize;
      const available = stats.bavail * stats.bsize;
      const used = (stats.blocks - stats.bavail) * stats.bsize;
      const percentage = total > 0 ? (used / total) * 100 : 0;

      return {
        available,
        total,
        percentage
      };
    } catch (error) {
      return {
        available: 0,
        total: 0,
        percentage: 0
      };
    }
  }

  /**
   * Проверка системы логирования
   */
  private async checkLoggingSystem(): Promise<{ 
    operational: boolean; 
    lastLogTime?: string; 
    logLevel: string;
    errors: number;
  }> {
    try {
      // Проверка, что логгер работает
      const testLogStart = Date.now();
      enhancedDbLogger.debug('Health check logging test');
      const logTime = Date.now() - testLogStart;

      return {
        operational: logTime < 1000,
        lastLogTime: new Date().toISOString(),
        logLevel: process.env.LOG_LEVEL || 'info',
        errors: 0
      };
    } catch (error) {
      return {
        operational: false,
        logLevel: 'unknown',
        errors: 1
      };
    }
  }

  /**
   * Проверка конфигурации
   */
  private checkConfiguration(): { 
    valid: boolean; 
    missingEnvVars: string[];
    environment: string;
  } {
    const requiredEnvVars = [
      'NODE_ENV',
      'DATABASE_URL',
      'REDIS_HOST'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    return {
      valid: missingEnvVars.length === 0,
      missingEnvVars,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Проверка процесса Node.js
   */
  private checkNodeProcess(): {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
    platform: string;
  } {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Извлечение числового значения из Redis INFO
   */
  private extractInfoValue(lines: string[], key: string): number {
    const line = lines.find(l => l.startsWith(`${key}:`));
    return line ? parseInt(line.split(':')[1]) || 0 : 0;
  }

  /**
   * Извлечение строкового значения из Redis INFO
   */
  private extractInfoStringValue(lines: string[], key: string): string {
    const line = lines.find(l => l.startsWith(`${key}:`));
    return line ? line.split(':')[1] || 'unknown' : 'unknown';
  }

  /**
   * Очистка ресурсов при завершении работы
   */
  public async cleanup(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        enhancedDbLogger.error('Error closing Redis connection', { error });
      }
      this.redisClient = null;
    }
  }
}

export default BackendHealthChecker;