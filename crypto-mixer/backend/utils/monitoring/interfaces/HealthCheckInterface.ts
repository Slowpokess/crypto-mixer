/**
 * Универсальный интерфейс для Health Check во всех сервисах crypto-mixer
 * Обеспечивает единообразную реализацию проверок состояния
 */

export interface HealthCheckStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  timestamp: string;
  service: string;
  version?: string;
  uptime: number;
  details: {
    database?: DatabaseHealthDetails;
    cache?: CacheHealthDetails;
    blockchain?: BlockchainHealthDetails;
    messageQueue?: MessageQueueHealthDetails;
    vault?: VaultHealthDetails;
    hsm?: HSMHealthDetails;
    dependencies?: DependencyHealthDetails[];
    custom?: Record<string, any>;
  };
  responseTime: number;
  environment: string;
}

export interface DatabaseHealthDetails {
  connected: boolean;
  responseTime: number;
  activeConnections: number;
  maxConnections: number;
  lastQuery: string;
  version?: string;
  replicationLag?: number;
}

export interface CacheHealthDetails {
  connected: boolean;
  responseTime: number;
  memoryUsage: number;
  hitRatio: number;
  evictions: number;
  version?: string;
}

export interface BlockchainHealthDetails {
  connectedNodes: number;
  syncStatus: 'synced' | 'syncing' | 'not_synced';
  lastBlockHeight: number;
  pendingTransactions: number;
  responseTime: number;
  currencies: {
    [currency: string]: {
      connected: boolean;
      lastBlock: number;
      balance: string;
      pendingTxs: number;
    };
  };
}

export interface MessageQueueHealthDetails {
  connected: boolean;
  queues: {
    [queueName: string]: {
      messages: number;
      consumers: number;
      ready: number;
      unacked: number;
    };
  };
  channels: number;
  version?: string;
  responseTime?: number;
}

export interface VaultHealthDetails {
  sealed: boolean;
  standby: boolean;
  version: string;
  responseTime: number;
  lastAuthentication?: string;
}

export interface HSMHealthDetails {
  connected: boolean;
  sessions: number;
  slots: {
    [slotId: string]: {
      connected: boolean;
      label: string;
      keyCount: number;
      serialNumber?: string;
      manufacturerId?: string;
      firmwareVersion?: string;
      freeMemory?: number;
      totalMemory?: number;
      error?: string;
    };
  };
  version?: string;
  responseTime?: number;
  cryptoTestPassed?: boolean;
  libraryPath?: string;
  capabilities?: string[];
  error?: string;
}

export interface DependencyHealthDetails {
  service: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  responseTime: number;
  lastChecked: string;
  error?: string;
}

export interface HealthCheckConfig {
  enabledChecks: {
    database: boolean;
    cache: boolean;
    blockchain: boolean;
    messageQueue: boolean;
    vault: boolean;
    hsm: boolean;
    dependencies: boolean;
  };
  timeouts: {
    database: number;
    cache: number;
    blockchain: number;
    messageQueue: number;
    vault: number;
    hsm: number;
    dependencies: number;
  };
  intervals: {
    healthCheck: number;
    metricsCollection: number;
  };
  thresholds: {
    responseTime: {
      warning: number;
      critical: number;
    };
    memoryUsage: {
      warning: number;
      critical: number;
    };
    diskUsage: {
      warning: number;
      critical: number;
    };
    cpuUsage: {
      warning: number;
      critical: number;
    };
  };
}

/**
 * Абстрактный базовый класс для реализации Health Check в сервисах
 */
export abstract class BaseHealthChecker {
  protected serviceName: string;
  protected version: string;
  protected startTime: Date;
  protected config: HealthCheckConfig;
  
  constructor(serviceName: string, version: string, config?: Partial<HealthCheckConfig>) {
    this.serviceName = serviceName;
    this.version = version;
    this.startTime = new Date();
    this.config = this.buildDefaultConfig(config);
  }

  /**
   * Основной метод для получения полного статуса здоровья сервиса
   */
  public async getHealthStatus(): Promise<HealthCheckStatus> {
    const startTime = Date.now();
    
    try {
      const healthDetails = await this.performHealthChecks();
      const responseTime = Date.now() - startTime;
      
      return {
        status: this.determineOverallStatus(healthDetails),
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        version: this.version,
        uptime: this.getUptime(),
        details: healthDetails,
        responseTime,
        environment: process.env.NODE_ENV || 'development'
      };
    } catch (error) {
      return {
        status: 'critical',
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        version: this.version,
        uptime: this.getUptime(),
        details: {
          custom: {
            error: error instanceof Error ? error.message : String(error)
          }
        },
        responseTime: Date.now() - startTime,
        environment: process.env.NODE_ENV || 'development'
      };
    }
  }

  /**
   * Выполнение всех настроенных проверок здоровья
   */
  protected async performHealthChecks(): Promise<HealthCheckStatus['details']> {
    const details: HealthCheckStatus['details'] = {};
    
    // Параллельное выполнение всех проверок
    const checks = [];
    
    if (this.config.enabledChecks.database) {
      checks.push(
        this.checkDatabase().then(result => ({ database: result })).catch(error => ({
          database: { connected: false, responseTime: 0, activeConnections: 0, maxConnections: 0, lastQuery: '', error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.cache) {
      checks.push(
        this.checkCache().then(result => ({ cache: result })).catch(error => ({
          cache: { connected: false, responseTime: 0, memoryUsage: 0, hitRatio: 0, evictions: 0, error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.blockchain) {
      checks.push(
        this.checkBlockchain().then(result => ({ blockchain: result })).catch(error => ({
          blockchain: { connectedNodes: 0, syncStatus: 'not_synced' as const, lastBlockHeight: 0, pendingTransactions: 0, responseTime: 0, currencies: {}, error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.messageQueue) {
      checks.push(
        this.checkMessageQueue().then(result => ({ messageQueue: result })).catch(error => ({
          messageQueue: { connected: false, queues: {}, channels: 0, error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.vault) {
      checks.push(
        this.checkVault().then(result => ({ vault: result })).catch(error => ({
          vault: { sealed: true, standby: false, version: '', responseTime: 0, error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.hsm) {
      checks.push(
        this.checkHSM().then(result => ({ hsm: result })).catch(error => ({
          hsm: { connected: false, sessions: 0, slots: {}, error: error.message }
        }))
      );
    }
    
    if (this.config.enabledChecks.dependencies) {
      checks.push(
        this.checkDependencies().then(result => ({ dependencies: result })).catch(error => ({
          dependencies: [{ service: 'unknown', status: 'critical' as const, responseTime: 0, lastChecked: new Date().toISOString(), error: error.message }]
        }))
      );
    }

    // Ожидание всех проверок
    const results = await Promise.all(checks);
    
    // Объединение результатов
    for (const result of results) {
      Object.assign(details, result);
    }
    
    // Добавление кастомных проверок
    const customChecks = await this.performCustomChecks();
    if (Object.keys(customChecks).length > 0) {
      details.custom = customChecks;
    }
    
    return details;
  }

  /**
   * Определение общего статуса на основе результатов проверок
   */
  protected determineOverallStatus(details: HealthCheckStatus['details']): 'healthy' | 'warning' | 'critical' | 'unknown' {
    let hasWarning = false;
    let hasCritical = false;
    
    // Проверка базы данных (критично)
    if (details.database && !details.database.connected) {
      hasCritical = true;
    }
    
    // Проверка кэша (предупреждение)
    if (details.cache && !details.cache.connected) {
      hasWarning = true;
    }
    
    // Проверка блокчейна (зависит от сервиса)
    if (details.blockchain && details.blockchain.connectedNodes === 0) {
      hasWarning = true;
    }
    
    // Проверка очередей сообщений (критично)
    if (details.messageQueue && !details.messageQueue.connected) {
      hasCritical = true;
    }
    
    // Проверка Vault (критично если sealed)
    if (details.vault && details.vault.sealed) {
      hasCritical = true;
    }
    
    // Проверка HSM (предупреждение)
    if (details.hsm && !details.hsm.connected) {
      hasWarning = true;
    }
    
    // Проверка зависимостей
    if (details.dependencies) {
      for (const dep of details.dependencies) {
        if (dep.status === 'critical') {
          hasCritical = true;
        } else if (dep.status === 'warning') {
          hasWarning = true;
        }
      }
    }
    
    if (hasCritical) return 'critical';
    if (hasWarning) return 'warning';
    return 'healthy';
  }

  /**
   * Получение времени работы сервиса в секундах
   */
  protected getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Построение конфигурации по умолчанию
   */
  protected buildDefaultConfig(partialConfig?: Partial<HealthCheckConfig>): HealthCheckConfig {
    const defaultConfig: HealthCheckConfig = {
      enabledChecks: {
        database: true,
        cache: true,
        blockchain: false,
        messageQueue: true,
        vault: false,
        hsm: false,
        dependencies: true
      },
      timeouts: {
        database: 5000,
        cache: 2000,
        blockchain: 10000,
        messageQueue: 5000,
        vault: 5000,
        hsm: 10000,
        dependencies: 5000
      },
      intervals: {
        healthCheck: 30000,
        metricsCollection: 10000
      },
      thresholds: {
        responseTime: {
          warning: 1000,
          critical: 5000
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
          warning: 80,
          critical: 90
        }
      }
    };

    return {
      ...defaultConfig,
      ...partialConfig,
      enabledChecks: { ...defaultConfig.enabledChecks, ...partialConfig?.enabledChecks },
      timeouts: { ...defaultConfig.timeouts, ...partialConfig?.timeouts },
      intervals: { ...defaultConfig.intervals, ...partialConfig?.intervals },
      thresholds: { ...defaultConfig.thresholds, ...partialConfig?.thresholds }
    };
  }

  // Абстрактные методы для реализации в наследниках
  protected abstract checkDatabase(): Promise<DatabaseHealthDetails>;
  protected abstract checkCache(): Promise<CacheHealthDetails>;
  protected abstract checkBlockchain(): Promise<BlockchainHealthDetails>;
  protected abstract checkMessageQueue(): Promise<MessageQueueHealthDetails>;
  protected abstract checkVault(): Promise<VaultHealthDetails>;
  protected abstract checkHSM(): Promise<HSMHealthDetails>;
  protected abstract checkDependencies(): Promise<DependencyHealthDetails[]>;
  protected abstract performCustomChecks(): Promise<Record<string, any>>;
}

/**
 * Утилитарные функции для работы с health checks
 */
export class HealthCheckUtils {
  /**
   * Создание стандартного HTTP endpoint для health check
   */
  static createHealthEndpoint(healthChecker: BaseHealthChecker) {
    return async (_req: any, res: any) => {
      try {
        const healthStatus = await healthChecker.getHealthStatus();
        const httpStatus = healthStatus.status === 'healthy' ? 200 :
                          healthStatus.status === 'warning' ? 200 :
                          healthStatus.status === 'critical' ? 503 : 500;
        
        res.status(httpStatus).json(healthStatus);
      } catch (error) {
        res.status(500).json({
          status: 'critical',
          timestamp: new Date().toISOString(),
          service: 'unknown',
          error: (error as Error).message || String(error)
        });
      }
    };
  }

  /**
   * Проверка HTTP сервиса с таймаутом
   */
  static async checkHttpService(
    url: string,
    timeout: number = 5000,
    expectedStatus: number = 200
  ): Promise<{ status: boolean; responseTime: number; httpStatus?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout)
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: response.status === expectedStatus,
        responseTime,
        httpStatus: response.status
      };
    } catch (error) {
      return {
        status: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Проверка TCP порта
   */
  static async checkTcpPort(
    host: string,
    port: number,
    timeout: number = 5000
  ): Promise<{ status: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({
          status: false,
          responseTime: Date.now() - startTime,
          error: `Connection timeout after ${timeout}ms`
        });
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          status: true,
          responseTime: Date.now() - startTime
        });
      });

      socket.on('error', (error: Error) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          status: false,
          responseTime: Date.now() - startTime,
          error: error.message
        });
      });
    });
  }

  /**
   * Форматирование времени работы
   */
  static formatUptime(uptimeSeconds: number): string {
    const days = Math.floor(uptimeSeconds / (24 * 3600));
    const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    
    return parts.join(' ');
  }

  /**
   * Получение системных метрик
   */
  static async getSystemMetrics(): Promise<{
    cpu: number;
    memory: { used: number; total: number; percentage: number };
    disk: { used: number; total: number; percentage: number };
    network: { bytesIn: number; bytesOut: number };
  }> {
    const os = require('os');
    const fs = require('fs').promises;
    
    // CPU usage (simplified)
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    
    // Memory usage
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();
    const memoryPercentage = (usedMemory / totalMemory) * 100;
    
    // Disk usage (simplified - для корневого раздела)
    let diskUsage = { used: 0, total: 0, percentage: 0 };
    try {
      const stats = await fs.stat('/');
      diskUsage = {
        used: stats.size || 0,
        total: stats.size || 0,
        percentage: 0
      };
    } catch (error) {
      // Игнорируем ошибки получения статистики диска
    }
    
    return {
      cpu: Math.min(100, Math.max(0, cpuUsage)),
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: memoryPercentage
      },
      disk: diskUsage,
      network: {
        bytesIn: 0, // Будет реализовано при необходимости
        bytesOut: 0
      }
    };
  }
}