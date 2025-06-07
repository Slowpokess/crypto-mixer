import { EventEmitter } from 'events';
import os from 'os';
import fs from 'fs';
import { promisify } from 'util';
import { execSync } from 'child_process';
import { enhancedDbLogger } from '../logger';
import { DatabaseManager } from '../../database/DatabaseManager';

/**
 * Интерфейсы для метрик производительности
 */
export interface SystemMetrics {
  cpu: {
    usage: number; // процент использования CPU
    loadAverage: number[]; // средняя нагрузка за 1, 5, 15 минут
    cores: number;
    speed: number; // MHz
  };
  memory: {
    total: number; // общая память в байтах
    used: number; // использованная память
    free: number; // свободная память
    available: number; // доступная память
    usage: number; // процент использования
    swap: {
      total: number;
      used: number;
      free: number;
    };
  };
  disk: {
    usage: number; // процент использования диска
    total: number; // общий размер в байтах
    used: number; // использованный размер
    free: number; // свободный размер
    iops: {
      read: number;
      write: number;
    };
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
    errors: number;
  };
}

export interface ApplicationMetrics {
  requests: {
    total: number;
    perSecond: number;
    errorRate: number;
    averageResponseTime: number;
    percentiles: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  database: {
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    queries: {
      total: number;
      perSecond: number;
      averageTime: number;
      slowQueries: number;
    };
    transactions: {
      total: number;
      perSecond: number;
      rollbacks: number;
    };
  };
  cache: {
    redis: {
      hitRate: number;
      missRate: number;
      evictions: number;
      memoryUsage: number;
      connections: number;
    };
  };
  queues: {
    rabbitmq: {
      messages: number;
      consumers: number;
      publishRate: number;
      consumeRate: number;
    };
  };
}

export interface BusinessMetrics {
  mixing: {
    operationsInProgress: number;
    operationsCompleted: number;
    operationsFailed: number;
    averageProcessingTime: number;
    totalVolume: {
      btc: number;
      eth: number;
      usdt: number;
      sol: number;
    };
    successRate: number;
  };
  wallets: {
    totalWallets: number;
    activeWallets: number;
    totalBalance: {
      btc: number;
      eth: number;
      usdt: number;
      sol: number;
    };
  };
  blockchain: {
    bitcoin: {
      connected: boolean;
      blockHeight: number;
      syncStatus: number;
      transactionPool: number;
    };
    ethereum: {
      connected: boolean;
      blockNumber: number;
      gasPrice: number;
      pendingTransactions: number;
    };
    solana: {
      connected: boolean;
      slot: number;
      epoch: number;
      transactionCount: number;
    };
  };
  security: {
    alertsActive: number;
    blockedTransactions: number;
    riskScore: number;
    amlChecks: number;
  };
}

export interface PerformanceSnapshot {
  timestamp: Date;
  system: SystemMetrics;
  application: ApplicationMetrics;
  business: BusinessMetrics;
  uptime: number;
  version: string;
}

export interface PerformanceConfig {
  enabled: boolean;
  collectInterval: number; // секунды между сбором метрик
  retentionPeriod: number; // секунды хранения метрик в памяти
  prometheusEnabled: boolean;
  prometheusPort: number;
  alerting: {
    enabled: boolean;
    thresholds: {
      cpu: number; // процент
      memory: number; // процент
      disk: number; // процент
      responseTime: number; // миллисекунды
      errorRate: number; // процент
    };
  };
  sampling: {
    enabled: boolean;
    rate: number; // процент запросов для сэмплирования
  };
}

/**
 * Система мониторинга производительности для crypto-mixer
 * Собирает системные, приложенческие и бизнес-метрики
 */
export class PerformanceMonitor extends EventEmitter {
  private config: PerformanceConfig;
  private isRunning: boolean = false;
  private collectInterval: NodeJS.Timeout | null = null;
  private metricsHistory: PerformanceSnapshot[] = [];
  private lastSnapshot: PerformanceSnapshot | null = null;
  
  // Счетчики для метрик приложения
  private requestCounter: number = 0;
  private responseTimes: number[] = [];
  private errorCounter: number = 0;
  private lastRequestTime: number = Date.now();
  
  // Кэш для системных метрик
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastNetworkStats: any = null;
  
  constructor(config: Partial<PerformanceConfig> = {}) {
    super();
    this.config = {
      enabled: process.env.PERFORMANCE_MONITORING === 'true',
      collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL || '30'),
      retentionPeriod: parseInt(process.env.METRICS_RETENTION_PERIOD || '3600'),
      prometheusEnabled: process.env.PROMETHEUS_ENABLED === 'true',
      prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9090'),
      alerting: {
        enabled: process.env.PERFORMANCE_ALERTING === 'true',
        thresholds: {
          cpu: parseFloat(process.env.CPU_ALERT_THRESHOLD || '80'),
          memory: parseFloat(process.env.MEMORY_ALERT_THRESHOLD || '85'),
          disk: parseFloat(process.env.DISK_ALERT_THRESHOLD || '90'),
          responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000'),
          errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5')
        }
      },
      sampling: {
        enabled: process.env.PERFORMANCE_SAMPLING === 'true',
        rate: parseFloat(process.env.SAMPLING_RATE || '10')
      },
      ...config
    };
  }

  /**
   * Запуск системы мониторинга производительности
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Performance Monitor уже запущен');
      return;
    }

    if (!this.config.enabled) {
      enhancedDbLogger.info('📊 Performance Monitor отключен в конфигурации');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('performance_monitor_start');

    try {
      enhancedDbLogger.info('📊 Запуск Performance Monitor', {
        collectInterval: this.config.collectInterval,
        retentionPeriod: this.config.retentionPeriod,
        prometheusEnabled: this.config.prometheusEnabled,
        alertingEnabled: this.config.alerting.enabled
      });

      this.isRunning = true;

      // Выполнение первичного сбора метрик
      await this.collectMetrics();

      // Запуск периодического сбора
      this.collectInterval = setInterval(async () => {
        try {
          await this.collectMetrics();
        } catch (error) {
          enhancedDbLogger.error('❌ Ошибка сбора метрик', { error });
        }
      }, this.config.collectInterval * 1000);

      // Запуск Prometheus endpoint если включен
      if (this.config.prometheusEnabled) {
        await this.startPrometheusEndpoint();
      }

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Performance Monitor запущен успешно');

    } catch (error) {
      this.isRunning = false;
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      throw error;
    }
  }

  /**
   * Остановка системы мониторинга
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    enhancedDbLogger.info('🛑 Остановка Performance Monitor');

    this.isRunning = false;

    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }

    enhancedDbLogger.info('✅ Performance Monitor остановлен');
  }

  /**
   * Сбор всех метрик производительности
   */
  private async collectMetrics(): Promise<void> {
    const startTime = Date.now();

    try {
      enhancedDbLogger.debug('🔍 Сбор метрик производительности');

      const [systemMetrics, applicationMetrics, businessMetrics] = await Promise.all([
        this.collectSystemMetrics(),
        this.collectApplicationMetrics(),
        this.collectBusinessMetrics()
      ]);

      const snapshot: PerformanceSnapshot = {
        timestamp: new Date(),
        system: systemMetrics,
        application: applicationMetrics,
        business: businessMetrics,
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      };

      // Сохранение снимка
      this.lastSnapshot = snapshot;
      this.metricsHistory.push(snapshot);

      // Очистка старых метрик
      this.cleanupOldMetrics();

      // Проверка пороговых значений и отправка алертов
      if (this.config.alerting.enabled) {
        this.checkThresholds(snapshot);
      }

      // Отправка события о новых метриках
      this.emit('metrics_collected', snapshot);

      const duration = Date.now() - startTime;
      enhancedDbLogger.debug('✅ Метрики собраны', {
        duration: `${duration}ms`,
        historySize: this.metricsHistory.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сбора метрик', { error });
      this.emit('metrics_error', error);
    }
  }

  /**
   * Сбор системных метрик
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    // CPU метрики
    const cpuUsage = process.cpuUsage(this.lastCpuUsage || undefined);
    this.lastCpuUsage = process.cpuUsage();
    const cpuPercent = this.calculateCpuPercent(cpuUsage);
    
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Память
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = (usedMem / totalMem) * 100;

    // Swap (для Linux/macOS)
    let swap = { total: 0, used: 0, free: 0 };
    try {
      if (process.platform === 'linux') {
        swap = await this.getSwapInfo();
      }
    } catch (error) {
      // Игнорируем ошибки получения swap
    }

    // Диск
    const diskInfo = await this.getDiskInfo();

    // Сеть
    const networkInfo = await this.getNetworkInfo();

    return {
      cpu: {
        usage: cpuPercent,
        loadAverage,
        cores: cpus.length,
        speed: cpus[0]?.speed || 0
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        available: freeMem,
        usage: memUsage,
        swap
      },
      disk: diskInfo,
      network: networkInfo
    };
  }

  /**
   * Сбор метрик приложения
   */
  private async collectApplicationMetrics(): Promise<ApplicationMetrics> {
    const now = Date.now();
    const timePeriod = (now - this.lastRequestTime) / 1000; // секунды
    this.lastRequestTime = now;

    // Метрики запросов
    const requestsPerSecond = timePeriod > 0 ? this.requestCounter / timePeriod : 0;
    const errorRate = this.requestCounter > 0 ? (this.errorCounter / this.requestCounter) * 100 : 0;
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;

    // Перцентили времени ответа
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const percentiles = {
      p50: this.getPercentile(sortedTimes, 50),
      p95: this.getPercentile(sortedTimes, 95),
      p99: this.getPercentile(sortedTimes, 99)
    };

    // Метрики базы данных
    const dbMetrics = await this.getDatabaseMetrics();

    // Метрики Redis
    const redisMetrics = await this.getRedisMetrics();

    // Метрики RabbitMQ
    const rabbitmqMetrics = await this.getRabbitMQMetrics();

    // Сброс счетчиков
    this.requestCounter = 0;
    this.errorCounter = 0;
    this.responseTimes = [];

    return {
      requests: {
        total: this.requestCounter,
        perSecond: requestsPerSecond,
        errorRate,
        averageResponseTime: avgResponseTime,
        percentiles
      },
      database: dbMetrics,
      cache: {
        redis: redisMetrics
      },
      queues: {
        rabbitmq: rabbitmqMetrics
      }
    };
  }

  /**
   * Сбор бизнес-метрик
   */
  private async collectBusinessMetrics(): Promise<BusinessMetrics> {
    try {
      // Получаем метрики микширования
      const mixingMetrics = await this.getMixingMetrics();
      
      // Получаем метрики кошельков
      const walletMetrics = await this.getWalletMetrics();
      
      // Получаем метрики блокчейнов
      const blockchainMetrics = await this.getBlockchainMetrics();
      
      // Получаем метрики безопасности
      const securityMetrics = await this.getSecurityMetrics();

      return {
        mixing: mixingMetrics,
        wallets: walletMetrics,
        blockchain: blockchainMetrics,
        security: securityMetrics
      };
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сбора бизнес-метрик', { error });
      
      // Возвращаем дефолтные метрики в случае ошибки
      return {
        mixing: {
          operationsInProgress: 0,
          operationsCompleted: 0,
          operationsFailed: 0,
          averageProcessingTime: 0,
          totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 },
          successRate: 0
        },
        wallets: {
          totalWallets: 0,
          activeWallets: 0,
          totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 }
        },
        blockchain: {
          bitcoin: { connected: false, blockHeight: 0, syncStatus: 0, transactionPool: 0 },
          ethereum: { connected: false, blockNumber: 0, gasPrice: 0, pendingTransactions: 0 },
          solana: { connected: false, slot: 0, epoch: 0, transactionCount: 0 }
        },
        security: {
          alertsActive: 0,
          blockedTransactions: 0,
          riskScore: 0,
          amlChecks: 0
        }
      };
    }
  }

  /**
   * Вычисление процента использования CPU
   */
  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    const total = cpuUsage.user + cpuUsage.system;
    const totalMs = total / 1000; // микросекунды в миллисекунды
    const interval = this.config.collectInterval * 1000; // секунды в миллисекунды
    return Math.min(100, (totalMs / interval) * 100);
  }

  /**
   * Получение информации о swap
   */
  private async getSwapInfo(): Promise<{ total: number; used: number; free: number }> {
    try {
      const swapInfo = execSync('free -b | grep Swap').toString().trim();
      const [, total, used, free] = swapInfo.split(/\s+/).map(Number);
      return { total, used, free };
    } catch (error) {
      return { total: 0, used: 0, free: 0 };
    }
  }

  /**
   * Получение информации о диске
   */
  private async getDiskInfo(): Promise<{
    usage: number;
    total: number;
    used: number;
    free: number;
    iops: { read: number; write: number };
  }> {
    try {
      let diskStats: any = {};
      
      if (process.platform === 'linux') {
        const dfOutput = execSync('df -B1 /').toString().trim().split('\n')[1];
        const [, total, used, free] = dfOutput.split(/\s+/).map(Number);
        diskStats = {
          total,
          used,
          free,
          usage: (used / total) * 100
        };
      } else {
        // Для других платформ используем приблизительные значения
        const stats = await promisify(fs.stat)('/');
        diskStats = {
          total: 1000000000000, // 1TB по умолчанию
          used: 500000000000,   // 500GB по умолчанию
          free: 500000000000,   // 500GB по умолчанию
          usage: 50
        };
      }

      // IOPS пока что заглушка
      const iops = { read: 0, write: 0 };

      return { ...diskStats, iops };
    } catch (error) {
      return {
        usage: 0,
        total: 0,
        used: 0,
        free: 0,
        iops: { read: 0, write: 0 }
      };
    }
  }

  /**
   * Получение информации о сети
   */
  private async getNetworkInfo(): Promise<{
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
    errors: number;
  }> {
    try {
      const networkInterfaces = os.networkInterfaces();
      let bytesReceived = 0;
      let bytesSent = 0;
      
      // Суммируем статистику по всем интерфейсам
      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        if (interfaces) {
          for (const iface of interfaces) {
            // Это упрощенная реализация, так как Node.js не предоставляет
            // детальную статистику сети из коробки
            if (!iface.internal) {
              bytesReceived += 1000; // Заглушка
              bytesSent += 1000;     // Заглушка
            }
          }
        }
      }

      return {
        bytesReceived,
        bytesSent,
        packetsReceived: 0, // Заглушка
        packetsSent: 0,     // Заглушка
        errors: 0           // Заглушка
      };
    } catch (error) {
      return {
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0,
        errors: 0
      };
    }
  }

  /**
   * Получение метрик базы данных
   */
  private async getDatabaseMetrics(): Promise<{
    connections: { active: number; idle: number; total: number };
    queries: { total: number; perSecond: number; averageTime: number; slowQueries: number };
    transactions: { total: number; perSecond: number; rollbacks: number };
  }> {
    try {
      const dbManager = DatabaseManager.getInstance();
      const connectionInfo = dbManager.getConnectionInfo();
      
      return {
        connections: {
          active: connectionInfo.activeConnections || 0,
          idle: connectionInfo.idleConnections || 0,
          total: connectionInfo.totalConnections || 0
        },
        queries: {
          total: 0,        // TODO: реализовать счетчик запросов
          perSecond: 0,    // TODO: реализовать счетчик запросов в секунду
          averageTime: 0,  // TODO: реализовать среднее время запроса
          slowQueries: 0   // TODO: реализовать счетчик медленных запросов
        },
        transactions: {
          total: 0,      // TODO: реализовать счетчик транзакций
          perSecond: 0,  // TODO: реализовать счетчик транзакций в секунду
          rollbacks: 0   // TODO: реализовать счетчик откатов
        }
      };
    } catch (error) {
      return {
        connections: { active: 0, idle: 0, total: 0 },
        queries: { total: 0, perSecond: 0, averageTime: 0, slowQueries: 0 },
        transactions: { total: 0, perSecond: 0, rollbacks: 0 }
      };
    }
  }

  /**
   * Получение метрик Redis
   */
  private async getRedisMetrics(): Promise<{
    hitRate: number;
    missRate: number;
    evictions: number;
    memoryUsage: number;
    connections: number;
  }> {
    // TODO: Реализовать подключение к Redis и получение статистики
    return {
      hitRate: 0,
      missRate: 0,
      evictions: 0,
      memoryUsage: 0,
      connections: 0
    };
  }

  /**
   * Получение метрик RabbitMQ
   */
  private async getRabbitMQMetrics(): Promise<{
    messages: number;
    consumers: number;
    publishRate: number;
    consumeRate: number;
  }> {
    // TODO: Реализовать подключение к RabbitMQ и получение статистики
    return {
      messages: 0,
      consumers: 0,
      publishRate: 0,
      consumeRate: 0
    };
  }

  /**
   * Получение метрик микширования
   */
  private async getMixingMetrics(): Promise<{
    operationsInProgress: number;
    operationsCompleted: number;
    operationsFailed: number;
    averageProcessingTime: number;
    totalVolume: { btc: number; eth: number; usdt: number; sol: number };
    successRate: number;
  }> {
    try {
      const dbManager = DatabaseManager.getInstance();
      
      // Запросы к базе данных для получения статистики микширования
      const [inProgress, completed, failed] = await Promise.all([
        dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['in_progress']),
        dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['completed']),
        dbManager.query('SELECT COUNT(*) as count FROM mix_requests WHERE status = ?', ['failed'])
      ]);

      const operationsInProgress = inProgress[0]?.count || 0;
      const operationsCompleted = completed[0]?.count || 0;
      const operationsFailed = failed[0]?.count || 0;

      const totalOperations = operationsCompleted + operationsFailed;
      const successRate = totalOperations > 0 ? (operationsCompleted / totalOperations) * 100 : 0;

      return {
        operationsInProgress,
        operationsCompleted,
        operationsFailed,
        averageProcessingTime: 0, // TODO: вычислить среднее время обработки
        totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 }, // TODO: вычислить объемы
        successRate
      };
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения метрик микширования', { error });
      return {
        operationsInProgress: 0,
        operationsCompleted: 0,
        operationsFailed: 0,
        averageProcessingTime: 0,
        totalVolume: { btc: 0, eth: 0, usdt: 0, sol: 0 },
        successRate: 0
      };
    }
  }

  /**
   * Получение метрик кошельков
   */
  private async getWalletMetrics(): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalBalance: { btc: number; eth: number; usdt: number; sol: number };
  }> {
    try {
      const dbManager = DatabaseManager.getInstance();
      
      const [totalWallets, activeWallets] = await Promise.all([
        dbManager.query('SELECT COUNT(*) as count FROM wallets'),
        dbManager.query('SELECT COUNT(*) as count FROM wallets WHERE status = ?', ['active'])
      ]);

      return {
        totalWallets: totalWallets[0]?.count || 0,
        activeWallets: activeWallets[0]?.count || 0,
        totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 } // TODO: вычислить балансы
      };
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения метрик кошельков', { error });
      return {
        totalWallets: 0,
        activeWallets: 0,
        totalBalance: { btc: 0, eth: 0, usdt: 0, sol: 0 }
      };
    }
  }

  /**
   * Получение метрик блокчейнов
   */
  private async getBlockchainMetrics(): Promise<{
    bitcoin: { connected: boolean; blockHeight: number; syncStatus: number; transactionPool: number };
    ethereum: { connected: boolean; blockNumber: number; gasPrice: number; pendingTransactions: number };
    solana: { connected: boolean; slot: number; epoch: number; transactionCount: number };
  }> {
    // TODO: Интегрироваться с блокчейн клиентами для получения реальных метрик
    return {
      bitcoin: { connected: false, blockHeight: 0, syncStatus: 0, transactionPool: 0 },
      ethereum: { connected: false, blockNumber: 0, gasPrice: 0, pendingTransactions: 0 },
      solana: { connected: false, slot: 0, epoch: 0, transactionCount: 0 }
    };
  }

  /**
   * Получение метрик безопасности
   */
  private async getSecurityMetrics(): Promise<{
    alertsActive: number;
    blockedTransactions: number;
    riskScore: number;
    amlChecks: number;
  }> {
    try {
      const dbManager = DatabaseManager.getInstance();
      
      const blockedTransactions = await dbManager.query(
        'SELECT COUNT(*) as count FROM audit_logs WHERE action = ? AND created_at > NOW() - INTERVAL 24 HOUR',
        ['transaction_blocked']
      );

      return {
        alertsActive: 0, // TODO: получить количество активных алертов
        blockedTransactions: blockedTransactions[0]?.count || 0,
        riskScore: 0,    // TODO: вычислить общий риск-скор
        amlChecks: 0     // TODO: получить количество AML проверок
      };
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения метрик безопасности', { error });
      return {
        alertsActive: 0,
        blockedTransactions: 0,
        riskScore: 0,
        amlChecks: 0
      };
    }
  }

  /**
   * Вычисление перцентиля
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Очистка старых метрик
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (this.config.retentionPeriod * 1000);
    this.metricsHistory = this.metricsHistory.filter(
      snapshot => snapshot.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Проверка пороговых значений и отправка алертов
   */
  private checkThresholds(snapshot: PerformanceSnapshot): void {
    const { thresholds } = this.config.alerting;

    // Проверка CPU
    if (snapshot.system.cpu.usage > thresholds.cpu) {
      this.emit('threshold_exceeded', {
        type: 'cpu',
        value: snapshot.system.cpu.usage,
        threshold: thresholds.cpu,
        timestamp: snapshot.timestamp
      });
    }

    // Проверка памяти
    if (snapshot.system.memory.usage > thresholds.memory) {
      this.emit('threshold_exceeded', {
        type: 'memory',
        value: snapshot.system.memory.usage,
        threshold: thresholds.memory,
        timestamp: snapshot.timestamp
      });
    }

    // Проверка диска
    if (snapshot.system.disk.usage > thresholds.disk) {
      this.emit('threshold_exceeded', {
        type: 'disk',
        value: snapshot.system.disk.usage,
        threshold: thresholds.disk,
        timestamp: snapshot.timestamp
      });
    }

    // Проверка времени ответа
    if (snapshot.application.requests.averageResponseTime > thresholds.responseTime) {
      this.emit('threshold_exceeded', {
        type: 'response_time',
        value: snapshot.application.requests.averageResponseTime,
        threshold: thresholds.responseTime,
        timestamp: snapshot.timestamp
      });
    }

    // Проверка частоты ошибок
    if (snapshot.application.requests.errorRate > thresholds.errorRate) {
      this.emit('threshold_exceeded', {
        type: 'error_rate',
        value: snapshot.application.requests.errorRate,
        threshold: thresholds.errorRate,
        timestamp: snapshot.timestamp
      });
    }
  }

  /**
   * Запуск Prometheus endpoint
   */
  private async startPrometheusEndpoint(): Promise<void> {
    // TODO: Реализовать Prometheus metrics endpoint
    enhancedDbLogger.info('📊 Prometheus endpoint будет реализован в следующей итерации');
  }

  /**
   * Запись запроса для метрик
   */
  recordRequest(responseTime: number, isError: boolean = false): void {
    if (!this.config.enabled) return;

    // Сэмплирование запросов
    if (this.config.sampling.enabled) {
      if (Math.random() * 100 > this.config.sampling.rate) {
        return;
      }
    }

    this.requestCounter++;
    this.responseTimes.push(responseTime);

    if (isError) {
      this.errorCounter++;
    }
  }

  /**
   * Получение последнего снимка метрик
   */
  getLastSnapshot(): PerformanceSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Получение истории метрик
   */
  getMetricsHistory(limit: number = 100): PerformanceSnapshot[] {
    return this.metricsHistory.slice(-limit);
  }

  /**
   * Получение метрик за определенный период
   */
  getMetricsByTimeRange(startTime: Date, endTime: Date): PerformanceSnapshot[] {
    return this.metricsHistory.filter(snapshot => 
      snapshot.timestamp >= startTime && snapshot.timestamp <= endTime
    );
  }

  /**
   * Получение агрегированных метрик
   */
  getAggregatedMetrics(period: 'hour' | 'day' | 'week'): any {
    // TODO: Реализовать агрегацию метрик по периодам
    return {
      averageCpuUsage: 0,
      averageMemoryUsage: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      errorRate: 0
    };
  }

  /**
   * Экспорт метрик в различных форматах
   */
  exportMetrics(format: 'json' | 'csv' | 'prometheus'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.metricsHistory, null, 2);
      
      case 'csv':
        // TODO: Реализовать CSV экспорт
        return 'timestamp,cpu_usage,memory_usage,disk_usage\n';
      
      case 'prometheus':
        // TODO: Реализовать Prometheus формат
        return '# HELP cpu_usage CPU usage percentage\n';
      
      default:
        throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
    }
  }

  /**
   * Получение статуса работы монитора
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Получение конфигурации
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    enhancedDbLogger.info('📊 Конфигурация Performance Monitor обновлена', newConfig);
  }
}

export default PerformanceMonitor;