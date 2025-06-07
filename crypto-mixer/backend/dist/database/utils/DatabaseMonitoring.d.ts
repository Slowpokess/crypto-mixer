import { Sequelize } from 'sequelize';
import { EventEmitter } from 'events';
export interface MonitoringMetrics {
    timestamp: Date;
    connectionPool: {
        active: number;
        idle: number;
        waiting: number;
        total: number;
    };
    performance: {
        avgQueryTime: number;
        slowQueries: number;
        totalQueries: number;
        errorRate: number;
    };
    database: {
        size: number;
        tableCount: number;
        indexCount: number;
        deadlocks: number;
    };
    system: {
        cpuUsage: number;
        memoryUsage: number;
        diskUsage: number;
        diskIops: number;
    };
    business: {
        activeMixRequests: number;
        pendingTransactions: number;
        failedTransactions: number;
        poolUtilization: number;
    };
}
export interface AlertRule {
    id: string;
    name: string;
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    threshold: number;
    duration: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    notificationChannels: string[];
}
export interface Alert {
    id: string;
    ruleId: string;
    ruleName: string;
    metric: string;
    currentValue: number;
    threshold: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    resolved: boolean;
    resolvedAt?: Date;
}
/**
 * Система мониторинга базы данных с real-time алертами
 */
export declare class DatabaseMonitoring extends EventEmitter {
    private sequelize;
    private metricsHistory;
    private activeAlerts;
    private alertRules;
    private monitoringInterval?;
    private alertCheckerInterval?;
    private isMonitoring;
    private config;
    constructor(sequelize: Sequelize, config?: Partial<typeof DatabaseMonitoring.prototype.config>);
    /**
     * Запуск мониторинга
     */
    start(): void;
    /**
     * Остановка мониторинга
     */
    stop(): void;
    /**
     * Сбор метрик
     */
    private collectMetrics;
    /**
     * Метрики пула подключений
     */
    private getConnectionPoolMetrics;
    /**
     * Метрики производительности
     */
    private getPerformanceMetrics;
    /**
     * Метрики базы данных
     */
    private getDatabaseMetrics;
    /**
     * Системные метрики
     */
    private getSystemMetrics;
    /**
     * Бизнес-метрики
     */
    private getBusinessMetrics;
    /**
     * Добавление метрик в историю
     */
    private addMetrics;
    /**
     * Очистка старых метрик
     */
    private cleanupOldMetrics;
    /**
     * Настройка правил алертов по умолчанию
     */
    private setupDefaultAlertRules;
    /**
     * Добавление правила алерта
     */
    addAlertRule(rule: AlertRule): void;
    /**
     * Удаление правила алерта
     */
    removeAlertRule(ruleId: string): boolean;
    /**
     * Проверка алертов
     */
    private checkAlerts;
    /**
     * Получение значения метрики по пути
     */
    private getMetricValue;
    /**
     * Оценка условия алерта
     */
    private evaluateCondition;
    /**
     * Обработка алерта
     */
    private handleAlert;
    /**
     * Разрешение алерта
     */
    private resolveAlert;
    /**
     * Отправка уведомления
     */
    private sendNotification;
    /**
     * Получение текущих метрик
     */
    getCurrentMetrics(): MonitoringMetrics | null;
    /**
     * Получение истории метрик
     */
    getMetricsHistory(hours?: number): MonitoringMetrics[];
    /**
     * Получение активных алертов
     */
    getActiveAlerts(): Alert[];
    /**
     * Получение статистики алертов
     */
    getAlertStatistics(): {
        total: number;
        active: number;
        resolved: number;
        bySeverity: Record<string, number>;
    };
    /**
     * Получение отчета о состоянии
     */
    getHealthReport(): {
        status: 'healthy' | 'warning' | 'critical';
        metrics: MonitoringMetrics | null;
        activeAlerts: Alert[];
        summary: string;
    };
}
export default DatabaseMonitoring;
