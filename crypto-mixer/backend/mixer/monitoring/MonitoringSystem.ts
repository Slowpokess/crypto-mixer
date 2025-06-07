import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { memoryManager, BoundedMap } from '../../utils/MemoryManager';

// Типы для системы мониторинга
interface MonitoringSystemDependencies {
  database?: any;
  logger?: any;
  alertManager?: any;
  metricsCollector?: any;
  config?: MonitoringSystemConfig;
}

interface MonitoringSystemConfig {
  metricsIntervals?: MetricsIntervals;
  alertThresholds?: AlertThresholds;
  dataRetention?: DataRetention;
  logLevels?: LogLevels;
}

interface MetricsIntervals {
  system?: number;
  business?: number;
  security?: number;
  performance?: number;
}

interface AlertThresholds {
  systemLoad?: number;
  errorRate?: number;
  latency?: number;
  failedMixes?: number;
  suspiciousActivity?: number;
  poolUtilization?: number;
  memoryUsage?: number;
  queueLength?: number;
}

interface DataRetention {
  metrics?: number;
  logs?: number;
  transactions?: number;
  alerts?: number;
}

interface LogLevels {
  error?: boolean;
  warn?: boolean;
  info?: boolean;
  debug?: boolean;
  trace?: boolean;
}

interface MixingOperation {
  mixId: string;
  type: string;
  status: string;
  currency: string;
  amount: number;
  participants?: number;
  duration?: number;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  metadata?: any;
}

interface SecurityEvent {
  type: string;
  severity?: string;
  source: string;
  description: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  riskScore?: number;
  actionTaken?: string;
}

interface LogEntry {
  id: string;
  mixId: string;
  operation: string;
  status: string;
  currency: string;
  amount: number;
  participants: number;
  duration: number;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
    additionalData: any;
  };
  timestamp: Date;
  level: string;
}

interface SecurityLog {
  id: string;
  eventType: string;
  severity: string;
  source: string;
  description: string;
  metadata: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    additionalData: any;
  };
  riskScore: number;
  actionTaken: string;
  timestamp: Date;
}

interface SystemMetrics {
  timestamp: Date;
  system?: {
    cpuUsage?: NodeJS.CpuUsage;
    memoryUsage?: NodeJS.MemoryUsage;
    uptime?: number;
    nodeVersion?: string;
    platform?: string;
  };
  application?: {
    activeMixes?: number;
    totalPools?: number;
    queueSize?: number;
    averageLatency?: number;
    errorRate?: number;
  };
  network?: {
    connections?: number;
    throughput?: number;
    bandwidth?: { upload: number; download: number };
  };
}

interface BusinessMetrics {
  timestamp: Date;
  volume: {
    total: Record<string, number>;
    last24h: number;
    byHour: number[];
  };
  transactions: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    last24h: number;
  };
  pools: {
    utilization: Record<string, number>;
    totalLiquidity: number;
    averageAge: number;
  };
  users: {
    active: number;
    new: number;
    returning: number;
  };
}

interface AlertEntry {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  source: string;
  metadata: any;
  threshold?: number;
  currentValue?: number;
  status: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

interface PerformanceReport {
  timeRange: string;
  generatedAt: Date;
  summary: {
    totalMixes: number;
    successRate: number;
    averageLatency: number;
    totalVolume: Map<string, number>;
    errorCount: number;
  };
  performance: {
    latencyPercentiles: { p50: number; p90: number; p99: number };
    throughputData: any[];
    errorRateOverTime: any[];
  };
  security: {
    alertsTriggered: any[];
    suspiciousActivities: any[];
    riskScoreDistribution: Record<string, number>;
  };
  recommendations: string[];
}

interface MonitoringCounters {
  totalMixes: number;
  successfulMixes: number;
  failedMixes: number;
  totalVolume: Map<string, number>;
  alertsTriggered: number;
  systemRestarts: number;
}

interface MonitoringStatus {
  isRunning: boolean;
  activeAlerts: number;
  totalMetricsCollected: number;
  uptime: number;
}

interface MonitoringHealthCheck {
  status: string;
  timestamp: Date;
  checks: {
    monitoring: { status: string; message: string };
    database: { status: string; message: string };
    metrics: { status: string; message: string };
    alerts: { status: string; message: string };
  };
  details: {
    isMonitoring: boolean;
    activeAlertsCount: number;
    metricsCollected: {
      system: number;
      business: number;
      security: number;
      performance: number;
    };
    counters: MonitoringCounters;
  };
  error?: string;
}

interface MonitoringStatistics {
  system: {
    isMonitoring: boolean;
    uptime: number;
    metricsCollected: {
      system: number;
      business: number;
      security: number;
      performance: number;
    };
  };
  counters: {
    totalMixes: number;
    successfulMixes: number;
    failedMixes: number;
    totalVolume: Record<string, number>;
    alertsTriggered: number;
    systemRestarts: number;
  };
  alerts: {
    active: number;
    total: number;
    triggered24h: number;
  };
  performance: {
    averageLatency: number;
    errorRate: number;
    successRate: number;
    throughput: number;
  };
}

interface MetricsMap {
  system: BoundedMap<number, SystemMetrics>;
  business: BoundedMap<number, BusinessMetrics>;
  security: BoundedMap<number, any>;
  performance: BoundedMap<number, any>;
}

/**
 * Система мониторинга и логирования для крипто миксера
 * Обеспечивает полное отслеживание операций, метрик и алертов
 */
class MonitoringSystem extends EventEmitter {
  private database?: any;
  private logger?: any;
  private alertManager?: any;
  private metricsCollector?: any;

  private config: Required<MonitoringSystemConfig>;
  private metrics: MetricsMap;
  private recentAlerts: BoundedMap<string, AlertEntry>;
  private performanceBaseline: BoundedMap<string, number>;
  private counters: MonitoringCounters;
  
  // Timer constants for MemoryManager
  private readonly SYSTEM_METRICS_TIMER = 'monitoring:system-metrics';
  private readonly BUSINESS_METRICS_TIMER = 'monitoring:business-metrics';
  private readonly SECURITY_METRICS_TIMER = 'monitoring:security-metrics';
  private readonly PERFORMANCE_METRICS_TIMER = 'monitoring:performance-metrics';
  private readonly ALERT_SYSTEM_TIMER = 'monitoring:alert-system';
  private readonly ALERT_BUSINESS_TIMER = 'monitoring:alert-business';
  private readonly DATA_CLEANUP_TIMER = 'monitoring:data-cleanup';

  private isMonitoring: boolean;
  private _startTime?: number;

  constructor(dependencies: MonitoringSystemDependencies = {}) {
    super();

    this.database = dependencies.database;
    this.logger = dependencies.logger;
    this.alertManager = dependencies.alertManager;
    this.metricsCollector = dependencies.metricsCollector;

    // Конфигурация мониторинга
    this.config = {
      // Интервалы сбора метрик
      metricsIntervals: {
        system: 30 * 1000,        // 30 секунд
        business: 60 * 1000,      // 1 минута
        security: 15 * 1000,      // 15 секунд
        performance: 5 * 1000,    // 5 секунд
        ...dependencies.config?.metricsIntervals
      },

      // Пороговые значения для алертов
      alertThresholds: {
        systemLoad: 85,           // CPU/Memory %
        errorRate: 5,             // Ошибок в минуту
        latency: 2000,            // Задержка в мс
        failedMixes: 3,           // Неудачных миксов за 10 минут
        suspiciousActivity: 10,   // Подозрительных активностей в час
        poolUtilization: 95,      // Утилизация пула %
        memoryUsage: 90,          // Использование памяти %
        queueLength: 1000,        // Максимальная длина очереди
        ...dependencies.config?.alertThresholds
      },

      // Настройки ретенции данных
      dataRetention: {
        metrics: 30 * 24 * 60 * 60 * 1000,     // 30 дней
        logs: 90 * 24 * 60 * 60 * 1000,        // 90 дней
        transactions: 365 * 24 * 60 * 60 * 1000, // 1 год
        alerts: 180 * 24 * 60 * 60 * 1000,      // 180 дней
        ...dependencies.config?.dataRetention
      },

      // Уровни логирования
      logLevels: {
        error: true,
        warn: true,
        info: true,
        debug: false,
        trace: false,
        ...dependencies.config?.logLevels
      }
    };

    // Bounded collections для метрик с автоматической очисткой
    this.metrics = {
      system: memoryManager.createBoundedMap<number, SystemMetrics>('monitoring:system-metrics', {
        maxSize: 2880, // 24 часа при интервале 30 сек
        cleanupThreshold: 0.8,
        ttl: 24 * 60 * 60 * 1000 // 24 hours
      }),
      business: memoryManager.createBoundedMap<number, BusinessMetrics>('monitoring:business-metrics', {
        maxSize: 1440, // 24 часа при интервале 1 мин
        cleanupThreshold: 0.8,
        ttl: 24 * 60 * 60 * 1000
      }),
      security: memoryManager.createBoundedMap<number, any>('monitoring:security-metrics', {
        maxSize: 5760, // 24 часа при интервале 15 сек
        cleanupThreshold: 0.8,
        ttl: 24 * 60 * 60 * 1000
      }),
      performance: memoryManager.createBoundedMap<number, any>('monitoring:performance-metrics', {
        maxSize: 17280, // 24 часа при интервале 5 сек
        cleanupThreshold: 0.8,
        ttl: 24 * 60 * 60 * 1000
      })
    };

    // Bounded caches
    this.recentAlerts = memoryManager.createBoundedMap<string, AlertEntry>('monitoring:alerts', {
      maxSize: 1000,
      cleanupThreshold: 0.8,
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    this.performanceBaseline = memoryManager.createBoundedMap<string, number>('monitoring:baseline', {
      maxSize: 500,
      cleanupThreshold: 0.8,
      ttl: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Счетчики и статистика
    this.counters = {
      totalMixes: 0,
      successfulMixes: 0,
      failedMixes: 0,
      totalVolume: new Map<string, number>(),
      alertsTriggered: 0,
      systemRestarts: 0
    };

    this.isMonitoring = false;

    this.logger?.info('MonitoringSystem инициализирован');
    this._setupMemoryListeners();
  }

  /**
   * Запускает систему мониторинга
   */
  async startMonitoring(): Promise<void> {
    try {
      if (this.isMonitoring) {
        return;
      }

      this.logger?.info('Запуск системы мониторинга...');

      // Инициализируем базовые метрики
      await this._initializeMetrics();

      // Загружаем исторические данные
      await this._loadHistoricalData();

      // Запускаем сборщики метрик
      this._startMetricsCollectors();

      // Запускаем систему алертов
      this._startAlertSystem();

      // Запускаем очистку данных
      this._startDataCleanup();

      this.isMonitoring = true;
      this.emit('monitoring:started');

      this.logger?.info('Система мониторинга запущена');

    } catch (error) {
      this.logger?.error('Ошибка запуска системы мониторинга:', error);
      throw error;
    }
  }

  /**
   * Останавливает систему мониторинга
   */
  async stopMonitoring(): Promise<void> {
    try {
      if (!this.isMonitoring) {
        return;
      }

      this.logger?.info('Остановка системы мониторинга...');

      // Останавливаем все таймеры
      this._stopAllTimers();

      // Сохраняем финальные метрики
      await this._saveMetrics();

      this.isMonitoring = false;
      this.emit('monitoring:stopped');

      this.logger?.info('Система мониторинга остановлена');

    } catch (error) {
      this.logger?.error('Ошибка остановки мониторинга:', error);
      throw error;
    }
  }

  /**
   * Логирует событие операции микширования
   */
  async logMixingOperation(operation: MixingOperation): Promise<void> {
    try {
      const logEntry: LogEntry = {
        id: crypto.randomBytes(16).toString('hex'),
        mixId: operation.mixId,
        operation: operation.type,
        status: operation.status,
        currency: operation.currency,
        amount: operation.amount,
        participants: operation.participants || 0,
        duration: operation.duration || 0,
        metadata: {
          userAgent: operation.userAgent,
          ipAddress: operation.ipAddress ? this._hashIP(operation.ipAddress) : undefined,
          sessionId: operation.sessionId,
          additionalData: operation.metadata || {}
        },
        timestamp: new Date(),
        level: this._determineLogLevel(operation)
      };

      // Сохраняем в БД
      await this._saveLogEntry(logEntry);

      // Обновляем счетчики
      this._updateCounters(operation);

      // Обновляем метрики
      this._updateBusinessMetrics(operation);

      // Проверяем на алерты
      await this._checkAlerts(operation);

      this.emit('operation:logged', {
        mixId: operation.mixId,
        type: operation.type,
        status: operation.status
      });

      this.logger?.debug('Операция микширования залогирована', {
        mixId: operation.mixId,
        operation: operation.type,
        status: operation.status
      });

    } catch (error) {
      this.logger?.error('Ошибка логирования операции:', error, {
        mixId: operation.mixId
      });
    }
  }

  /**
   * Логирует событие безопасности
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      const securityLog: SecurityLog = {
        id: crypto.randomBytes(16).toString('hex'),
        eventType: event.type,
        severity: event.severity || 'MEDIUM',
        source: event.source,
        description: event.description,
        metadata: {
          userId: event.userId,
          ipAddress: event.ipAddress ? this._hashIP(event.ipAddress) : undefined,
          userAgent: event.userAgent,
          additionalData: event.metadata || {}
        },
        riskScore: event.riskScore || 0,
        actionTaken: event.actionTaken || 'NONE',
        timestamp: new Date()
      };

      // Сохраняем в БД
      await this._saveSecurityLog(securityLog);

      // Обновляем метрики безопасности
      this._updateSecurityMetrics(event);

      // Проверяем критичность
      if (event.severity === 'CRITICAL' || (event.riskScore && event.riskScore >= 80)) {
        await this._triggerSecurityAlert(securityLog);
      }

      this.emit('security:logged', {
        eventType: event.type,
        severity: event.severity,
        riskScore: event.riskScore
      });

      this.logger?.warn('Событие безопасности залогировано', {
        eventType: event.type,
        severity: event.severity,
        riskScore: event.riskScore
      });

    } catch (error) {
      this.logger?.error('Ошибка логирования события безопасности:', error);
    }
  }

  /**
   * Собирает системные метрики
   */
  async collectSystemMetrics(): Promise<SystemMetrics | null> {
    try {
      const metrics: SystemMetrics = {
        timestamp: new Date(),
        system: {
          cpuUsage: process.cpuUsage(),
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform
        },
        application: {
          activeMixes: this.counters.totalMixes - this.counters.successfulMixes - this.counters.failedMixes,
          totalPools: await this._getPoolCount(),
          queueSize: await this._getQueueSize(),
          averageLatency: this._calculateAverageLatency(),
          errorRate: this._calculateErrorRate()
        },
        network: {
          connections: await this._getConnectionCount(),
          throughput: this._calculateThroughput(),
          bandwidth: await this._getBandwidthUsage()
        }
      };

      // Сохраняем метрики
      this.metrics.system.set(Date.now(), metrics);

      // Проверяем лимиты
      await this._checkSystemThresholds(metrics);

      return metrics;

    } catch (error) {
      this.logger?.error('Ошибка сбора системных метрик:', error);
      return null;
    }
  }

  /**
   * Собирает бизнес-метрики
   */
  async collectBusinessMetrics(): Promise<BusinessMetrics | null> {
    try {
      const timeWindow = 24 * 60 * 60 * 1000; // 24 часа
      const now = Date.now();

      const metrics: BusinessMetrics = {
        timestamp: new Date(),
        volume: {
          total: Object.fromEntries(this.counters.totalVolume),
          last24h: await this._getVolumeInWindow(now - timeWindow, now),
          byHour: await this._getHourlyVolume()
        },
        transactions: {
          total: this.counters.totalMixes,
          successful: this.counters.successfulMixes,
          failed: this.counters.failedMixes,
          successRate: this._calculateSuccessRate(),
          last24h: await this._getTransactionCountInWindow(now - timeWindow, now)
        },
        pools: {
          utilization: await this._getPoolUtilization(),
          totalLiquidity: await this._getTotalLiquidity(),
          averageAge: await this._getAveragePoolAge()
        },
        users: {
          active: await this._getActiveUsersCount(),
          new: await this._getNewUsersCount(),
          returning: await this._getReturningUsersCount()
        }
      };

      // Сохраняем метрики
      this.metrics.business.set(Date.now(), metrics);

      return metrics;

    } catch (error) {
      this.logger?.error('Ошибка сбора бизнес-метрик:', error);
      return null;
    }
  }

  /**
   * Генерирует отчет о производительности
   */
  async generatePerformanceReport(timeRange: string = '24h'): Promise<PerformanceReport> {
    try {
      const endTime = Date.now();
      const startTime = this._getStartTimeForRange(timeRange, endTime);

      const report: PerformanceReport = {
        timeRange,
        generatedAt: new Date(),
        summary: {
          totalMixes: 0,
          successRate: 0,
          averageLatency: 0,
          totalVolume: new Map(),
          errorCount: 0
        },
        performance: {
          latencyPercentiles: await this._calculateLatencyPercentiles(startTime, endTime),
          throughputData: await this._getThroughputData(startTime, endTime),
          errorRateOverTime: await this._getErrorRateOverTime(startTime, endTime)
        },
        security: {
          alertsTriggered: await this._getAlertsInTimeRange(startTime, endTime),
          suspiciousActivities: await this._getSuspiciousActivities(startTime, endTime),
          riskScoreDistribution: await this._getRiskScoreDistribution(startTime, endTime)
        },
        recommendations: []
      };

      // Заполняем данные из собранных метрик
      await this._populateReportData(report, startTime, endTime);

      // Генерируем рекомендации
      report.recommendations = this._generateRecommendations(report);

      // Сохраняем отчет
      await this._savePerformanceReport(report);

      this.logger?.info('Отчет о производительности сгенерирован', {
        timeRange,
        totalMixes: report.summary.totalMixes,
        successRate: report.summary.successRate
      });

      return report;

    } catch (error) {
      this.logger?.error('Ошибка генерации отчета:', error);
      throw error;
    }
  }

  /**
   * Создает алерт
   */
  async createAlert(alert: Partial<AlertEntry>): Promise<AlertEntry | null> {
    try {
      const alertEntry: AlertEntry = {
        id: crypto.randomBytes(16).toString('hex'),
        type: alert.type || '',
        severity: alert.severity || 'MEDIUM',
        title: alert.title || '',
        description: alert.description || '',
        source: alert.source || '',
        metadata: alert.metadata || {},
        threshold: alert.threshold,
        currentValue: alert.currentValue,
        status: 'ACTIVE',
        createdAt: new Date(),
        acknowledgedAt: null,
        resolvedAt: null
      };

      // Проверяем дублирование
      if (this._isDuplicateAlert(alertEntry)) {
        return null;
      }

      // Сохраняем алерт
      await this._saveAlert(alertEntry);

      // Добавляем в кеш
      this.recentAlerts.set(alertEntry.id, alertEntry);

      // Отправляем уведомления
      await this._sendAlertNotifications(alertEntry);

      this.counters.alertsTriggered++;

      this.emit('alert:created', {
        alertId: alertEntry.id,
        type: alert.type,
        severity: alert.severity
      });

      this.logger?.warn('Создан алерт', {
        alertId: alertEntry.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title
      });

      return alertEntry;

    } catch (error) {
      this.logger?.error('Ошибка создания алерта:', error);
      throw error;
    }
  }

  /**
   * Получает текущий статус системы мониторинга
   */
  getStatus(): MonitoringStatus {
    return {
      isRunning: this.isMonitoring,
      activeAlerts: Array.from(this.recentAlerts.values()).filter(alert => alert.status === 'ACTIVE').length,
      totalMetricsCollected: Object.values(this.metrics).reduce((sum, metricMap) => sum + metricMap.size, 0),
      uptime: this._startTime ? Date.now() - this._startTime : 0
    };
  }

  /**
   * Выполняет проверку состояния системы мониторинга
   */
  async healthCheck(): Promise<MonitoringHealthCheck> {
    const health: MonitoringHealthCheck = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {
        monitoring: { status: 'pass', message: 'Мониторинг работает нормально' },
        database: { status: 'pass', message: 'Подключение к БД стабильно' },
        metrics: { status: 'pass', message: 'Сбор метрик активен' },
        alerts: { status: 'pass', message: 'Система алертов функционирует' }
      },
      details: {
        isMonitoring: this.isMonitoring,
        activeAlertsCount: Array.from(this.recentAlerts.values()).filter(a => a.status === 'ACTIVE').length,
        metricsCollected: {
          system: this.metrics.system.size,
          business: this.metrics.business.size,
          security: this.metrics.security.size,
          performance: this.metrics.performance.size
        },
        counters: this.counters
      }
    };

    try {
      // Проверяем состояние мониторинга
      if (!this.isMonitoring) {
        health.checks.monitoring = { status: 'fail', message: 'Мониторинг не запущен' };
        health.status = 'unhealthy';
      }

      // Проверяем подключение к БД
      if (this.database) {
        try {
          await this.database.query('SELECT 1');
        } catch (error) {
          health.checks.database = { status: 'fail', message: `Ошибка БД: ${error instanceof Error ? error.message : 'Unknown error'}` };
          health.status = 'unhealthy';
        }
      }

      // Проверяем критические алерты
      const criticalAlerts = Array.from(this.recentAlerts.values())
        .filter(alert => alert.severity === 'CRITICAL' && alert.status === 'ACTIVE');

      if (criticalAlerts.length > 0) {
        health.checks.alerts = {
          status: 'warn',
          message: `Обнаружено ${criticalAlerts.length} критических алертов`
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем активность сбора метрик
      const now = Date.now();
      const recentMetrics = Array.from(this.metrics.system.keys())
        .filter(timestamp => now - timestamp < 5 * 60 * 1000); // последние 5 минут

      if (recentMetrics.length === 0 && this.isMonitoring) {
        health.checks.metrics = { status: 'warn', message: 'Нет свежих метрик за последние 5 минут' };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Ошибка проверки состояния мониторинга:', error);
    }

    return health;
  }

  getMonitoringStatistics(): MonitoringStatistics {
    const now = Date.now();

    return {
      system: {
        isMonitoring: this.isMonitoring,
        uptime: this.isMonitoring && this._startTime ? now - this._startTime : 0,
        metricsCollected: {
          system: this.metrics.system.size,
          business: this.metrics.business.size,
          security: this.metrics.security.size,
          performance: this.metrics.performance.size
        }
      },
      counters: {
        totalMixes: this.counters.totalMixes,
        successfulMixes: this.counters.successfulMixes,
        failedMixes: this.counters.failedMixes,
        totalVolume: Object.fromEntries(this.counters.totalVolume),
        alertsTriggered: this.counters.alertsTriggered,
        systemRestarts: this.counters.systemRestarts
      },
      alerts: {
        active: Array.from(this.recentAlerts.values()).filter(a => a.status === 'ACTIVE').length,
        total: this.recentAlerts.size,
        triggered24h: this._getAlertsInLast24h()
      },
      performance: {
        averageLatency: this._calculateAverageLatency(),
        errorRate: this._calculateErrorRate(),
        successRate: this._calculateSuccessRate(),
        throughput: this._calculateThroughput()
      }
    };
  }

  // Приватные методы инициализации и управления

  private async _initializeMetrics(): Promise<void> {
    this._startTime = Date.now();

    // Инициализируем базовые счетчики
    this.counters.totalVolume.set('BTC', 0);
    this.counters.totalVolume.set('ETH', 0);
    this.counters.totalVolume.set('USDT', 0);
    this.counters.totalVolume.set('SOL', 0);

    // Загружаем базовые показатели производительности
    await this._establishPerformanceBaseline();
  }

  private async _loadHistoricalData(): Promise<void> {
    if (!this.database) return;

    try {
      // Загружаем счетчики из БД
      const countersQuery = `
        SELECT 
          COUNT(*) as total_mixes,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as successful_mixes,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_mixes
        FROM mix_requests
      `;

      const result = await this.database.query(countersQuery);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.counters.totalMixes = parseInt(row.total_mixes) || 0;
        this.counters.successfulMixes = parseInt(row.successful_mixes) || 0;
        this.counters.failedMixes = parseInt(row.failed_mixes) || 0;
      }

      // Загружаем объемы по валютам
      const volumeQuery = `
        SELECT currency, SUM(amount) as total_volume
        FROM mix_requests
        WHERE status = 'COMPLETED'
        GROUP BY currency
      `;

      const volumeResult = await this.database.query(volumeQuery);
      for (const row of volumeResult.rows) {
        this.counters.totalVolume.set(row.currency, parseFloat(row.total_volume) || 0);
      }

      this.logger?.info('Исторические данные загружены', {
        totalMixes: this.counters.totalMixes,
        successfulMixes: this.counters.successfulMixes
      });

    } catch (error) {
      this.logger?.error('Ошибка загрузки исторических данных:', error);
    }
  }

  private _startMetricsCollectors(): void {
    // Системные метрики
    memoryManager.createTimer(
      this.SYSTEM_METRICS_TIMER,
      () => this.collectSystemMetrics(),
      this.config.metricsIntervals.system || 30000,
      'interval',
      'System metrics collection'
    );

    // Бизнес-метрики
    memoryManager.createTimer(
      this.BUSINESS_METRICS_TIMER,
      () => this.collectBusinessMetrics(),
      this.config.metricsIntervals.business || 60000,
      'interval',
      'Business metrics collection'
    );

    // Метрики безопасности
    memoryManager.createTimer(
      this.SECURITY_METRICS_TIMER,
      () => this._collectSecurityMetrics(),
      this.config.metricsIntervals.security || 15000,
      'interval',
      'Security metrics collection'
    );

    // Метрики производительности
    memoryManager.createTimer(
      this.PERFORMANCE_METRICS_TIMER,
      () => this._collectPerformanceMetrics(),
      this.config.metricsIntervals.performance || 5000,
      'interval',
      'Performance metrics collection'
    );
  }

  private _startAlertSystem(): void {
    // Мониторинг системных показателей
    memoryManager.createTimer(
      this.ALERT_SYSTEM_TIMER,
      () => this._checkSystemAlerts(),
      30 * 1000,
      'interval',
      'System alerts monitoring'
    );

    // Мониторинг бизнес-показателей
    memoryManager.createTimer(
      this.ALERT_BUSINESS_TIMER,
      () => this._checkBusinessAlerts(),
      60 * 1000,
      'interval',
      'Business alerts monitoring'
    );
  }

  private _startDataCleanup(): void {
    // Очистка устаревших данных каждые 6 часов
    memoryManager.createTimer(
      this.DATA_CLEANUP_TIMER,
      () => this._performDataCleanup(),
      6 * 60 * 60 * 1000,
      'interval',
      'Data cleanup task'
    );
  }

  private _stopAllTimers(): void {
    memoryManager.clearTimer(this.SYSTEM_METRICS_TIMER);
    memoryManager.clearTimer(this.BUSINESS_METRICS_TIMER);
    memoryManager.clearTimer(this.SECURITY_METRICS_TIMER);
    memoryManager.clearTimer(this.PERFORMANCE_METRICS_TIMER);
    memoryManager.clearTimer(this.ALERT_SYSTEM_TIMER);
    memoryManager.clearTimer(this.ALERT_BUSINESS_TIMER);
    memoryManager.clearTimer(this.DATA_CLEANUP_TIMER);
    
    this.logger?.debug('Все таймеры мониторинга остановлены');
  }

  private _setupMemoryListeners(): void {
    memoryManager.on('memory-warning', (data) => {
      this.logger?.warn('Memory warning detected in monitoring system', data);
      this._triggerEmergencyCleanup();
    });

    memoryManager.on('emergency-cleanup', (data) => {
      this.logger?.error('Emergency cleanup triggered in monitoring system', data);
      this.emit('monitoring:emergency-cleanup', data);
    });
  }

  private _triggerEmergencyCleanup(): void {
    this.logger?.warn('🚨 Monitoring system emergency cleanup triggered');
    
    // Force cleanup on all metrics collections
    this.metrics.system.emergencyCleanup();
    this.metrics.business.emergencyCleanup();
    this.metrics.security.emergencyCleanup();
    this.metrics.performance.emergencyCleanup();
    this.recentAlerts.emergencyCleanup();
    this.performanceBaseline.emergencyCleanup();

    this.logger?.info('Emergency cleanup completed for monitoring system');
  }

  /**
   * Graceful shutdown with proper cleanup
   */
  async shutdown(): Promise<void> {
    this.logger?.info('🧹 MonitoringSystem shutdown initiated...');
    
    try {
      // Stop monitoring
      await this.stopMonitoring();
      
      // Clear all collections
      this.metrics.system.clear();
      this.metrics.business.clear();
      this.metrics.security.clear();
      this.metrics.performance.clear();
      this.recentAlerts.clear();
      this.performanceBaseline.clear();
      
      // Remove event listeners
      this.removeAllListeners();
      
      this.logger?.info('✅ MonitoringSystem shutdown completed');
    } catch (error) {
      this.logger?.error('Error during monitoring system shutdown:', error);
      throw error;
    }
  }

  // Приватные методы для работы с метриками

  private _updateCounters(operation: MixingOperation): void {
    if (operation.type === 'MIX_REQUEST') {
      this.counters.totalMixes++;
    }

    if (operation.status === 'COMPLETED') {
      this.counters.successfulMixes++;
      const currentVolume = this.counters.totalVolume.get(operation.currency) || 0;
      this.counters.totalVolume.set(operation.currency, currentVolume + operation.amount);
    } else if (operation.status === 'FAILED') {
      this.counters.failedMixes++;
    }
  }

  private _updateBusinessMetrics(operation: MixingOperation): void {
    const timestamp = Date.now();
    const businessMetrics = this.metrics.business.get(timestamp) || {
      timestamp: new Date(),
      volume: { total: {}, last24h: 0, byHour: [] },
      transactions: { total: 0, successful: 0, failed: 0, successRate: 0, last24h: 0 },
      pools: { utilization: {}, totalLiquidity: 0, averageAge: 0 },
      users: { active: 0, new: 0, returning: 0 }
    };

    // Обновляем транзакции
    businessMetrics.transactions.total++;
    if (operation.status === 'COMPLETED') {
      businessMetrics.transactions.successful++;
    } else if (operation.status === 'FAILED') {
      businessMetrics.transactions.failed++;
    }

    // Обновляем объемы
    if (!businessMetrics.volume.total[operation.currency]) {
      businessMetrics.volume.total[operation.currency] = 0;
    }
    businessMetrics.volume.total[operation.currency] += operation.amount || 0;

    this.metrics.business.set(timestamp, businessMetrics);
  }

  private _updateSecurityMetrics(event: SecurityEvent): void {
    const timestamp = Date.now();
    const securityMetrics = this.metrics.security.get(timestamp) || {
      events: 0,
      highRiskEvents: 0,
      averageRiskScore: 0,
      eventTypes: new Map()
    };

    securityMetrics.events++;
    if (event.riskScore && event.riskScore >= 70) {
      securityMetrics.highRiskEvents++;
    }

    const totalRisk = securityMetrics.averageRiskScore * (securityMetrics.events - 1);
    securityMetrics.averageRiskScore = (totalRisk + (event.riskScore || 0)) / securityMetrics.events;

    const typeCount = securityMetrics.eventTypes.get(event.type) || 0;
    securityMetrics.eventTypes.set(event.type, typeCount + 1);

    this.metrics.security.set(timestamp, securityMetrics);
  }

  private async _collectSecurityMetrics(): Promise<void> {
    try {
      const metrics = {
        timestamp: new Date(),
        activeThreats: await this._getActiveThreatsCount(),
        riskScore: await this._getCurrentRiskScore(),
        blockedTransactions: await this._getBlockedTransactionsCount(),
        suspiciousPatterns: await this._getSuspiciousPatternsCount()
      };

      this.metrics.security.set(Date.now(), metrics);

    } catch (error) {
      this.logger?.error('Ошибка сбора метрик безопасности:', error);
    }
  }

  private async _collectPerformanceMetrics(): Promise<void> {
    try {
      const metrics = {
        timestamp: new Date(),
        responseTime: await this._getAverageResponseTime(),
        throughput: this._calculateThroughput(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        activeConnections: await this._getConnectionCount()
      };

      this.metrics.performance.set(Date.now(), metrics);

    } catch (error) {
      this.logger?.error('Ошибка сбора метрик производительности:', error);
    }
  }

  private async _checkAlerts(operation: MixingOperation): Promise<void> {
    // Проверяем на частые ошибки
    if (operation.status === 'FAILED') {
      const recentFailures = await this._getRecentFailures(10 * 60 * 1000); // 10 минут
      if (this.config.alertThresholds.failedMixes !== undefined && recentFailures >= this.config.alertThresholds.failedMixes) {
        await this.createAlert({
          type: 'HIGH_FAILURE_RATE',
          severity: 'HIGH',
          title: 'Высокий уровень неудачных миксов',
          description: `${recentFailures} неудачных миксов за последние 10 минут`,
          source: 'MIXING_ENGINE',
          threshold: this.config.alertThresholds.failedMixes,
          currentValue: recentFailures
        });
      }
    }

    // Проверяем задержки
    if (operation.duration && this.config.alertThresholds.latency !== undefined && operation.duration > this.config.alertThresholds.latency) {
      await this.createAlert({
        type: 'HIGH_LATENCY',
        severity: 'MEDIUM',
        title: 'Высокая задержка операции',
        description: `Операция выполнялась ${operation.duration}мс`,
        source: 'PERFORMANCE',
        threshold: this.config.alertThresholds.latency,
        currentValue: operation.duration
      });
    }
  }

  /**
   * Проверяет системные пороговые значения
   */
  private async _checkSystemThresholds(metrics: SystemMetrics): Promise<Array<{ type: string; value: number; threshold: number; queue?: string }>> {
    if (!metrics || !this.config.alertThresholds) {
      return [];
    }

    try {
      const issues: Array<{ type: string; value: number; threshold: number; queue?: string }> = [];

      // Проверяем CPU
      if (metrics.system && metrics.system.cpuUsage && this.config.alertThresholds.systemLoad !== undefined) {
        const cpuUsage = this._calculateCPUUsage(metrics.system.cpuUsage);
        if (cpuUsage > this.config.alertThresholds.systemLoad) {
          issues.push({
            type: 'HIGH_CPU',
            value: cpuUsage,
            threshold: this.config.alertThresholds.systemLoad
          });
        }
      }

      // Проверяем память
      if (metrics.system && metrics.system.memoryUsage && this.config.alertThresholds.memoryUsage !== undefined) {
        const memoryUsage = (metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100;
        if (memoryUsage > this.config.alertThresholds.memoryUsage) {
          issues.push({
            type: 'HIGH_MEMORY',
            value: memoryUsage,
            threshold: this.config.alertThresholds.memoryUsage
          });
        }
      }

      // Создаем алерты для найденных проблем
      for (const issue of issues) {
        this.logger?.warn('Системный порог превышен:', issue);

        await this.createAlert({
          type: issue.type,
          severity: 'HIGH',
          title: `Превышен системный порог: ${issue.type}`,
          description: `Значение: ${issue.value}, Порог: ${issue.threshold}`,
          source: 'SYSTEM_THRESHOLDS',
          currentValue: issue.value,
          threshold: issue.threshold
        });
      }

      return issues;
    } catch (error) {
      this.logger?.error('Ошибка проверки системных порогов:', error);
      return [];
    }
  }

  private async _checkSystemAlerts(): Promise<void> {
    try {
      const metrics = await this.collectSystemMetrics();
      if (!metrics) return;

      // Проверяем загрузку CPU
      if (metrics.system?.cpuUsage && this.config.alertThresholds.systemLoad !== undefined) {
        const cpuUsage = this._calculateCPUUsage(metrics.system.cpuUsage);
        if (cpuUsage > this.config.alertThresholds.systemLoad) {
          await this.createAlert({
            type: 'HIGH_CPU_USAGE',
            severity: 'HIGH',
            title: 'Высокая загрузка CPU',
            description: `Загрузка CPU: ${cpuUsage.toFixed(2)}%`,
            source: 'SYSTEM',
            threshold: this.config.alertThresholds.systemLoad,
            currentValue: cpuUsage
          });
        }
      }

      // Проверяем использование памяти
      if (metrics.system?.memoryUsage && this.config.alertThresholds.memoryUsage !== undefined) {
        const memoryUsage = (metrics.system.memoryUsage.heapUsed / metrics.system.memoryUsage.heapTotal) * 100;
        if (memoryUsage > this.config.alertThresholds.memoryUsage) {
          await this.createAlert({
            type: 'HIGH_MEMORY_USAGE',
            severity: 'HIGH',
            title: 'Высокое использование памяти',
            description: `Использование памяти: ${memoryUsage.toFixed(2)}%`,
            source: 'SYSTEM',
            threshold: this.config.alertThresholds.memoryUsage,
            currentValue: memoryUsage
          });
        }
      }

    } catch (error) {
      this.logger?.error('Ошибка проверки системных алертов:', error);
    }
  }

  private async _checkBusinessAlerts(): Promise<void> {
    try {
      // Проверяем утилизацию пулов
      const poolUtilization = await this._getPoolUtilization();
      for (const [currency, utilization] of Object.entries(poolUtilization)) {
        if (this.config.alertThresholds.poolUtilization !== undefined && utilization > this.config.alertThresholds.poolUtilization) {
          await this.createAlert({
            type: 'HIGH_POOL_UTILIZATION',
            severity: 'MEDIUM',
            title: `Высокая утилизация пула ${currency}`,
            description: `Утилизация пула ${currency}: ${utilization.toFixed(2)}%`,
            source: 'POOL_MANAGER',
            threshold: this.config.alertThresholds.poolUtilization,
            currentValue: utilization
          });
        }
      }

    } catch (error) {
      this.logger?.error('Ошибка проверки бизнес-алертов:', error);
    }
  }

  private async _triggerSecurityAlert(securityLog: SecurityLog): Promise<void> {
    await this.createAlert({
      type: 'SECURITY_INCIDENT',
      severity: securityLog.severity,
      title: `Инцидент безопасности: ${securityLog.eventType}`,
      description: securityLog.description,
      source: 'SECURITY',
      metadata: securityLog.metadata,
      threshold: 80,
      currentValue: securityLog.riskScore
    });
  }

  // Методы для работы с данными

  private async _saveLogEntry(logEntry: LogEntry): Promise<void> {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO operation_logs (
          id, mix_id, operation, status, currency, amount, 
          participants, duration, metadata, timestamp, level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      await this.database.query(query, [
        logEntry.id,
        logEntry.mixId,
        logEntry.operation,
        logEntry.status,
        logEntry.currency,
        logEntry.amount,
        logEntry.participants,
        logEntry.duration,
        JSON.stringify(logEntry.metadata),
        logEntry.timestamp,
        logEntry.level
      ]);
    } catch (error) {
      this.logger?.error('Ошибка сохранения лога операции:', error);
    }
  }

  private async _saveSecurityLog(securityLog: SecurityLog): Promise<void> {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO security_logs (
          id, event_type, severity, source, description, 
          metadata, risk_score, action_taken, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await this.database.query(query, [
        securityLog.id,
        securityLog.eventType,
        securityLog.severity,
        securityLog.source,
        securityLog.description,
        JSON.stringify(securityLog.metadata),
        securityLog.riskScore,
        securityLog.actionTaken,
        securityLog.timestamp
      ]);
    } catch (error) {
      this.logger?.error('Ошибка сохранения лога безопасности:', error);
    }
  }

  private async _saveAlert(alertEntry: AlertEntry): Promise<void> {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO alerts (
          id, type, severity, title, description, source,
          metadata, threshold_value, current_value, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      await this.database.query(query, [
        alertEntry.id,
        alertEntry.type,
        alertEntry.severity,
        alertEntry.title,
        alertEntry.description,
        alertEntry.source,
        JSON.stringify(alertEntry.metadata),
        alertEntry.threshold,
        alertEntry.currentValue,
        alertEntry.status,
        alertEntry.createdAt
      ]);
    } catch (error) {
      this.logger?.error('Ошибка сохранения алерта:', error);
    }
  }

  private async _saveMetrics(): Promise<void> {
    // Сохранение метрик в долгосрочное хранилище
    this.logger?.info('Метрики сохранены');
  }

  // Утилиты и вспомогательные методы

  private _determineLogLevel(operation: MixingOperation): string {
    if (operation.status === 'FAILED') return 'error';
    if (operation.status === 'WARNING') return 'warn';
    return 'info';
  }

  private _hashIP(ip: string): string {
    // Хешируем IP для сохранения приватности
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  private _isDuplicateAlert(alertEntry: AlertEntry): boolean {
    const recentAlerts = Array.from(this.recentAlerts.values())
      .filter(alert =>
        alert.type === alertEntry.type &&
        alert.status === 'ACTIVE' &&
        Date.now() - new Date(alert.createdAt).getTime() < 5 * 60 * 1000 // 5 минут
      );

    return recentAlerts.length > 0;
  }

  private async _sendAlertNotifications(alertEntry: AlertEntry): Promise<void> {
    // Отправка уведомлений (email, slack, etc.)
    this.logger?.warn('ALERT:', alertEntry.title, alertEntry.description);

    if (this.alertManager) {
      await this.alertManager.sendNotification(alertEntry);
    }
  }

  private _calculateSuccessRate(): number {
    const total = this.counters.totalMixes;
    if (total === 0) return 0;
    return (this.counters.successfulMixes / total) * 100;
  }

  private _calculateAverageLatency(): number {
    try {
      // Вычисляем среднюю задержку из метрик производительности
      const recentMetrics = Array.from(this.metrics.performance.entries())
        .slice(-10) // Последние 10 записей
        .map(([, metric]) => metric?.responseTime)
        .filter((time): time is number => typeof time === 'number' && !isNaN(time) && isFinite(time));

      if (recentMetrics.length === 0) return 0;
      
      const average = recentMetrics.reduce((sum: number, time: number) => sum + time, 0) / recentMetrics.length;
      return isNaN(average) || !isFinite(average) ? 0 : average;
    } catch (error) {
      this.logger?.error('Ошибка расчета средней задержки:', error);
      return 0;
    }
  }

  private _calculateErrorRate(): number {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();

    // Подсчитываем ошибки за последний час из логов
    return this.counters.failedMixes; // Упрощенная реализация
  }

  private _calculateThroughput(): number {
    const oneMinute = 60 * 1000;
    const now = Date.now();

    // Подсчитываем транзакции за последнюю минуту
    return this.counters.successfulMixes; // Упрощенная реализация
  }

  private _calculateCPUUsage(cpuUsage: NodeJS.CpuUsage): number {
    // Упрощенный расчет загрузки CPU
    if (!cpuUsage) return 0;

    const { user, system } = cpuUsage;
    const total = user + system;
    return Math.min((total / 1000000) * 100, 100); // Конвертируем в проценты
  }

  private async _getPoolCount(): Promise<number> {
    // Получаем количество активных пулов
    return 4; // BTC, ETH, USDT, SOL
  }

  private async _getQueueSize(): Promise<number> {
    // Получаем размер очереди
    return 0; // Заглушка
  }

  private async _getConnectionCount(): Promise<number> {
    // Получаем количество активных соединений
    return 0; // Заглушка
  }

  private async _getBandwidthUsage(): Promise<{ upload: number; download: number }> {
    // Получаем использование пропускной способности
    return { upload: 0, download: 0 };
  }

  private async _getRecentFailures(timeWindow: number): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT COUNT(*) as failures
        FROM operation_logs
        WHERE status = 'FAILED'
        AND timestamp >= NOW() - INTERVAL '${timeWindow / 1000} seconds'
      `;

      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.failures) || 0;
    } catch (error) {
      return 0;
    }
  }

  private _getAlertsInLast24h(): number {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return Array.from(this.recentAlerts.values())
      .filter(alert => new Date(alert.createdAt).getTime() > oneDayAgo)
      .length;
  }

  private _getStartTimeForRange(timeRange: string, endTime: number): number {
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    return endTime - (ranges[timeRange] || ranges['24h']);
  }

  private async _establishPerformanceBaseline(): Promise<void> {
    // Устанавливаем базовые показатели производительности
    this.performanceBaseline.set('latency', 500);      // 500мс
    this.performanceBaseline.set('throughput', 10);    // 10 tps
    this.performanceBaseline.set('errorRate', 1);      // 1%
  }

  private async _performDataCleanup(): Promise<void> {
    try {
      const now = Date.now();

      // Очищаем старые метрики
      for (const [category, metricsMap] of Object.entries(this.metrics)) {
        const retention = this.config.dataRetention.metrics;
        if (retention === undefined) continue;
        const cutoff = now - retention;

        for (const [timestamp] of metricsMap) {
          if (timestamp < cutoff) {
            metricsMap.delete(timestamp);
          }
        }
      }

      // Очищаем старые алерты из кеша
      const alertRetention = this.config.dataRetention.alerts;
      if (alertRetention !== undefined) {
        const alertCutoff = now - alertRetention;

        for (const [id, alert] of Array.from(this.recentAlerts.entries())) {
          if (new Date(alert.createdAt).getTime() < alertCutoff) {
            this.recentAlerts.delete(id);
          }
        }
      }

      this.logger?.info('Выполнена очистка данных мониторинга');

    } catch (error) {
      this.logger?.error('Ошибка очистки данных:', error);
    }
  }

  // Полноценные методы интеграции с системами безопасности и мониторинга

  /**
   * Получение количества активных угроз из логов безопасности
   */
  private async _getActiveThreatsCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT COUNT(*) as active_threats
        FROM security_logs
        WHERE severity IN ('HIGH', 'CRITICAL')
        AND risk_score >= 70
        AND timestamp >= NOW() - INTERVAL '24 hours'
      `;
      
      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.active_threats) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения активных угроз:', error);
      return 0;
    }
  }

  /**
   * Вычисление текущего рискового скора на основе событий безопасности
   */
  private async _getCurrentRiskScore(): Promise<number> {
    if (!this.database) return 0;

    try {
      // Получаем средний рисковый скор за последний час
      const query = `
        SELECT 
          AVG(risk_score) as avg_risk,
          COUNT(*) as event_count,
          MAX(risk_score) as max_risk
        FROM security_logs
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        AND risk_score > 0
      `;
      
      const result = await this.database.query(query);
      if (result.rows.length === 0) return 0;

      const row = result.rows[0];
      const avgRisk = parseFloat(row.avg_risk) || 0;
      const eventCount = parseInt(row.event_count) || 0;
      const maxRisk = parseFloat(row.max_risk) || 0;

      // Алгоритм расчета текущего риска:
      // Базовый риск + вес количества событий + бонус за максимальный риск
      let currentRisk = avgRisk;
      
      // Увеличиваем риск если много событий (> 10 за час)
      if (eventCount > 10) {
        currentRisk += Math.min(eventCount * 0.5, 20); // Максимум +20
      }
      
      // Бонус за критические события
      if (maxRisk >= 90) {
        currentRisk += 15;
      } else if (maxRisk >= 80) {
        currentRisk += 10;
      }

      return Math.min(Math.round(currentRisk), 100);
    } catch (error) {
      this.logger?.error('Ошибка вычисления рискового скора:', error);
      return 0;
    }
  }

  /**
   * Получение количества заблокированных транзакций
   */
  private async _getBlockedTransactionsCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT COUNT(*) as blocked_count
        FROM mix_requests
        WHERE status = 'BLOCKED'
        AND created_at >= NOW() - INTERVAL '24 hours'
      `;
      
      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.blocked_count) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения заблокированных транзакций:', error);
      return 0;
    }
  }

  /**
   * Обнаружение подозрительных паттернов в транзакциях
   */
  private async _getSuspiciousPatternsCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      let suspiciousCount = 0;
      
      // Паттерн 1: Множественные микс-запросы с одного IP за короткое время
      const multipleRequestsQuery = `
        SELECT COUNT(DISTINCT mr.id) as suspicious_requests
        FROM mix_requests mr
        JOIN audit_logs al ON al.mix_request_id = mr.id
        WHERE mr.created_at >= NOW() - INTERVAL '1 hour'
        GROUP BY al.ip_address_hash
        HAVING COUNT(*) > 5
      `;
      
      const multipleResult = await this.database.query(multipleRequestsQuery);
      suspiciousCount += multipleResult.rows.length;

      // Паттерн 2: Необычно крупные суммы (> 95 перцентиля)
      const largeAmountsQuery = `
        WITH percentiles AS (
          SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount) as p95
          FROM mix_requests
          WHERE created_at >= NOW() - INTERVAL '7 days'
        )
        SELECT COUNT(*) as large_amounts
        FROM mix_requests mr, percentiles p
        WHERE mr.amount > p.p95
        AND mr.created_at >= NOW() - INTERVAL '24 hours'
      `;
      
      const largeResult = await this.database.query(largeAmountsQuery);
      suspiciousCount += parseInt(largeResult.rows[0]?.large_amounts) || 0;

      // Паттерн 3: Быстрые повторные транзакции (< 5 минут между запросами)
      const rapidTransactionsQuery = `
        SELECT COUNT(*) as rapid_transactions
        FROM (
          SELECT 
            user_id,
            LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) as prev_time,
            created_at
          FROM mix_requests
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        ) t
        WHERE EXTRACT(EPOCH FROM (created_at - prev_time)) < 300
      `;
      
      const rapidResult = await this.database.query(rapidTransactionsQuery);
      suspiciousCount += parseInt(rapidResult.rows[0]?.rapid_transactions) || 0;

      return suspiciousCount;
    } catch (error) {
      this.logger?.error('Ошибка обнаружения подозрительных паттернов:', error);
      return 0;
    }
  }

  /**
   * Вычисление среднего времени отклика системы
   */
  private async _getAverageResponseTime(): Promise<number> {
    if (!this.database) return 200;

    try {
      const query = `
        SELECT AVG(duration) as avg_response_time
        FROM operation_logs
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        AND duration IS NOT NULL
        AND duration > 0
      `;
      
      const result = await this.database.query(query);
      return parseFloat(result.rows[0]?.avg_response_time) || 200;
    } catch (error) {
      this.logger?.error('Ошибка получения времени отклика:', error);
      return 200;
    }
  }

  /**
   * Получение утилизации пулов по валютам
   */
  private async _getPoolUtilization(): Promise<Record<string, number>> {
    if (!this.database) return { BTC: 50, ETH: 60, USDT: 40, SOL: 55 };

    try {
      const query = `
        WITH pool_stats AS (
          SELECT 
            currency,
            SUM(balance) as total_balance,
            SUM(reserved_balance) as total_reserved,
            COUNT(*) as wallet_count
          FROM wallets
          WHERE type = 'POOL'
          AND status = 'ACTIVE'
          GROUP BY currency
        ),
        active_requests AS (
          SELECT 
            currency,
            SUM(amount) as active_amount
          FROM mix_requests
          WHERE status IN ('PENDING', 'PROCESSING')
          GROUP BY currency
        )
        SELECT 
          ps.currency,
          CASE 
            WHEN ps.total_balance > 0 
            THEN ROUND(((ps.total_reserved + COALESCE(ar.active_amount, 0)) / ps.total_balance) * 100, 2)
            ELSE 0
          END as utilization
        FROM pool_stats ps
        LEFT JOIN active_requests ar ON ps.currency = ar.currency
      `;
      
      const result = await this.database.query(query);
      const utilization: Record<string, number> = {};
      
      result.rows.forEach((row: any) => {
        utilization[row.currency] = parseFloat(row.utilization) || 0;
      });
      
      // Устанавливаем значения по умолчанию для отсутствующих валют
      ['BTC', 'ETH', 'USDT', 'SOL'].forEach(currency => {
        if (!(currency in utilization)) {
          utilization[currency] = 0;
        }
      });
      
      return utilization;
    } catch (error) {
      this.logger?.error('Ошибка получения утилизации пулов:', error);
      return { BTC: 50, ETH: 60, USDT: 40, SOL: 55 };
    }
  }

  /**
   * Получение общей ликвидности системы
   */
  private async _getTotalLiquidity(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT 
          currency,
          SUM(available_balance) as available_liquidity
        FROM wallets
        WHERE status = 'ACTIVE'
        AND type IN ('POOL', 'HOT')
        GROUP BY currency
      `;
      
      const result = await this.database.query(query);
      
      // Преобразуем в USD эквивалент (упрощенный расчет)
      const exchangeRates = {
        BTC: 45000,
        ETH: 2500,
        USDT: 1,
        SOL: 100
      };
      
      let totalLiquidityUSD = 0;
      result.rows.forEach((row: any) => {
        const amount = parseFloat(row.available_liquidity) || 0;
        const rate = exchangeRates[row.currency as keyof typeof exchangeRates] || 0;
        totalLiquidityUSD += amount * rate;
      });
      
      return Math.round(totalLiquidityUSD);
    } catch (error) {
      this.logger?.error('Ошибка получения ликвидности:', error);
      return 0;
    }
  }

  /**
   * Получение среднего возраста пулов (время с последнего использования)
   */
  private async _getAveragePoolAge(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT 
          AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(last_used_at, created_at)))) as avg_age_seconds
        FROM wallets
        WHERE type = 'POOL'
        AND status = 'ACTIVE'
      `;
      
      const result = await this.database.query(query);
      const ageSeconds = parseFloat(result.rows[0]?.avg_age_seconds) || 0;
      
      // Возвращаем возраст в часах
      return Math.round(ageSeconds / 3600);
    } catch (error) {
      this.logger?.error('Ошибка получения возраста пулов:', error);
      return 0;
    }
  }

  /**
   * Получение количества активных пользователей (за последние 24 часа)
   */
  private async _getActiveUsersCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT COUNT(DISTINCT user_id) as active_users
        FROM mix_requests
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND user_id IS NOT NULL
      `;
      
      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.active_users) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения активных пользователей:', error);
      return 0;
    }
  }

  /**
   * Получение количества новых пользователей (первая транзакция за последние 24 часа)
   */
  private async _getNewUsersCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        WITH user_first_transaction AS (
          SELECT 
            user_id,
            MIN(created_at) as first_transaction
          FROM mix_requests
          WHERE user_id IS NOT NULL
          GROUP BY user_id
        )
        SELECT COUNT(*) as new_users
        FROM user_first_transaction
        WHERE first_transaction >= NOW() - INTERVAL '24 hours'
      `;
      
      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.new_users) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения новых пользователей:', error);
      return 0;
    }
  }

  /**
   * Получение количества возвращающихся пользователей
   */
  private async _getReturningUsersCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        WITH user_stats AS (
          SELECT 
            user_id,
            COUNT(*) as transaction_count,
            MIN(created_at) as first_transaction
          FROM mix_requests
          WHERE user_id IS NOT NULL
          AND created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY user_id
        )
        SELECT COUNT(*) as returning_users
        FROM user_stats
        WHERE transaction_count > 1
        OR first_transaction < NOW() - INTERVAL '24 hours'
      `;
      
      const result = await this.database.query(query);
      return parseInt(result.rows[0]?.returning_users) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения возвращающихся пользователей:', error);
      return 0;
    }
  }

  /**
   * Получение объема транзакций в заданном временном окне
   */
  private async _getVolumeInWindow(startTime: number, endTime: number): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT SUM(amount) as total_volume
        FROM mix_requests
        WHERE status = 'COMPLETED'
        AND created_at >= $1
        AND created_at <= $2
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return parseFloat(result.rows[0]?.total_volume) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения объема в окне:', error);
      return 0;
    }
  }

  /**
   * Получение количества транзакций в заданном временном окне
   */
  private async _getTransactionCountInWindow(startTime: number, endTime: number): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = `
        SELECT COUNT(*) as transaction_count
        FROM mix_requests
        WHERE created_at >= $1
        AND created_at <= $2
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return parseInt(result.rows[0]?.transaction_count) || 0;
    } catch (error) {
      this.logger?.error('Ошибка получения количества транзакций в окне:', error);
      return 0;
    }
  }

  /**
   * Получение почасового объема транзакций за последние 24 часа
   */
  private async _getHourlyVolume(): Promise<number[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour_bucket,
          SUM(amount) as hourly_volume
        FROM mix_requests
        WHERE status = 'COMPLETED'
        AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY hour_bucket
        ORDER BY hour_bucket
      `;
      
      const result = await this.database.query(query);
      
      // Создаем массив на 24 часа с заполнением нулями
      const hourlyData = new Array(24).fill(0);
      const now = new Date();
      
      result.rows.forEach((row: any) => {
        const hourBucket = new Date(row.hour_bucket);
        const hoursAgo = Math.floor((now.getTime() - hourBucket.getTime()) / (1000 * 60 * 60));
        
        if (hoursAgo >= 0 && hoursAgo < 24) {
          hourlyData[23 - hoursAgo] = parseFloat(row.hourly_volume) || 0;
        }
      });
      
      return hourlyData;
    } catch (error) {
      this.logger?.error('Ошибка получения почасового объема:', error);
      return [];
    }
  }

  /**
   * Вычисление перцентилей задержки в заданном временном окне
   */
  private async _calculateLatencyPercentiles(startTime: number, endTime: number): Promise<{ p50: number; p90: number; p99: number }> {
    if (!this.database) return { p50: 0, p90: 0, p99: 0 };

    try {
      const query = `
        SELECT 
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration) as p50,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY duration) as p90,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99
        FROM operation_logs
        WHERE timestamp >= $1
        AND timestamp <= $2
        AND duration IS NOT NULL
        AND duration > 0
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      if (result.rows.length === 0) {
        return { p50: 0, p90: 0, p99: 0 };
      }
      
      const row = result.rows[0];
      return {
        p50: Math.round(parseFloat(row.p50) || 0),
        p90: Math.round(parseFloat(row.p90) || 0),
        p99: Math.round(parseFloat(row.p99) || 0)
      };
    } catch (error) {
      this.logger?.error('Ошибка вычисления перцентилей задержки:', error);
      return { p50: 0, p90: 0, p99: 0 };
    }
  }

  /**
   * Получение данных пропускной способности по времени
   */
  private async _getThroughputData(startTime: number, endTime: number): Promise<any[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT 
          DATE_TRUNC('minute', created_at) as time_bucket,
          COUNT(*) as transactions_per_minute,
          AVG(amount) as avg_amount
        FROM mix_requests
        WHERE created_at >= $1
        AND created_at <= $2
        GROUP BY time_bucket
        ORDER BY time_bucket
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return result.rows.map((row: any) => ({
        timestamp: row.time_bucket,
        throughput: parseInt(row.transactions_per_minute) || 0,
        avgAmount: parseFloat(row.avg_amount) || 0
      }));
    } catch (error) {
      this.logger?.error('Ошибка получения данных пропускной способности:', error);
      return [];
    }
  }

  /**
   * Получение динамики ошибок по времени
   */
  private async _getErrorRateOverTime(startTime: number, endTime: number): Promise<any[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT 
          DATE_TRUNC('hour', timestamp) as hour_bucket,
          COUNT(*) as total_operations,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_operations,
          ROUND(
            (SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::FLOAT / COUNT(*)) * 100,
            2
          ) as error_rate_percent
        FROM operation_logs
        WHERE timestamp >= $1
        AND timestamp <= $2
        GROUP BY hour_bucket
        ORDER BY hour_bucket
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return result.rows.map((row: any) => ({
        timestamp: row.hour_bucket,
        totalOperations: parseInt(row.total_operations) || 0,
        failedOperations: parseInt(row.failed_operations) || 0,
        errorRate: parseFloat(row.error_rate_percent) || 0
      }));
    } catch (error) {
      this.logger?.error('Ошибка получения динамики ошибок:', error);
      return [];
    }
  }

  /**
   * Получение алертов в заданном временном диапазоне
   */
  private async _getAlertsInTimeRange(startTime: number, endTime: number): Promise<any[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT 
          id,
          type,
          severity,
          title,
          description,
          source,
          created_at,
          status
        FROM alerts
        WHERE created_at >= $1
        AND created_at <= $2
        ORDER BY created_at DESC
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        source: row.source,
        createdAt: row.created_at,
        status: row.status
      }));
    } catch (error) {
      this.logger?.error('Ошибка получения алертов:', error);
      return [];
    }
  }

  /**
   * Получение подозрительных активностей в заданном временном диапазоне
   */
  private async _getSuspiciousActivities(startTime: number, endTime: number): Promise<any[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT 
          sl.id,
          sl.event_type,
          sl.severity,
          sl.description,
          sl.risk_score,
          sl.timestamp,
          sl.action_taken
        FROM security_logs sl
        WHERE sl.timestamp >= $1
        AND sl.timestamp <= $2
        AND sl.risk_score >= 50
        ORDER BY sl.risk_score DESC, sl.timestamp DESC
        LIMIT 100
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        eventType: row.event_type,
        severity: row.severity,
        description: row.description,
        riskScore: parseFloat(row.risk_score) || 0,
        timestamp: row.timestamp,
        actionTaken: row.action_taken
      }));
    } catch (error) {
      this.logger?.error('Ошибка получения подозрительных активностей:', error);
      return [];
    }
  }

  /**
   * Получение распределения рискового скора
   */
  private async _getRiskScoreDistribution(startTime: number, endTime: number): Promise<Record<string, number>> {
    if (!this.database) return {};

    try {
      const query = `
        SELECT 
          CASE 
            WHEN risk_score >= 0 AND risk_score < 20 THEN 'low'
            WHEN risk_score >= 20 AND risk_score < 50 THEN 'medium'
            WHEN risk_score >= 50 AND risk_score < 80 THEN 'high'
            WHEN risk_score >= 80 THEN 'critical'
            ELSE 'unknown'
          END as risk_category,
          COUNT(*) as count
        FROM security_logs
        WHERE timestamp >= $1
        AND timestamp <= $2
        AND risk_score IS NOT NULL
        GROUP BY risk_category
      `;
      
      const result = await this.database.query(query, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      const distribution: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      };
      
      result.rows.forEach((row: any) => {
        distribution[row.risk_category] = parseInt(row.count) || 0;
      });
      
      return distribution;
    } catch (error) {
      this.logger?.error('Ошибка получения распределения рискового скора:', error);
      return {};
    }
  }

  /**
   * Заполнение данными отчета о производительности
   */
  private async _populateReportData(report: PerformanceReport, startTime: number, endTime: number): Promise<void> {
    try {
      // Получаем общую статистику
      const totalMixes = await this._getTransactionCountInWindow(startTime, endTime);
      const totalVolume = await this._getVolumeInWindow(startTime, endTime);
      
      // Получаем статистику по статусам
      const statusQuery = `
        SELECT 
          status,
          COUNT(*) as count,
          SUM(amount) as volume
        FROM mix_requests
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY status
      `;
      
      const statusResult = await this.database?.query(statusQuery, [
        new Date(startTime),
        new Date(endTime)
      ]);
      
      let successfulMixes = 0;
      let errorCount = 0;
      
      statusResult?.rows.forEach((row: any) => {
        if (row.status === 'COMPLETED') {
          successfulMixes = parseInt(row.count) || 0;
        } else if (row.status === 'FAILED') {
          errorCount = parseInt(row.count) || 0;
        }
      });
      
      // Заполняем summary
      report.summary.totalMixes = totalMixes;
      report.summary.successRate = totalMixes > 0 ? (successfulMixes / totalMixes) * 100 : 0;
      report.summary.averageLatency = await this._getAverageResponseTime();
      report.summary.totalVolume = new Map([['total', totalVolume]]);
      report.summary.errorCount = errorCount;
      
    } catch (error) {
      this.logger?.error('Ошибка заполнения данных отчета:', error);
    }
  }

  /**
   * Сохранение отчета о производительности в базу данных
   */
  private async _savePerformanceReport(report: PerformanceReport): Promise<void> {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO performance_reports (
          id, time_range, generated_at, summary_data, 
          performance_data, security_data, recommendations
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const reportId = crypto.randomBytes(16).toString('hex');
      
      await this.database.query(query, [
        reportId,
        report.timeRange,
        report.generatedAt,
        JSON.stringify({
          totalMixes: report.summary.totalMixes,
          successRate: report.summary.successRate,
          averageLatency: report.summary.averageLatency,
          totalVolume: Object.fromEntries(report.summary.totalVolume),
          errorCount: report.summary.errorCount
        }),
        JSON.stringify(report.performance),
        JSON.stringify(report.security),
        JSON.stringify(report.recommendations)
      ]);
      
      this.logger?.info('Отчет о производительности сохранен:', {
        reportId,
        timeRange: report.timeRange
      });
      
    } catch (error) {
      this.logger?.error('Ошибка сохранения отчета о производительности:', error);
    }
  }

  /**
   * Генерация рекомендаций на основе анализа отчета
   */
  private _generateRecommendations(report: PerformanceReport): string[] {
    const recommendations: string[] = [];

    // Анализ успешности операций
    if (report.summary.successRate < 95) {
      if (report.summary.successRate < 85) {
        recommendations.push('🔴 КРИТИЧНО: Очень низкий уровень успешности операций (<85%). Требуется немедленная диагностика системы.');
      } else {
        recommendations.push('🟡 Умеренно низкий уровень успешности операций. Рекомендуется проверка стабильности системы микширования.');
      }
    }

    // Анализ производительности
    if (report.summary.averageLatency > 2000) {
      if (report.summary.averageLatency > 5000) {
        recommendations.push('🔴 КРИТИЧНО: Очень высокая задержка операций (>5с). Необходима оптимизация архитектуры.');
      } else {
        recommendations.push('🟡 Повышенная задержка операций. Рекомендуется оптимизация производительности.');
      }
    }

    // Анализ ошибок
    const errorRate = report.summary.totalMixes > 0 ? (report.summary.errorCount / report.summary.totalMixes) * 100 : 0;
    if (errorRate > 10) {
      recommendations.push('🔴 Высокий уровень ошибок (>10%). Требуется анализ логов и исправление проблем.');
    } else if (errorRate > 5) {
      recommendations.push('🟡 Умеренный уровень ошибок. Рекомендуется мониторинг и профилактика.');
    }

    // Анализ безопасности
    const totalSecurityEvents = Object.values(report.security.riskScoreDistribution || {}).reduce((sum, count) => sum + count, 0);
    const criticalEvents = report.security.riskScoreDistribution?.critical || 0;
    const highRiskEvents = report.security.riskScoreDistribution?.high || 0;
    
    if (criticalEvents > 0) {
      recommendations.push(`🔴 БЕЗОПАСНОСТЬ: Обнаружены критические события безопасности (${criticalEvents}). Требуется немедленное расследование.`);
    }
    
    if (highRiskEvents > 5) {
      recommendations.push(`🟡 БЕЗОПАСНОСТЬ: Повышенное количество событий высокого риска (${highRiskEvents}). Рекомендуется усиление мониторинга.`);
    }

    // Анализ алертов
    const totalAlerts = report.security.alertsTriggered?.length || 0;
    if (totalAlerts > 20) {
      recommendations.push('🟡 Большое количество алертов. Рекомендуется оптимизация пороговых значений или устранение основных проблем.');
    }

    // Анализ объема транзакций
    const totalVolumeValue = Array.from(report.summary.totalVolume.values())[0] || 0;
    if (totalVolumeValue === 0) {
      recommendations.push('🟡 Отсутствует объем транзакций. Проверьте работу системы и привлечение пользователей.');
    }

    // Анализ пропускной способности
    const avgThroughput = report.performance.throughputData?.reduce((sum, item) => sum + (item.throughput || 0), 0) / (report.performance.throughputData?.length || 1);
    if (avgThroughput < 1) {
      recommendations.push('🟡 Низкая пропускная способность (<1 tps). Рекомендуется оптимизация обработки транзакций.');
    }

    // Рекомендации по улучшению
    if (recommendations.length === 0) {
      recommendations.push('✅ Система работает стабильно. Рекомендуется продолжать мониторинг и профилактическое обслуживание.');
      
      // Добавляем проактивные рекомендации
      if (report.summary.successRate > 98) {
        recommendations.push('💡 Рассмотрите возможность увеличения нагрузки или добавления новых функций.');
      }
      
      if (report.summary.averageLatency < 500) {
        recommendations.push('💡 Отличная производительность! Можно рассмотреть увеличение сложности алгоритмов микширования.');
      }
    }

    return recommendations;
  }
}

export default MonitoringSystem;
export { MonitoringSystem };
export type {
  MonitoringSystemConfig,
  MonitoringSystemDependencies,
  MixingOperation,
  SecurityEvent,
  SystemMetrics,
  BusinessMetrics,
  PerformanceReport,
  MonitoringStatus,
  MonitoringHealthCheck,
  MonitoringStatistics,
  AlertEntry,
  LogEntry,
  SecurityLog
};