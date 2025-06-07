"use strict";
/**
 * Мониторинг производительности и health checks для crypto-mixer
 *
 * Экспортирует все компоненты системы мониторинга:
 * - PerformanceMonitor - сбор метрик производительности
 * - HealthCheckManager - проверки состояния сервисов
 * - PrometheusExporter - экспорт метрик в Prometheus
 * - MonitoringSystem - интегрированная система мониторинга
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEALTH_STATUSES = exports.ALERT_SEVERITIES = exports.ALERT_TYPES = exports.DEFAULT_PROMETHEUS_METRICS = exports.DEVELOPMENT_MONITORING_CONFIG = exports.PRODUCTION_MONITORING_CONFIG = exports.NotificationManager = exports.AlertManager = exports.MonitoringSystem = exports.PrometheusExporter = exports.HealthCheckManager = exports.PerformanceMonitor = void 0;
exports.createMonitoringSystem = createMonitoringSystem;
exports.createHealthCheckService = createHealthCheckService;
exports.createPrometheusMetric = createPrometheusMetric;
// Основные компоненты
var PerformanceMonitor_1 = require("./PerformanceMonitor");
Object.defineProperty(exports, "PerformanceMonitor", { enumerable: true, get: function () { return __importDefault(PerformanceMonitor_1).default; } });
var HealthCheckManager_1 = require("./HealthCheckManager");
Object.defineProperty(exports, "HealthCheckManager", { enumerable: true, get: function () { return __importDefault(HealthCheckManager_1).default; } });
var PrometheusExporter_1 = require("./PrometheusExporter");
Object.defineProperty(exports, "PrometheusExporter", { enumerable: true, get: function () { return __importDefault(PrometheusExporter_1).default; } });
var MonitoringSystem_1 = require("./MonitoringSystem");
Object.defineProperty(exports, "MonitoringSystem", { enumerable: true, get: function () { return __importDefault(MonitoringSystem_1).default; } });
var AlertManager_1 = require("./AlertManager");
Object.defineProperty(exports, "AlertManager", { enumerable: true, get: function () { return __importDefault(AlertManager_1).default; } });
var NotificationManager_1 = require("./NotificationManager");
Object.defineProperty(exports, "NotificationManager", { enumerable: true, get: function () { return __importDefault(NotificationManager_1).default; } });
/**
 * Создание и инициализация системы мониторинга с дефолтной конфигурацией
 */
function createMonitoringSystem(config) {
    const MonitoringSystemClass = require('./MonitoringSystem').default;
    return new MonitoringSystemClass(config);
}
/**
 * Конфигурация мониторинга для production среды
 */
exports.PRODUCTION_MONITORING_CONFIG = {
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
exports.DEVELOPMENT_MONITORING_CONFIG = {
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
exports.DEFAULT_PROMETHEUS_METRICS = [
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
function createHealthCheckService(name, type, config) {
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
function createPrometheusMetric(name, type, help, value, labels) {
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
exports.ALERT_TYPES = {
    PERFORMANCE: 'performance',
    HEALTH: 'health_status',
    SERVICE: 'service',
    SECURITY: 'security',
    BUSINESS: 'business'
};
exports.ALERT_SEVERITIES = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};
/**
 * Константы для статусов здоровья
 */
exports.HEALTH_STATUSES = {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    CRITICAL: 'critical',
    UNKNOWN: 'unknown',
    DOWN: 'down',
    DEGRADED: 'degraded'
};
//# sourceMappingURL=index.js.map