import { EventEmitter } from 'events';
/**
 * Типы и интерфейсы для системы health checks
 */
export interface HealthCheckConfig {
    enabled: boolean;
    interval: number;
    timeout: number;
    retries: number;
    parallelChecks: boolean;
    alertThresholds: {
        consecutiveFailures: number;
        responseTimeWarning: number;
        responseTimeCritical: number;
    };
    services: ServiceConfig[];
}
export interface ServiceConfig {
    name: string;
    type: 'http' | 'tcp' | 'database' | 'redis' | 'rabbitmq' | 'vault' | 'hsm' | 'command' | 'custom';
    enabled: boolean;
    critical: boolean;
    host?: string;
    port?: number;
    path?: string;
    expectedStatus?: number;
    timeout?: number;
    interval?: number;
    metadata?: Record<string, any>;
    customCheck?: () => Promise<HealthCheckResult>;
}
export interface HealthCheckResult {
    serviceName: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    responseTime: number;
    timestamp: Date;
    details: {
        message: string;
        data?: any;
        error?: string;
    };
    metadata: {
        consecutiveFailures: number;
        lastSuccess?: Date;
        lastFailure?: Date;
        uptime?: number;
    };
}
export interface SystemHealthStatus {
    overall: 'healthy' | 'degraded' | 'critical' | 'down';
    timestamp: Date;
    services: Map<string, HealthCheckResult>;
    summary: {
        total: number;
        healthy: number;
        warning: number;
        critical: number;
        unknown: number;
    };
    criticalServicesDown: string[];
    averageResponseTime: number;
    systemUptime: number;
}
/**
 * Централизованный менеджер health checks для всех сервисов crypto-mixer
 */
export declare class HealthCheckManager extends EventEmitter {
    private config;
    private isRunning;
    private checkInterval;
    private serviceResults;
    private serviceHistory;
    private consecutiveFailures;
    private systemStartTime;
    private healthyTime;
    private lastOverallStatus;
    constructor(config: HealthCheckConfig);
    /**
     * Запуск системы health checks
     */
    start(): Promise<void>;
    /**
     * Остановка системы health checks
     */
    stop(): Promise<void>;
    /**
     * Выполнение проверок всех сервисов
     */
    private performHealthChecks;
    /**
     * Проверка конкретного сервиса
     */
    private checkService;
    /**
     * Выполнение конкретной проверки в зависимости от типа сервиса
     */
    private executeServiceCheck;
    /**
     * Проверка HTTP сервиса
     */
    private checkHTTPService;
    /**
     * Проверка TCP подключения
     */
    private checkTCPService;
    /**
     * Проверка PostgreSQL базы данных
     */
    private checkDatabaseService;
    /**
     * Проверка Redis сервиса
     */
    private checkRedisService;
    /**
     * Проверка RabbitMQ сервиса
     */
    private checkRabbitMQService;
    /**
     * Проверка HashiCorp Vault
     */
    private checkVaultService;
    /**
     * Проверка HSM Manager
     */
    private checkHSMService;
    /**
     * Проверка через выполнение команды
     */
    private checkCommandService;
    /**
     * Создание результата ошибки
     */
    private createErrorResult;
    /**
     * Обновление результатов сервисов
     */
    private updateServiceResults;
    /**
     * Расчет общего состояния системы
     */
    private calculateSystemHealth;
    /**
     * Проверка изменений статуса и отправка событий
     */
    private checkStatusChanges;
    /**
     * Проверка алертов для конкретного сервиса
     */
    private checkServiceAlerts;
    /**
     * Расчет uptime для конкретного сервиса
     */
    private calculateServiceUptime;
    /**
     * Расчет общего uptime системы
     */
    private calculateSystemUptime;
    /**
     * Обновление статистики uptime
     */
    private updateUptimeStats;
    /**
     * Получение текущего статуса системы
     */
    getSystemHealth(): SystemHealthStatus;
    /**
     * Получение результата для конкретного сервиса
     */
    getServiceHealth(serviceName: string): HealthCheckResult | null;
    /**
     * Получение истории для конкретного сервиса
     */
    getServiceHistory(serviceName: string, limit?: number): HealthCheckResult[];
    /**
     * Принудительная проверка конкретного сервиса
     */
    checkServiceNow(serviceName: string): Promise<HealthCheckResult>;
    /**
     * Принудительная проверка всех сервисов
     */
    checkAllServicesNow(): Promise<SystemHealthStatus>;
    private validateConfig;
    private initializeServices;
    /**
     * Получение статуса работы менеджера
     */
    isActive(): boolean;
    /**
     * Получение конфигурации
     */
    getConfig(): HealthCheckConfig;
}
