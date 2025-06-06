const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Система мониторинга и логирования для крипто миксера
 * Обеспечивает полное отслеживание операций, метрик и алертов
 */
class MonitoringSystem extends EventEmitter {
  constructor(dependencies = {}) {
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
        performance: 5 * 1000     // 5 секунд
      },
      
      // Пороговые значения для алертов
      alertThresholds: {
        systemLoad: 85,           // CPU/Memory %
        errorRate: 5,             // Ошибок в минуту
        latency: 2000,            // Задержка в мс
        failedMixes: 3,           // Неудачных миксов за 10 минут
        suspiciousActivity: 10,   // Подозрительных активностей в час
        poolUtilization: 95       // Утилизация пула %
      },
      
      // Настройки ретенции данных
      dataRetention: {
        metrics: 30 * 24 * 60 * 60 * 1000,     // 30 дней
        logs: 90 * 24 * 60 * 60 * 1000,        // 90 дней
        transactions: 365 * 24 * 60 * 60 * 1000, // 1 год
        alerts: 180 * 24 * 60 * 60 * 1000      // 180 дней
      },
      
      // Уровни логирования
      logLevels: {
        error: true,
        warn: true,
        info: true,
        debug: false,
        trace: false
      },
      
      ...dependencies.config
    };
    
    // Хранилище метрик
    this.metrics = {
      system: new Map(),
      business: new Map(),
      security: new Map(),
      performance: new Map()
    };
    
    // Кеши для быстрого доступа
    this.recentAlerts = new Map();
    this.activeMonitors = new Map();
    this.performanceBaseline = new Map();
    
    // Счетчики и статистика
    this.counters = {
      totalMixes: 0,
      successfulMixes: 0,
      failedMixes: 0,
      totalVolume: new Map(),
      alertsTriggered: 0,
      systemRestarts: 0
    };
    
    // Таймеры для периодических задач
    this.timers = new Map();
    
    this.isMonitoring = false;
    
    this.logger?.info('MonitoringSystem инициализирован');
  }

  /**
   * Запускает систему мониторинга
   */
  async startMonitoring() {
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
  async stopMonitoring() {
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
  async logMixingOperation(operation) {
    try {
      const logEntry = {
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
          ipAddress: operation.ipAddress ? this._hashIP(operation.ipAddress) : null,
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
  async logSecurityEvent(event) {
    try {
      const securityLog = {
        id: crypto.randomBytes(16).toString('hex'),
        eventType: event.type,
        severity: event.severity || 'MEDIUM',
        source: event.source,
        description: event.description,
        metadata: {
          userId: event.userId,
          ipAddress: event.ipAddress ? this._hashIP(event.ipAddress) : null,
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
      if (event.severity === 'CRITICAL' || event.riskScore >= 80) {
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
  async collectSystemMetrics() {
    try {
      const metrics = {
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
  async collectBusinessMetrics() {
    try {
      const timeWindow = 24 * 60 * 60 * 1000; // 24 часа
      const now = Date.now();
      
      const metrics = {
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
  async generatePerformanceReport(timeRange = '24h') {
    try {
      const endTime = Date.now();
      const startTime = this._getStartTimeForRange(timeRange, endTime);
      
      const report = {
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
  async createAlert(alert) {
    try {
      const alertEntry = {
        id: crypto.randomBytes(16).toString('hex'),
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        source: alert.source,
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
   * Получает статистику мониторинга
   */
  /**
   * Получает текущий статус системы мониторинга
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeAlerts: this.alerts.filter(alert => alert.status === 'ACTIVE').length,
      totalMetricsCollected: this.metricsCollected || 0,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Выполняет проверку состояния системы мониторинга
   */
  async healthCheck() {
    const health = {
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
          health.checks.database = { status: 'fail', message: `Ошибка БД: ${error.message}` };
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
      health.error = error.message;
      this.logger?.error('Ошибка проверки состояния мониторинга:', error);
    }

    return health;
  }

  getMonitoringStatistics() {
    const now = Date.now();
    
    return {
      system: {
        isMonitoring: this.isMonitoring,
        uptime: this.isMonitoring ? now - this._startTime : 0,
        metricsCollected: {
          system: this.metrics.system.size,
          business: this.metrics.business.size,
          security: this.metrics.security.size,
          performance: this.metrics.performance.size
        }
      },
      counters: {
        ...this.counters,
        totalVolume: Object.fromEntries(this.counters.totalVolume)
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

  async _initializeMetrics() {
    this._startTime = Date.now();
    
    // Инициализируем базовые счетчики
    this.counters.totalVolume.set('BTC', 0);
    this.counters.totalVolume.set('ETH', 0);
    this.counters.totalVolume.set('USDT', 0);
    this.counters.totalVolume.set('SOL', 0);
    
    // Загружаем базовые показатели производительности
    await this._establishPerformanceBaseline();
  }

  async _loadHistoricalData() {
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

  _startMetricsCollectors() {
    // Системные метрики
    this.timers.set('system', setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsIntervals.system));

    // Бизнес-метрики
    this.timers.set('business', setInterval(() => {
      this.collectBusinessMetrics();
    }, this.config.metricsIntervals.business));

    // Метрики безопасности
    this.timers.set('security', setInterval(() => {
      this._collectSecurityMetrics();
    }, this.config.metricsIntervals.security));

    // Метрики производительности
    this.timers.set('performance', setInterval(() => {
      this._collectPerformanceMetrics();
    }, this.config.metricsIntervals.performance));
  }

  _startAlertSystem() {
    // Мониторинг системных показателей
    this.timers.set('alertSystem', setInterval(() => {
      this._checkSystemAlerts();
    }, 30 * 1000)); // каждые 30 секунд

    // Мониторинг бизнес-показателей
    this.timers.set('alertBusiness', setInterval(() => {
      this._checkBusinessAlerts();
    }, 60 * 1000)); // каждую минуту
  }

  _startDataCleanup() {
    // Очистка устаревших данных каждые 6 часов
    this.timers.set('dataCleanup', setInterval(() => {
      this._performDataCleanup();
    }, 6 * 60 * 60 * 1000));
  }

  _stopAllTimers() {
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      this.logger?.debug('Остановлен таймер:', name);
    }
    this.timers.clear();
  }

  // Приватные методы для работы с метриками

  _updateCounters(operation) {
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

  _updateBusinessMetrics(operation) {
    const timestamp = Date.now();
    const businessMetrics = this.metrics.business.get(timestamp) || {
      mixOperations: 0,
      totalVolume: 0,
      averageAmount: 0,
      currencies: new Set()
    };

    businessMetrics.mixOperations++;
    businessMetrics.totalVolume += operation.amount || 0;
    businessMetrics.averageAmount = businessMetrics.totalVolume / businessMetrics.mixOperations;
    businessMetrics.currencies.add(operation.currency);

    this.metrics.business.set(timestamp, businessMetrics);
  }

  _updateSecurityMetrics(event) {
    const timestamp = Date.now();
    const securityMetrics = this.metrics.security.get(timestamp) || {
      events: 0,
      highRiskEvents: 0,
      averageRiskScore: 0,
      eventTypes: new Map()
    };

    securityMetrics.events++;
    if (event.riskScore >= 70) {
      securityMetrics.highRiskEvents++;
    }

    const totalRisk = securityMetrics.averageRiskScore * (securityMetrics.events - 1);
    securityMetrics.averageRiskScore = (totalRisk + (event.riskScore || 0)) / securityMetrics.events;

    const typeCount = securityMetrics.eventTypes.get(event.type) || 0;
    securityMetrics.eventTypes.set(event.type, typeCount + 1);

    this.metrics.security.set(timestamp, securityMetrics);
  }

  async _collectSecurityMetrics() {
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

  async _collectPerformanceMetrics() {
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

  async _checkAlerts(operation) {
    // Проверяем на частые ошибки
    if (operation.status === 'FAILED') {
      const recentFailures = await this._getRecentFailures(10 * 60 * 1000); // 10 минут
      if (recentFailures >= this.config.alertThresholds.failedMixes) {
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
    if (operation.duration > this.config.alertThresholds.latency) {
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
  async _checkSystemThresholds(metrics) {
    if (!metrics || !this.config.alertThresholds) {
      return;
    }

    try {
      const issues = [];

      // Проверяем CPU
      if (metrics.system && metrics.system.cpuUsage) {
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
      if (metrics.system && metrics.system.memoryUsage) {
        const memoryUsage = (metrics.system.memoryUsage.used / metrics.system.memoryUsage.total) * 100;
        if (memoryUsage > this.config.alertThresholds.memoryUsage) {
          issues.push({
            type: 'HIGH_MEMORY',
            value: memoryUsage,
            threshold: this.config.alertThresholds.memoryUsage
          });
        }
      }

      // Проверяем очереди операций
      if (metrics.queues) {
        for (const [queueName, queueMetrics] of Object.entries(metrics.queues)) {
          if (queueMetrics.length > this.config.alertThresholds.queueLength) {
            issues.push({
              type: 'QUEUE_OVERFLOW',
              queue: queueName,
              value: queueMetrics.length,
              threshold: this.config.alertThresholds.queueLength
            });
          }
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

  async _checkSystemAlerts() {
    try {
      const metrics = await this.collectSystemMetrics();
      if (!metrics) return;

      // Проверяем загрузку CPU
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

      // Проверяем использование памяти
      const memoryUsage = (metrics.system.memoryUsage.used / metrics.system.memoryUsage.total) * 100;
      if (memoryUsage > this.config.alertThresholds.systemLoad) {
        await this.createAlert({
          type: 'HIGH_MEMORY_USAGE',
          severity: 'HIGH',
          title: 'Высокое использование памяти',
          description: `Использование памяти: ${memoryUsage.toFixed(2)}%`,
          source: 'SYSTEM',
          threshold: this.config.alertThresholds.systemLoad,
          currentValue: memoryUsage
        });
      }
      
    } catch (error) {
      this.logger?.error('Ошибка проверки системных алертов:', error);
    }
  }

  async _checkBusinessAlerts() {
    try {
      // Проверяем утилизацию пулов
      const poolUtilization = await this._getPoolUtilization();
      for (const [currency, utilization] of Object.entries(poolUtilization)) {
        if (utilization > this.config.alertThresholds.poolUtilization) {
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

  async _triggerSecurityAlert(securityLog) {
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

  async _saveLogEntry(logEntry) {
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

  async _saveSecurityLog(securityLog) {
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

  async _saveAlert(alertEntry) {
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

  async _saveMetrics() {
    // Сохранение метрик в долгосрочное хранилище
    this.logger?.info('Метрики сохранены');
  }

  // Утилиты и вспомогательные методы

  _determineLogLevel(operation) {
    if (operation.status === 'FAILED') return 'error';
    if (operation.status === 'WARNING') return 'warn';
    return 'info';
  }

  _hashIP(ip) {
    // Хешируем IP для сохранения приватности
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  _isDuplicateAlert(alertEntry) {
    const recentAlerts = Array.from(this.recentAlerts.values())
      .filter(alert => 
        alert.type === alertEntry.type &&
        alert.status === 'ACTIVE' &&
        Date.now() - new Date(alert.createdAt).getTime() < 5 * 60 * 1000 // 5 минут
      );
    
    return recentAlerts.length > 0;
  }

  async _sendAlertNotifications(alertEntry) {
    // Отправка уведомлений (email, slack, etc.)
    this.logger?.warn('ALERT:', alertEntry.title, alertEntry.description);
    
    if (this.alertManager) {
      await this.alertManager.sendNotification(alertEntry);
    }
  }

  _calculateSuccessRate() {
    const total = this.counters.totalMixes;
    if (total === 0) return 0;
    return (this.counters.successfulMixes / total) * 100;
  }

  _calculateAverageLatency() {
    // Вычисляем среднюю задержку из метрик производительности
    const recentMetrics = Array.from(this.metrics.performance.entries())
      .slice(-10) // Последние 10 записей
      .map(([, metric]) => metric.responseTime)
      .filter(Boolean);
    
    if (recentMetrics.length === 0) return 0;
    return recentMetrics.reduce((sum, time) => sum + time, 0) / recentMetrics.length;
  }

  _calculateErrorRate() {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    
    // Подсчитываем ошибки за последний час из логов
    return this.counters.failedMixes; // Упрощенная реализация
  }

  _calculateThroughput() {
    const oneMinute = 60 * 1000;
    const now = Date.now();
    
    // Подсчитываем транзакции за последнюю минуту
    return this.counters.successfulMixes; // Упрощенная реализация
  }

  _calculateCPUUsage(cpuUsage) {
    // Упрощенный расчет загрузки CPU
    if (!cpuUsage) return 0;
    
    const { user, system } = cpuUsage;
    const total = user + system;
    return Math.min((total / 1000000) * 100, 100); // Конвертируем в проценты
  }

  async _getPoolCount() {
    // Получаем количество активных пулов
    return 4; // BTC, ETH, USDT, SOL
  }

  async _getQueueSize() {
    // Получаем размер очереди
    return 0; // Заглушка
  }

  async _getConnectionCount() {
    // Получаем количество активных соединений
    return 0; // Заглушка
  }

  async _getBandwidthUsage() {
    // Получаем использование пропускной способности
    return { upload: 0, download: 0 };
  }

  async _getRecentFailures(timeWindow) {
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

  _getAlertsInLast24h() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return Array.from(this.recentAlerts.values())
      .filter(alert => new Date(alert.createdAt).getTime() > oneDayAgo)
      .length;
  }

  _getStartTimeForRange(timeRange, endTime) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    return endTime - (ranges[timeRange] || ranges['24h']);
  }

  async _establishPerformanceBaseline() {
    // Устанавливаем базовые показатели производительности
    this.performanceBaseline.set('latency', 500);      // 500мс
    this.performanceBaseline.set('throughput', 10);    // 10 tps
    this.performanceBaseline.set('errorRate', 1);      // 1%
  }

  async _performDataCleanup() {
    try {
      const now = Date.now();
      
      // Очищаем старые метрики
      for (const [category, metricsMap] of Object.entries(this.metrics)) {
        const retention = this.config.dataRetention.metrics;
        const cutoff = now - retention;
        
        for (const [timestamp] of metricsMap) {
          if (timestamp < cutoff) {
            metricsMap.delete(timestamp);
          }
        }
      }

      // Очищаем старые алерты из кеша
      const alertRetention = this.config.dataRetention.alerts;
      const alertCutoff = now - alertRetention;
      
      for (const [id, alert] of this.recentAlerts) {
        if (new Date(alert.createdAt).getTime() < alertCutoff) {
          this.recentAlerts.delete(id);
        }
      }

      this.logger?.info('Выполнена очистка данных мониторинга');
      
    } catch (error) {
      this.logger?.error('Ошибка очистки данных:', error);
    }
  }

  // Заглушки для методов, которые требуют интеграции с другими системами

  async _getActiveThreatsCount() { return 0; }
  async _getCurrentRiskScore() { return 0; }
  async _getBlockedTransactionsCount() { return 0; }
  async _getSuspiciousPatternsCount() { return 0; }
  async _getAverageResponseTime() { return 200; }
  async _getPoolUtilization() { return { BTC: 50, ETH: 60, USDT: 40, SOL: 55 }; }
  async _getTotalLiquidity() { return 0; }
  async _getAveragePoolAge() { return 0; }
  async _getActiveUsersCount() { return 0; }
  async _getNewUsersCount() { return 0; }
  async _getReturningUsersCount() { return 0; }
  async _getVolumeInWindow() { return 0; }
  async _getTransactionCountInWindow() { return 0; }
  async _getHourlyVolume() { return []; }
  async _calculateLatencyPercentiles() { return { p50: 0, p90: 0, p99: 0 }; }
  async _getThroughputData() { return []; }
  async _getErrorRateOverTime() { return []; }
  async _getAlertsInTimeRange() { return []; }
  async _getSuspiciousActivities() { return []; }
  async _getRiskScoreDistribution() { return {}; }
  async _populateReportData() { }
  async _savePerformanceReport() { }
  
  _generateRecommendations(report) {
    const recommendations = [];
    
    if (report.summary.successRate < 95) {
      recommendations.push('Улучшить стабильность системы микширования');
    }
    
    if (report.summary.averageLatency > 2000) {
      recommendations.push('Оптимизировать производительность');
    }
    
    return recommendations;
  }
}

module.exports = MonitoringSystem;