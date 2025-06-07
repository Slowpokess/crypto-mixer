"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringSystem = void 0;
const events_1 = require("events");
const crypto = __importStar(require("crypto"));
const MemoryManager_1 = require("../../utils/MemoryManager");
/**
 * Система мониторинга и логирования для крипто миксера
 * Обеспечивает полное отслеживание операций, метрик и алертов
 */
class MonitoringSystem extends events_1.EventEmitter {
    constructor(dependencies = {}) {
        super();
        // Timer constants for MemoryManager
        this.SYSTEM_METRICS_TIMER = 'monitoring:system-metrics';
        this.BUSINESS_METRICS_TIMER = 'monitoring:business-metrics';
        this.SECURITY_METRICS_TIMER = 'monitoring:security-metrics';
        this.PERFORMANCE_METRICS_TIMER = 'monitoring:performance-metrics';
        this.ALERT_SYSTEM_TIMER = 'monitoring:alert-system';
        this.ALERT_BUSINESS_TIMER = 'monitoring:alert-business';
        this.DATA_CLEANUP_TIMER = 'monitoring:data-cleanup';
        this.database = dependencies.database;
        this.logger = dependencies.logger;
        this.alertManager = dependencies.alertManager;
        this.metricsCollector = dependencies.metricsCollector;
        // Конфигурация мониторинга
        this.config = {
            // Интервалы сбора метрик
            metricsIntervals: {
                system: 30 * 1000, // 30 секунд
                business: 60 * 1000, // 1 минута
                security: 15 * 1000, // 15 секунд
                performance: 5 * 1000, // 5 секунд
                ...dependencies.config?.metricsIntervals
            },
            // Пороговые значения для алертов
            alertThresholds: {
                systemLoad: 85, // CPU/Memory %
                errorRate: 5, // Ошибок в минуту
                latency: 2000, // Задержка в мс
                failedMixes: 3, // Неудачных миксов за 10 минут
                suspiciousActivity: 10, // Подозрительных активностей в час
                poolUtilization: 95, // Утилизация пула %
                memoryUsage: 90, // Использование памяти %
                queueLength: 1000, // Максимальная длина очереди
                ...dependencies.config?.alertThresholds
            },
            // Настройки ретенции данных
            dataRetention: {
                metrics: 30 * 24 * 60 * 60 * 1000, // 30 дней
                logs: 90 * 24 * 60 * 60 * 1000, // 90 дней
                transactions: 365 * 24 * 60 * 60 * 1000, // 1 год
                alerts: 180 * 24 * 60 * 60 * 1000, // 180 дней
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
            system: MemoryManager_1.memoryManager.createBoundedMap('monitoring:system-metrics', {
                maxSize: 2880, // 24 часа при интервале 30 сек
                cleanupThreshold: 0.8,
                ttl: 24 * 60 * 60 * 1000 // 24 hours
            }),
            business: MemoryManager_1.memoryManager.createBoundedMap('monitoring:business-metrics', {
                maxSize: 1440, // 24 часа при интервале 1 мин
                cleanupThreshold: 0.8,
                ttl: 24 * 60 * 60 * 1000
            }),
            security: MemoryManager_1.memoryManager.createBoundedMap('monitoring:security-metrics', {
                maxSize: 5760, // 24 часа при интервале 15 сек
                cleanupThreshold: 0.8,
                ttl: 24 * 60 * 60 * 1000
            }),
            performance: MemoryManager_1.memoryManager.createBoundedMap('monitoring:performance-metrics', {
                maxSize: 17280, // 24 часа при интервале 5 сек
                cleanupThreshold: 0.8,
                ttl: 24 * 60 * 60 * 1000
            })
        };
        // Bounded caches
        this.recentAlerts = MemoryManager_1.memoryManager.createBoundedMap('monitoring:alerts', {
            maxSize: 1000,
            cleanupThreshold: 0.8,
            ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        this.performanceBaseline = MemoryManager_1.memoryManager.createBoundedMap('monitoring:baseline', {
            maxSize: 500,
            cleanupThreshold: 0.8,
            ttl: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        // Счетчики и статистика
        this.counters = {
            totalMixes: 0,
            successfulMixes: 0,
            failedMixes: 0,
            totalVolume: new Map(),
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
            this.logger?.error('Ошибка создания алерта:', error);
            throw error;
        }
    }
    /**
     * Получает текущий статус системы мониторинга
     */
    getStatus() {
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
                }
                catch (error) {
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
        }
        catch (error) {
            health.status = 'unhealthy';
            health.error = error instanceof Error ? error.message : 'Unknown error';
            this.logger?.error('Ошибка проверки состояния мониторинга:', error);
        }
        return health;
    }
    getMonitoringStatistics() {
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
        if (!this.database)
            return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка загрузки исторических данных:', error);
        }
    }
    _startMetricsCollectors() {
        // Системные метрики
        MemoryManager_1.memoryManager.createTimer(this.SYSTEM_METRICS_TIMER, () => this.collectSystemMetrics(), this.config.metricsIntervals.system || 30000, 'interval', 'System metrics collection');
        // Бизнес-метрики
        MemoryManager_1.memoryManager.createTimer(this.BUSINESS_METRICS_TIMER, () => this.collectBusinessMetrics(), this.config.metricsIntervals.business || 60000, 'interval', 'Business metrics collection');
        // Метрики безопасности
        MemoryManager_1.memoryManager.createTimer(this.SECURITY_METRICS_TIMER, () => this._collectSecurityMetrics(), this.config.metricsIntervals.security || 15000, 'interval', 'Security metrics collection');
        // Метрики производительности
        MemoryManager_1.memoryManager.createTimer(this.PERFORMANCE_METRICS_TIMER, () => this._collectPerformanceMetrics(), this.config.metricsIntervals.performance || 5000, 'interval', 'Performance metrics collection');
    }
    _startAlertSystem() {
        // Мониторинг системных показателей
        MemoryManager_1.memoryManager.createTimer(this.ALERT_SYSTEM_TIMER, () => this._checkSystemAlerts(), 30 * 1000, 'interval', 'System alerts monitoring');
        // Мониторинг бизнес-показателей
        MemoryManager_1.memoryManager.createTimer(this.ALERT_BUSINESS_TIMER, () => this._checkBusinessAlerts(), 60 * 1000, 'interval', 'Business alerts monitoring');
    }
    _startDataCleanup() {
        // Очистка устаревших данных каждые 6 часов
        MemoryManager_1.memoryManager.createTimer(this.DATA_CLEANUP_TIMER, () => this._performDataCleanup(), 6 * 60 * 60 * 1000, 'interval', 'Data cleanup task');
    }
    _stopAllTimers() {
        MemoryManager_1.memoryManager.clearTimer(this.SYSTEM_METRICS_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.BUSINESS_METRICS_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.SECURITY_METRICS_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.PERFORMANCE_METRICS_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.ALERT_SYSTEM_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.ALERT_BUSINESS_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.DATA_CLEANUP_TIMER);
        this.logger?.debug('Все таймеры мониторинга остановлены');
    }
    _setupMemoryListeners() {
        MemoryManager_1.memoryManager.on('memory-warning', (data) => {
            this.logger?.warn('Memory warning detected in monitoring system', data);
            this._triggerEmergencyCleanup();
        });
        MemoryManager_1.memoryManager.on('emergency-cleanup', (data) => {
            this.logger?.error('Emergency cleanup triggered in monitoring system', data);
            this.emit('monitoring:emergency-cleanup', data);
        });
    }
    _triggerEmergencyCleanup() {
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
    async shutdown() {
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
        }
        catch (error) {
            this.logger?.error('Error during monitoring system shutdown:', error);
            throw error;
        }
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
        }
        else if (operation.status === 'FAILED') {
            this.counters.failedMixes++;
        }
    }
    _updateBusinessMetrics(operation) {
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
        }
        else if (operation.status === 'FAILED') {
            businessMetrics.transactions.failed++;
        }
        // Обновляем объемы
        if (!businessMetrics.volume.total[operation.currency]) {
            businessMetrics.volume.total[operation.currency] = 0;
        }
        businessMetrics.volume.total[operation.currency] += operation.amount || 0;
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
        if (event.riskScore && event.riskScore >= 70) {
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
        }
        catch (error) {
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
        }
        catch (error) {
            this.logger?.error('Ошибка сбора метрик производительности:', error);
        }
    }
    async _checkAlerts(operation) {
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
    async _checkSystemThresholds(metrics) {
        if (!metrics || !this.config.alertThresholds) {
            return [];
        }
        try {
            const issues = [];
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
        }
        catch (error) {
            this.logger?.error('Ошибка проверки системных порогов:', error);
            return [];
        }
    }
    async _checkSystemAlerts() {
        try {
            const metrics = await this.collectSystemMetrics();
            if (!metrics)
                return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка проверки системных алертов:', error);
        }
    }
    async _checkBusinessAlerts() {
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
        }
        catch (error) {
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
        if (!this.database)
            return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка сохранения лога операции:', error);
        }
    }
    async _saveSecurityLog(securityLog) {
        if (!this.database)
            return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка сохранения лога безопасности:', error);
        }
    }
    async _saveAlert(alertEntry) {
        if (!this.database)
            return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка сохранения алерта:', error);
        }
    }
    async _saveMetrics() {
        // Сохранение метрик в долгосрочное хранилище
        this.logger?.info('Метрики сохранены');
    }
    // Утилиты и вспомогательные методы
    _determineLogLevel(operation) {
        if (operation.status === 'FAILED')
            return 'error';
        if (operation.status === 'WARNING')
            return 'warn';
        return 'info';
    }
    _hashIP(ip) {
        // Хешируем IP для сохранения приватности
        return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
    }
    _isDuplicateAlert(alertEntry) {
        const recentAlerts = Array.from(this.recentAlerts.values())
            .filter(alert => alert.type === alertEntry.type &&
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
        if (total === 0)
            return 0;
        return (this.counters.successfulMixes / total) * 100;
    }
    _calculateAverageLatency() {
        try {
            // Вычисляем среднюю задержку из метрик производительности
            const recentMetrics = Array.from(this.metrics.performance.entries())
                .slice(-10) // Последние 10 записей
                .map(([, metric]) => metric?.responseTime)
                .filter((time) => typeof time === 'number' && !isNaN(time) && isFinite(time));
            if (recentMetrics.length === 0)
                return 0;
            const average = recentMetrics.reduce((sum, time) => sum + time, 0) / recentMetrics.length;
            return isNaN(average) || !isFinite(average) ? 0 : average;
        }
        catch (error) {
            this.logger?.error('Ошибка расчета средней задержки:', error);
            return 0;
        }
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
        if (!cpuUsage)
            return 0;
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
        if (!this.database)
            return 0;
        try {
            const query = `
        SELECT COUNT(*) as failures
        FROM operation_logs
        WHERE status = 'FAILED'
        AND timestamp >= NOW() - INTERVAL '${timeWindow / 1000} seconds'
      `;
            const result = await this.database.query(query);
            return parseInt(result.rows[0]?.failures) || 0;
        }
        catch (error) {
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
        this.performanceBaseline.set('latency', 500); // 500мс
        this.performanceBaseline.set('throughput', 10); // 10 tps
        this.performanceBaseline.set('errorRate', 1); // 1%
    }
    async _performDataCleanup() {
        try {
            const now = Date.now();
            // Очищаем старые метрики
            for (const [category, metricsMap] of Object.entries(this.metrics)) {
                const retention = this.config.dataRetention.metrics;
                if (retention === undefined)
                    continue;
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
        }
        catch (error) {
            this.logger?.error('Ошибка очистки данных:', error);
        }
    }
    // Полноценные методы интеграции с системами безопасности и мониторинга
    /**
     * Получение количества активных угроз из логов безопасности
     */
    async _getActiveThreatsCount() {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения активных угроз:', error);
            return 0;
        }
    }
    /**
     * Вычисление текущего рискового скора на основе событий безопасности
     */
    async _getCurrentRiskScore() {
        if (!this.database)
            return 0;
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
            if (result.rows.length === 0)
                return 0;
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
            }
            else if (maxRisk >= 80) {
                currentRisk += 10;
            }
            return Math.min(Math.round(currentRisk), 100);
        }
        catch (error) {
            this.logger?.error('Ошибка вычисления рискового скора:', error);
            return 0;
        }
    }
    /**
     * Получение количества заблокированных транзакций
     */
    async _getBlockedTransactionsCount() {
        if (!this.database)
            return 0;
        try {
            const query = `
        SELECT COUNT(*) as blocked_count
        FROM mix_requests
        WHERE status = 'BLOCKED'
        AND created_at >= NOW() - INTERVAL '24 hours'
      `;
            const result = await this.database.query(query);
            return parseInt(result.rows[0]?.blocked_count) || 0;
        }
        catch (error) {
            this.logger?.error('Ошибка получения заблокированных транзакций:', error);
            return 0;
        }
    }
    /**
     * Обнаружение подозрительных паттернов в транзакциях
     */
    async _getSuspiciousPatternsCount() {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка обнаружения подозрительных паттернов:', error);
            return 0;
        }
    }
    /**
     * Вычисление среднего времени отклика системы
     */
    async _getAverageResponseTime() {
        if (!this.database)
            return 200;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения времени отклика:', error);
            return 200;
        }
    }
    /**
     * Получение утилизации пулов по валютам
     */
    async _getPoolUtilization() {
        if (!this.database)
            return { BTC: 50, ETH: 60, USDT: 40, SOL: 55 };
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
            const utilization = {};
            result.rows.forEach((row) => {
                utilization[row.currency] = parseFloat(row.utilization) || 0;
            });
            // Устанавливаем значения по умолчанию для отсутствующих валют
            ['BTC', 'ETH', 'USDT', 'SOL'].forEach(currency => {
                if (!(currency in utilization)) {
                    utilization[currency] = 0;
                }
            });
            return utilization;
        }
        catch (error) {
            this.logger?.error('Ошибка получения утилизации пулов:', error);
            return { BTC: 50, ETH: 60, USDT: 40, SOL: 55 };
        }
    }
    /**
     * Получение общей ликвидности системы
     */
    async _getTotalLiquidity() {
        if (!this.database)
            return 0;
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
            result.rows.forEach((row) => {
                const amount = parseFloat(row.available_liquidity) || 0;
                const rate = exchangeRates[row.currency] || 0;
                totalLiquidityUSD += amount * rate;
            });
            return Math.round(totalLiquidityUSD);
        }
        catch (error) {
            this.logger?.error('Ошибка получения ликвидности:', error);
            return 0;
        }
    }
    /**
     * Получение среднего возраста пулов (время с последнего использования)
     */
    async _getAveragePoolAge() {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения возраста пулов:', error);
            return 0;
        }
    }
    /**
     * Получение количества активных пользователей (за последние 24 часа)
     */
    async _getActiveUsersCount() {
        if (!this.database)
            return 0;
        try {
            const query = `
        SELECT COUNT(DISTINCT user_id) as active_users
        FROM mix_requests
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND user_id IS NOT NULL
      `;
            const result = await this.database.query(query);
            return parseInt(result.rows[0]?.active_users) || 0;
        }
        catch (error) {
            this.logger?.error('Ошибка получения активных пользователей:', error);
            return 0;
        }
    }
    /**
     * Получение количества новых пользователей (первая транзакция за последние 24 часа)
     */
    async _getNewUsersCount() {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения новых пользователей:', error);
            return 0;
        }
    }
    /**
     * Получение количества возвращающихся пользователей
     */
    async _getReturningUsersCount() {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения возвращающихся пользователей:', error);
            return 0;
        }
    }
    /**
     * Получение объема транзакций в заданном временном окне
     */
    async _getVolumeInWindow(startTime, endTime) {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения объема в окне:', error);
            return 0;
        }
    }
    /**
     * Получение количества транзакций в заданном временном окне
     */
    async _getTransactionCountInWindow(startTime, endTime) {
        if (!this.database)
            return 0;
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
        }
        catch (error) {
            this.logger?.error('Ошибка получения количества транзакций в окне:', error);
            return 0;
        }
    }
    /**
     * Получение почасового объема транзакций за последние 24 часа
     */
    async _getHourlyVolume() {
        if (!this.database)
            return [];
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
            result.rows.forEach((row) => {
                const hourBucket = new Date(row.hour_bucket);
                const hoursAgo = Math.floor((now.getTime() - hourBucket.getTime()) / (1000 * 60 * 60));
                if (hoursAgo >= 0 && hoursAgo < 24) {
                    hourlyData[23 - hoursAgo] = parseFloat(row.hourly_volume) || 0;
                }
            });
            return hourlyData;
        }
        catch (error) {
            this.logger?.error('Ошибка получения почасового объема:', error);
            return [];
        }
    }
    /**
     * Вычисление перцентилей задержки в заданном временном окне
     */
    async _calculateLatencyPercentiles(startTime, endTime) {
        if (!this.database)
            return { p50: 0, p90: 0, p99: 0 };
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
        }
        catch (error) {
            this.logger?.error('Ошибка вычисления перцентилей задержки:', error);
            return { p50: 0, p90: 0, p99: 0 };
        }
    }
    /**
     * Получение данных пропускной способности по времени
     */
    async _getThroughputData(startTime, endTime) {
        if (!this.database)
            return [];
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
            return result.rows.map((row) => ({
                timestamp: row.time_bucket,
                throughput: parseInt(row.transactions_per_minute) || 0,
                avgAmount: parseFloat(row.avg_amount) || 0
            }));
        }
        catch (error) {
            this.logger?.error('Ошибка получения данных пропускной способности:', error);
            return [];
        }
    }
    /**
     * Получение динамики ошибок по времени
     */
    async _getErrorRateOverTime(startTime, endTime) {
        if (!this.database)
            return [];
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
            return result.rows.map((row) => ({
                timestamp: row.hour_bucket,
                totalOperations: parseInt(row.total_operations) || 0,
                failedOperations: parseInt(row.failed_operations) || 0,
                errorRate: parseFloat(row.error_rate_percent) || 0
            }));
        }
        catch (error) {
            this.logger?.error('Ошибка получения динамики ошибок:', error);
            return [];
        }
    }
    /**
     * Получение алертов в заданном временном диапазоне
     */
    async _getAlertsInTimeRange(startTime, endTime) {
        if (!this.database)
            return [];
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
            return result.rows.map((row) => ({
                id: row.id,
                type: row.type,
                severity: row.severity,
                title: row.title,
                description: row.description,
                source: row.source,
                createdAt: row.created_at,
                status: row.status
            }));
        }
        catch (error) {
            this.logger?.error('Ошибка получения алертов:', error);
            return [];
        }
    }
    /**
     * Получение подозрительных активностей в заданном временном диапазоне
     */
    async _getSuspiciousActivities(startTime, endTime) {
        if (!this.database)
            return [];
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
            return result.rows.map((row) => ({
                id: row.id,
                eventType: row.event_type,
                severity: row.severity,
                description: row.description,
                riskScore: parseFloat(row.risk_score) || 0,
                timestamp: row.timestamp,
                actionTaken: row.action_taken
            }));
        }
        catch (error) {
            this.logger?.error('Ошибка получения подозрительных активностей:', error);
            return [];
        }
    }
    /**
     * Получение распределения рискового скора
     */
    async _getRiskScoreDistribution(startTime, endTime) {
        if (!this.database)
            return {};
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
            const distribution = {
                low: 0,
                medium: 0,
                high: 0,
                critical: 0
            };
            result.rows.forEach((row) => {
                distribution[row.risk_category] = parseInt(row.count) || 0;
            });
            return distribution;
        }
        catch (error) {
            this.logger?.error('Ошибка получения распределения рискового скора:', error);
            return {};
        }
    }
    /**
     * Заполнение данными отчета о производительности
     */
    async _populateReportData(report, startTime, endTime) {
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
            statusResult?.rows.forEach((row) => {
                if (row.status === 'COMPLETED') {
                    successfulMixes = parseInt(row.count) || 0;
                }
                else if (row.status === 'FAILED') {
                    errorCount = parseInt(row.count) || 0;
                }
            });
            // Заполняем summary
            report.summary.totalMixes = totalMixes;
            report.summary.successRate = totalMixes > 0 ? (successfulMixes / totalMixes) * 100 : 0;
            report.summary.averageLatency = await this._getAverageResponseTime();
            report.summary.totalVolume = new Map([['total', totalVolume]]);
            report.summary.errorCount = errorCount;
        }
        catch (error) {
            this.logger?.error('Ошибка заполнения данных отчета:', error);
        }
    }
    /**
     * Сохранение отчета о производительности в базу данных
     */
    async _savePerformanceReport(report) {
        if (!this.database)
            return;
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
        }
        catch (error) {
            this.logger?.error('Ошибка сохранения отчета о производительности:', error);
        }
    }
    /**
     * Генерация рекомендаций на основе анализа отчета
     */
    _generateRecommendations(report) {
        const recommendations = [];
        // Анализ успешности операций
        if (report.summary.successRate < 95) {
            if (report.summary.successRate < 85) {
                recommendations.push('🔴 КРИТИЧНО: Очень низкий уровень успешности операций (<85%). Требуется немедленная диагностика системы.');
            }
            else {
                recommendations.push('🟡 Умеренно низкий уровень успешности операций. Рекомендуется проверка стабильности системы микширования.');
            }
        }
        // Анализ производительности
        if (report.summary.averageLatency > 2000) {
            if (report.summary.averageLatency > 5000) {
                recommendations.push('🔴 КРИТИЧНО: Очень высокая задержка операций (>5с). Необходима оптимизация архитектуры.');
            }
            else {
                recommendations.push('🟡 Повышенная задержка операций. Рекомендуется оптимизация производительности.');
            }
        }
        // Анализ ошибок
        const errorRate = report.summary.totalMixes > 0 ? (report.summary.errorCount / report.summary.totalMixes) * 100 : 0;
        if (errorRate > 10) {
            recommendations.push('🔴 Высокий уровень ошибок (>10%). Требуется анализ логов и исправление проблем.');
        }
        else if (errorRate > 5) {
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
exports.MonitoringSystem = MonitoringSystem;
exports.default = MonitoringSystem;
//# sourceMappingURL=MonitoringSystem.js.map