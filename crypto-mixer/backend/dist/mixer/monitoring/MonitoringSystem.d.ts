import { EventEmitter } from 'events';
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
        bandwidth?: {
            upload: number;
            download: number;
        };
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
        latencyPercentiles: {
            p50: number;
            p90: number;
            p99: number;
        };
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
        monitoring: {
            status: string;
            message: string;
        };
        database: {
            status: string;
            message: string;
        };
        metrics: {
            status: string;
            message: string;
        };
        alerts: {
            status: string;
            message: string;
        };
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
/**
 * Система мониторинга и логирования для крипто миксера
 * Обеспечивает полное отслеживание операций, метрик и алертов
 */
declare class MonitoringSystem extends EventEmitter {
    private database?;
    private logger?;
    private alertManager?;
    private metricsCollector?;
    private config;
    private metrics;
    private recentAlerts;
    private performanceBaseline;
    private counters;
    private readonly SYSTEM_METRICS_TIMER;
    private readonly BUSINESS_METRICS_TIMER;
    private readonly SECURITY_METRICS_TIMER;
    private readonly PERFORMANCE_METRICS_TIMER;
    private readonly ALERT_SYSTEM_TIMER;
    private readonly ALERT_BUSINESS_TIMER;
    private readonly DATA_CLEANUP_TIMER;
    private isMonitoring;
    private _startTime?;
    constructor(dependencies?: MonitoringSystemDependencies);
    /**
     * Запускает систему мониторинга
     */
    startMonitoring(): Promise<void>;
    /**
     * Останавливает систему мониторинга
     */
    stopMonitoring(): Promise<void>;
    /**
     * Логирует событие операции микширования
     */
    logMixingOperation(operation: MixingOperation): Promise<void>;
    /**
     * Логирует событие безопасности
     */
    logSecurityEvent(event: SecurityEvent): Promise<void>;
    /**
     * Собирает системные метрики
     */
    collectSystemMetrics(): Promise<SystemMetrics | null>;
    /**
     * Собирает бизнес-метрики
     */
    collectBusinessMetrics(): Promise<BusinessMetrics | null>;
    /**
     * Генерирует отчет о производительности
     */
    generatePerformanceReport(timeRange?: string): Promise<PerformanceReport>;
    /**
     * Создает алерт
     */
    createAlert(alert: Partial<AlertEntry>): Promise<AlertEntry | null>;
    /**
     * Получает текущий статус системы мониторинга
     */
    getStatus(): MonitoringStatus;
    /**
     * Выполняет проверку состояния системы мониторинга
     */
    healthCheck(): Promise<MonitoringHealthCheck>;
    getMonitoringStatistics(): MonitoringStatistics;
    private _initializeMetrics;
    private _loadHistoricalData;
    private _startMetricsCollectors;
    private _startAlertSystem;
    private _startDataCleanup;
    private _stopAllTimers;
    private _setupMemoryListeners;
    private _triggerEmergencyCleanup;
    /**
     * Graceful shutdown with proper cleanup
     */
    shutdown(): Promise<void>;
    private _updateCounters;
    private _updateBusinessMetrics;
    private _updateSecurityMetrics;
    private _collectSecurityMetrics;
    private _collectPerformanceMetrics;
    private _checkAlerts;
    /**
     * Проверяет системные пороговые значения
     */
    private _checkSystemThresholds;
    private _checkSystemAlerts;
    private _checkBusinessAlerts;
    private _triggerSecurityAlert;
    private _saveLogEntry;
    private _saveSecurityLog;
    private _saveAlert;
    private _saveMetrics;
    private _determineLogLevel;
    private _hashIP;
    private _isDuplicateAlert;
    private _sendAlertNotifications;
    private _calculateSuccessRate;
    private _calculateAverageLatency;
    private _calculateErrorRate;
    private _calculateThroughput;
    private _calculateCPUUsage;
    private _getPoolCount;
    private _getQueueSize;
    private _getConnectionCount;
    private _getBandwidthUsage;
    private _getRecentFailures;
    private _getAlertsInLast24h;
    private _getStartTimeForRange;
    private _establishPerformanceBaseline;
    private _performDataCleanup;
    /**
     * Получение количества активных угроз из логов безопасности
     */
    private _getActiveThreatsCount;
    /**
     * Вычисление текущего рискового скора на основе событий безопасности
     */
    private _getCurrentRiskScore;
    /**
     * Получение количества заблокированных транзакций
     */
    private _getBlockedTransactionsCount;
    /**
     * Обнаружение подозрительных паттернов в транзакциях
     */
    private _getSuspiciousPatternsCount;
    /**
     * Вычисление среднего времени отклика системы
     */
    private _getAverageResponseTime;
    /**
     * Получение утилизации пулов по валютам
     */
    private _getPoolUtilization;
    /**
     * Получение общей ликвидности системы
     */
    private _getTotalLiquidity;
    /**
     * Получение среднего возраста пулов (время с последнего использования)
     */
    private _getAveragePoolAge;
    /**
     * Получение количества активных пользователей (за последние 24 часа)
     */
    private _getActiveUsersCount;
    /**
     * Получение количества новых пользователей (первая транзакция за последние 24 часа)
     */
    private _getNewUsersCount;
    /**
     * Получение количества возвращающихся пользователей
     */
    private _getReturningUsersCount;
    /**
     * Получение объема транзакций в заданном временном окне
     */
    private _getVolumeInWindow;
    /**
     * Получение количества транзакций в заданном временном окне
     */
    private _getTransactionCountInWindow;
    /**
     * Получение почасового объема транзакций за последние 24 часа
     */
    private _getHourlyVolume;
    /**
     * Вычисление перцентилей задержки в заданном временном окне
     */
    private _calculateLatencyPercentiles;
    /**
     * Получение данных пропускной способности по времени
     */
    private _getThroughputData;
    /**
     * Получение динамики ошибок по времени
     */
    private _getErrorRateOverTime;
    /**
     * Получение алертов в заданном временном диапазоне
     */
    private _getAlertsInTimeRange;
    /**
     * Получение подозрительных активностей в заданном временном диапазоне
     */
    private _getSuspiciousActivities;
    /**
     * Получение распределения рискового скора
     */
    private _getRiskScoreDistribution;
    /**
     * Заполнение данными отчета о производительности
     */
    private _populateReportData;
    /**
     * Сохранение отчета о производительности в базу данных
     */
    private _savePerformanceReport;
    /**
     * Генерация рекомендаций на основе анализа отчета
     */
    private _generateRecommendations;
}
export default MonitoringSystem;
export { MonitoringSystem };
export type { MonitoringSystemConfig, MonitoringSystemDependencies, MixingOperation, SecurityEvent, SystemMetrics, BusinessMetrics, PerformanceReport, MonitoringStatus, MonitoringHealthCheck, MonitoringStatistics, AlertEntry, LogEntry, SecurityLog };
