/**
 * Мониторинг производительности и health checks для crypto-mixer
 *
 * Экспортирует все компоненты системы мониторинга:
 * - PerformanceMonitor - сбор метрик производительности
 * - HealthCheckManager - проверки состояния сервисов
 * - PrometheusExporter - экспорт метрик в Prometheus
 * - MonitoringSystem - интегрированная система мониторинга
 */
export { default as PerformanceMonitor } from './PerformanceMonitor';
export { default as HealthCheckManager } from './HealthCheckManager';
export { default as PrometheusExporter } from './PrometheusExporter';
export { default as MonitoringSystem } from './MonitoringSystem';
export { default as AlertManager } from './AlertManager';
export { default as NotificationManager } from './NotificationManager';
export type { SystemMetrics, ApplicationMetrics, BusinessMetrics, PerformanceSnapshot, PerformanceConfig } from './PerformanceMonitor';
export type { HealthCheckConfig, ServiceConfig, HealthCheckResult, SystemHealthStatus } from './HealthCheckManager';
export type { PrometheusMetric, PrometheusMetricType, PrometheusConfig } from './PrometheusExporter';
export type { MonitoringSystemConfig } from './MonitoringSystem';
export type { Alert, AlertType, AlertSeverity, AlertStatus, AlertRule, AlertCondition, AlertManagerConfig, NotificationChannel, NotificationChannelConfig } from './AlertManager';
export type { NotificationResult, NotificationStats } from './NotificationManager';
/**
 * Создание и инициализация системы мониторинга с дефолтной конфигурацией
 */
export declare function createMonitoringSystem(config?: Partial<any>): any;
/**
 * Конфигурация мониторинга для production среды
 */
export declare const PRODUCTION_MONITORING_CONFIG: {
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
        services: never[];
    };
    prometheus: {
        enabled: boolean;
        port: number;
        path: string;
        namespace: string;
    };
    alerting: {
        enabled: boolean;
    };
};
/**
 * Конфигурация мониторинга для development среды
 */
export declare const DEVELOPMENT_MONITORING_CONFIG: {
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
        services: never[];
    };
    prometheus: {
        enabled: boolean;
        port: number;
        path: string;
        namespace: string;
    };
    alerting: {
        enabled: boolean;
    };
};
/**
 * Список дефолтных метрик для экспорта в Prometheus
 */
export declare const DEFAULT_PROMETHEUS_METRICS: string[];
/**
 * Utility функция для создания кастомных health check сервисов
 */
export declare function createHealthCheckService(name: string, type: 'http' | 'tcp' | 'database' | 'redis' | 'rabbitmq' | 'vault' | 'hsm' | 'command' | 'custom', config: any): any;
/**
 * Utility функция для добавления Prometheus метрики
 */
export declare function createPrometheusMetric(name: string, type: 'counter' | 'gauge' | 'histogram' | 'summary', help: string, value: number | string, labels?: Record<string, string>): {
    name: string;
    type: "counter" | "gauge" | "histogram" | "summary";
    help: string;
    value: string | number;
    labels: Record<string, string> | undefined;
    timestamp: number;
};
/**
 * Константы для типов алертов
 */
export declare const ALERT_TYPES: {
    readonly PERFORMANCE: "performance";
    readonly HEALTH: "health_status";
    readonly SERVICE: "service";
    readonly SECURITY: "security";
    readonly BUSINESS: "business";
};
export declare const ALERT_SEVERITIES: {
    readonly LOW: "low";
    readonly MEDIUM: "medium";
    readonly HIGH: "high";
    readonly CRITICAL: "critical";
};
/**
 * Константы для статусов здоровья
 */
export declare const HEALTH_STATUSES: {
    readonly HEALTHY: "healthy";
    readonly WARNING: "warning";
    readonly CRITICAL: "critical";
    readonly UNKNOWN: "unknown";
    readonly DOWN: "down";
    readonly DEGRADED: "degraded";
};
