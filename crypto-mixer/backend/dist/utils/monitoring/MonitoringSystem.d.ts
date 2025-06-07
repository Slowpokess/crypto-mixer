import { EventEmitter } from 'events';
/**
 * Конфигурация интегрированной системы мониторинга
 */
export interface MonitoringSystemConfig {
    enabled: boolean;
    performanceMonitoring: {
        enabled: boolean;
        collectInterval: number;
        retentionPeriod: number;
        alerting: {
            enabled: boolean;
            thresholds: {
                cpu: number;
                memory: number;
                disk: number;
                responseTime: number;
                errorRate: number;
            };
        };
    };
    healthChecks: {
        enabled: boolean;
        interval: number;
        timeout: number;
        retries: number;
        services: any[];
    };
    prometheus: {
        enabled: boolean;
        port: number;
        path: string;
        namespace: string;
    };
    alerting: {
        enabled: boolean;
        webhookUrl?: string;
        slackChannel?: string;
        emailRecipients?: string[];
    };
}
/**
 * Интегрированная система мониторинга для crypto-mixer
 * Объединяет PerformanceMonitor, HealthCheckManager и PrometheusExporter
 */
export declare class MonitoringSystem extends EventEmitter {
    private config;
    private isRunning;
    private performanceMonitor;
    private healthCheckManager;
    private prometheusExporter;
    private alertManager;
    private notificationManager;
    constructor(config?: Partial<MonitoringSystemConfig>);
    /**
     * Создание полной конфигурации с дефолтными значениями
     */
    private buildConfig;
    /**
     * Дефолтная конфигурация сервисов для health checks
     */
    private getDefaultHealthCheckServices;
    /**
     * Запуск интегрированной системы мониторинга
     */
    start(): Promise<void>;
    /**
     * Остановка системы мониторинга
     */
    stop(): Promise<void>;
    /**
     * Запуск мониторинга производительности
     */
    private startPerformanceMonitoring;
    /**
     * Запуск проверок состояния сервисов
     */
    private startHealthChecking;
    /**
     * Запуск Prometheus экспортера
     */
    private startPrometheusExporter;
    /**
     * Запуск системы алертинга
     */
    private startAlerting;
    /**
     * Настройка интеграции алертов с компонентами мониторинга
     */
    private setupAlertIntegration;
    /**
     * Определение уровня важности по пороговому значению
     */
    private getSeverityByThreshold;
    /**
     * Обработка алертов производительности
     */
    private handlePerformanceAlert;
    /**
     * Обработка изменений статуса здоровья
     */
    private handleHealthStatusChange;
    /**
     * Обработка алертов сервисов
     */
    private handleServiceAlert;
    /**
     * Отправка алерта через настроенные каналы
     */
    private sendAlert;
    /**
     * Получение статуса всей системы мониторинга
     */
    getSystemStatus(): {
        running: boolean;
        components: {
            performanceMonitor: boolean;
            healthCheckManager: boolean;
            prometheusExporter: boolean;
        };
        metrics: {
            lastPerformanceSnapshot: any;
            systemHealth: any;
            prometheusUrl: string | null;
        };
    };
    /**
     * Запись запроса для метрик производительности
     */
    recordRequest(responseTime: number, isError?: boolean): void;
    /**
     * Принудительная проверка конкретного сервиса
     */
    checkService(serviceName: string): Promise<any>;
    /**
     * Принудительная проверка всех сервисов
     */
    checkAllServices(): Promise<any>;
    /**
     * Добавление кастомной метрики
     */
    addCustomMetric(name: string, type: 'counter' | 'gauge' | 'histogram' | 'summary', help: string, value: number | string, labels?: Record<string, string>): void;
    /**
     * Получение конфигурации
     */
    getConfig(): MonitoringSystemConfig;
    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig: Partial<MonitoringSystemConfig>): void;
    /**
     * Получение статуса работы системы
     */
    isActive(): boolean;
    /**
     * Создание кастомного алерта
     */
    createCustomAlert(type: 'performance' | 'health_status' | 'service' | 'security' | 'business', severity: 'low' | 'medium' | 'high' | 'critical', title: string, description: string, source: string, metadata?: Record<string, any>): Promise<any>;
    /**
     * Подтверждение алерта
     */
    acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean>;
    /**
     * Разрешение алерта
     */
    resolveAlert(alertId: string): Promise<boolean>;
    /**
     * Получение активных алертов
     */
    getActiveAlerts(): any[];
    /**
     * Получение истории алертов
     */
    getAlertHistory(): any[];
    /**
     * Получение статистики алертов
     */
    getAlertStatistics(): any;
    /**
     * Получение статистики уведомлений
     */
    getNotificationStatistics(): any;
    /**
     * Тестирование канала уведомлений
     */
    testNotificationChannel(channelType: string): Promise<boolean>;
    /**
     * Создание тестовой конфигурации канала
     */
    private createTestChannelConfig;
}
export default MonitoringSystem;
