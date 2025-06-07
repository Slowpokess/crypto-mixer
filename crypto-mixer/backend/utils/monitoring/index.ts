/**
 * Мониторинг производительности и health checks для crypto-mixer
 * 
 * Экспортирует все компоненты системы мониторинга:
 * - PerformanceMonitor - сбор метрик производительности
 * - HealthCheckManager - проверки состояния сервисов
 * - PrometheusExporter - экспорт метрик в Prometheus
 * - MonitoringSystem - интегрированная система мониторинга
 */

// Основные компоненты
export { default as PerformanceMonitor } from './PerformanceMonitor';
export { default as HealthCheckManager } from './HealthCheckManager';
export { default as PrometheusExporter } from './PrometheusExporter';
export { default as MonitoringSystem } from './MonitoringSystem';
export { default as AlertManager } from './AlertManager';
export { default as NotificationManager } from './NotificationManager';

// Экспорт типов и интерфейсов
export type {
  SystemMetrics,
  ApplicationMetrics,
  BusinessMetrics,
  PerformanceSnapshot,
  PerformanceConfig
} from './PerformanceMonitor';

export type {
  HealthCheckConfig,
  ServiceConfig,
  HealthCheckResult,
  SystemHealthStatus
} from './HealthCheckManager';

export type {
  PrometheusMetric,
  PrometheusMetricType,
  PrometheusConfig
} from './PrometheusExporter';

export type {
  MonitoringSystemConfig
} from './MonitoringSystem';

export type {
  Alert,
  AlertType,
  AlertSeverity,
  AlertStatus,
  AlertRule,
  AlertCondition,
  AlertManagerConfig,
  NotificationChannel,
  NotificationChannelConfig
} from './AlertManager';

export type {
  NotificationResult,
  NotificationStats
} from './NotificationManager';

/**
 * Создание и инициализация системы мониторинга с дефолтной конфигурацией
 */
export function createMonitoringSystem(config?: Partial<any>) {
  const MonitoringSystemClass = require('./MonitoringSystem').default;
  return new MonitoringSystemClass(config);
}

/**
 * Конфигурация мониторинга для production среды
 */
export const PRODUCTION_MONITORING_CONFIG = {
  enabled: true,
  performanceMonitoring: {
    enabled: true,
    collectInterval: 30,
    retentionPeriod: 3600,
    alerting: {
      enabled: true,
      thresholds: {
        cpu: 80,
        memory: 85,
        disk: 90,
        responseTime: 5000,
        errorRate: 5
      }
    }
  },
  healthChecks: {
    enabled: true,
    interval: 60,
    timeout: 30,
    retries: 3,
    services: [] // Будет заполнено автоматически
  },
  prometheus: {
    enabled: true,
    port: 9090,
    path: '/metrics',
    namespace: 'crypto_mixer'
  },
  alerting: {
    enabled: true
  }
};

/**
 * Конфигурация мониторинга для development среды
 */
export const DEVELOPMENT_MONITORING_CONFIG = {
  enabled: true,
  performanceMonitoring: {
    enabled: true,
    collectInterval: 60,
    retentionPeriod: 1800,
    alerting: {
      enabled: false,
      thresholds: {
        cpu: 90,
        memory: 90,
        disk: 95,
        responseTime: 10000,
        errorRate: 10
      }
    }
  },
  healthChecks: {
    enabled: true,
    interval: 120,
    timeout: 30,
    retries: 2,
    services: []
  },
  prometheus: {
    enabled: true,
    port: 9090,
    path: '/metrics',
    namespace: 'crypto_mixer'
  },
  alerting: {
    enabled: false
  }
};

/**
 * Список дефолтных метрик для экспорта в Prometheus
 */
export const DEFAULT_PROMETHEUS_METRICS = [
  'crypto_mixer_system_cpu_usage',
  'crypto_mixer_system_memory_usage',
  'crypto_mixer_system_disk_usage',
  'crypto_mixer_system_health_status',
  'crypto_mixer_requests_per_second',
  'crypto_mixer_request_duration_milliseconds',
  'crypto_mixer_request_error_rate',
  'crypto_mixer_mixing_operations_in_progress',
  'crypto_mixer_mixing_operations_completed_total',
  'crypto_mixer_mixing_operations_failed_total',
  'crypto_mixer_mixing_success_rate',
  'crypto_mixer_database_connections_active',
  'crypto_mixer_database_connections_idle',
  'crypto_mixer_wallets_total',
  'crypto_mixer_wallets_active',
  'crypto_mixer_blockchain_connected',
  'crypto_mixer_security_alerts_active',
  'crypto_mixer_security_blocked_transactions_total',
  'crypto_mixer_service_health_status',
  'crypto_mixer_service_response_time_milliseconds',
  'crypto_mixer_service_uptime_percentage'
];

/**
 * Utility функция для создания кастомных health check сервисов
 */
export function createHealthCheckService(
  name: string,
  type: 'http' | 'tcp' | 'database' | 'redis' | 'rabbitmq' | 'vault' | 'hsm' | 'command' | 'custom',
  config: any
) {
  return {
    name,
    type,
    enabled: true,
    critical: config.critical || false,
    ...config
  };
}

/**
 * Utility функция для добавления Prometheus метрики
 */
export function createPrometheusMetric(
  name: string,
  type: 'counter' | 'gauge' | 'histogram' | 'summary',
  help: string,
  value: number | string,
  labels?: Record<string, string>
) {
  return {
    name,
    type,
    help,
    value,
    labels,
    timestamp: Date.now()
  };
}

/**
 * Константы для типов алертов
 */
export const ALERT_TYPES = {
  PERFORMANCE: 'performance',
  HEALTH: 'health_status',
  SERVICE: 'service',
  SECURITY: 'security',
  BUSINESS: 'business'
} as const;

export const ALERT_SEVERITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

/**
 * Константы для статусов здоровья
 */
export const HEALTH_STATUSES = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
  DOWN: 'down',
  DEGRADED: 'degraded'
} as const;