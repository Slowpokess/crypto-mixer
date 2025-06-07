/**
 * Enterprise Backup & Disaster Recovery System
 *
 * Полноценная система резервного копирования и восстановления после катастроф
 * для crypto-mixer проекта. Включает в себя:
 *
 * - Автоматизированное резервное копирование
 * - Disaster Recovery с автоматическим восстановлением
 * - Real-time мониторинг и алертинг
 * - Web Dashboard для управления
 * - Интегрированное решение enterprise-уровня
 */
export { BackupManager } from './BackupManager';
export type { BackupConfig, BackupMetadata, BackupComponent, RestoreOptions, BackupReport } from './BackupManager';
export { DisasterRecoveryManager } from './DisasterRecoveryManager';
export type { DisasterRecoveryConfig, RecoveryPlan, RecoveryStep, ValidationStep, DisasterEvent, RecoveryExecution, SystemHealthStatus, ComponentHealth } from './DisasterRecoveryManager';
export { BackupMonitoring } from './BackupMonitoring';
export type { BackupMonitoringConfig, AlertChannel, EscalationPolicy, EscalationLevel, AlertSeverity, Alert, AlertNotification, BackupMetrics, DashboardData } from './BackupMonitoring';
export { BackupDashboard } from './BackupDashboard';
export { IntegratedBackupSystem, createIntegratedBackupSystem } from './BackupIntegration';
export type { IntegratedBackupSystemConfig, SystemStatus } from './BackupIntegration';
/**
 * Default конфигурации для быстрого старта
 */
export declare const DEFAULT_CONFIGS: {
    /**
     * Минимальная конфигурация для development окружения
     */
    DEVELOPMENT: {
        backup: {
            enabled: boolean;
            storage: {
                local: {
                    enabled: boolean;
                    path: string;
                    maxFiles: number;
                    retention: {
                        daily: number;
                        weekly: number;
                        monthly: number;
                    };
                };
                remote: {
                    enabled: boolean;
                };
            };
            schedule: {
                full: string;
                incremental: string;
                differential: string;
            };
            compression: {
                enabled: boolean;
                level: number;
                algorithm: string;
            };
            encryption: {
                enabled: boolean;
            };
            verification: {
                checksumAlgorithm: string;
                integrityCheck: boolean;
                testRestore: boolean;
            };
            alerts: {
                enabled: boolean;
                alertOnFailure: boolean;
                alertOnSuccess: boolean;
            };
        };
        disasterRecovery: {
            enabled: boolean;
            autoRecovery: {
                enabled: boolean;
                triggers: {
                    databaseFailure: boolean;
                    applicationCrash: boolean;
                };
            };
        };
        monitoring: {
            enabled: boolean;
            thresholds: {
                maxBackupDuration: number;
                minSuccessRate: number;
                maxFailedBackups: number;
                diskSpaceWarning: number;
                diskSpaceCritical: number;
                healthCheckInterval: number;
            };
            alerts: {
                enabled: boolean;
                channels: never[];
            };
            dashboard: {
                enabled: boolean;
            };
        };
        dashboard: {
            enabled: boolean;
            port: number;
        };
        integration: {
            autoStart: boolean;
            gracefulShutdownTimeout: number;
        };
    };
    /**
     * Production конфигурация с полной безопасностью
     */
    PRODUCTION: {
        backup: {
            enabled: boolean;
            storage: {
                local: {
                    enabled: boolean;
                    path: string;
                    maxFiles: number;
                    retention: {
                        daily: number;
                        weekly: number;
                        monthly: number;
                    };
                };
                remote: {
                    enabled: boolean;
                    type: string;
                    encryption: boolean;
                };
            };
            schedule: {
                full: string;
                incremental: string;
                differential: string;
            };
            compression: {
                enabled: boolean;
                level: number;
                algorithm: string;
            };
            encryption: {
                enabled: boolean;
                algorithm: string;
                keyRotation: boolean;
                keyRotationDays: number;
            };
            verification: {
                checksumAlgorithm: string;
                integrityCheck: boolean;
                testRestore: boolean;
                testRestoreFrequency: number;
            };
            alerts: {
                enabled: boolean;
                alertOnFailure: boolean;
                alertOnSuccess: boolean;
                alertOnLongDuration: boolean;
                maxDurationMinutes: number;
            };
        };
        disasterRecovery: {
            enabled: boolean;
            autoRecovery: {
                enabled: boolean;
                triggers: {
                    databaseFailure: boolean;
                    applicationCrash: boolean;
                    dataCorruption: boolean;
                    serviceUnavailable: boolean;
                    manualTrigger: boolean;
                };
                thresholds: {
                    healthCheckFailures: number;
                    responseTimeMs: number;
                    errorRate: number;
                    memoryUsagePercent: number;
                    diskUsagePercent: number;
                };
                cooldownPeriod: number;
                maxRetries: number;
            };
            validation: {
                postRecoveryChecks: boolean;
                dataIntegrityValidation: boolean;
                serviceHealthValidation: boolean;
                performanceValidation: boolean;
                timeoutMinutes: number;
            };
            failover: {
                enabled: boolean;
                automaticFailover: boolean;
                manualApprovalRequired: boolean;
            };
        };
        monitoring: {
            enabled: boolean;
            thresholds: {
                maxBackupDuration: number;
                minSuccessRate: number;
                maxFailedBackups: number;
                diskSpaceWarning: number;
                diskSpaceCritical: number;
                healthCheckInterval: number;
            };
            alerts: {
                enabled: boolean;
                escalation: {
                    enabled: boolean;
                    maxEscalations: number;
                };
                rateLimit: {
                    enabled: boolean;
                    maxAlertsPerHour: number;
                };
            };
            metrics: {
                retentionDays: number;
                exportEnabled: boolean;
                exportFormat: string;
            };
            dashboard: {
                enabled: boolean;
                historyDepth: number;
            };
        };
        dashboard: {
            enabled: boolean;
            port: number;
        };
        integration: {
            autoStart: boolean;
            gracefulShutdownTimeout: number;
            healthCheckEnabled: boolean;
            healthCheckInterval: number;
        };
    };
    /**
     * Testing конфигурация для unit/integration тестов
     */
    TESTING: {
        backup: {
            enabled: boolean;
            storage: {
                local: {
                    enabled: boolean;
                    path: string;
                    maxFiles: number;
                    retention: {
                        daily: number;
                        weekly: number;
                        monthly: number;
                    };
                };
                remote: {
                    enabled: boolean;
                };
            };
            schedule: {
                full: string;
                incremental: string;
                differential: string;
            };
            compression: {
                enabled: boolean;
            };
            encryption: {
                enabled: boolean;
            };
            verification: {
                checksumAlgorithm: string;
                integrityCheck: boolean;
                testRestore: boolean;
            };
            alerts: {
                enabled: boolean;
            };
        };
        disasterRecovery: {
            enabled: boolean;
            autoRecovery: {
                enabled: boolean;
            };
        };
        monitoring: {
            enabled: boolean;
            alerts: {
                enabled: boolean;
            };
            dashboard: {
                enabled: boolean;
            };
        };
        dashboard: {
            enabled: boolean;
        };
        integration: {
            autoStart: boolean;
            gracefulShutdownTimeout: number;
        };
    };
};
/**
 * Utility функции для работы с backup системой
 */
export declare const BackupUtils: {
    /**
     * Проверка конфигурации backup системы
     */
    validateConfig(config: any): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Генерация рекомендуемой конфигурации на основе окружения
     */
    generateRecommendedConfig(environment?: "development" | "production" | "testing"): any;
    /**
     * Конвертация размера в человеко-читаемый формат
     */
    formatSize(bytes: number): string;
    /**
     * Конвертация длительности в человеко-читаемый формат
     */
    formatDuration(seconds: number): string;
    /**
     * Расчет следующего времени backup по cron расписанию
     */
    getNextBackupTime(cronExpression: string): Date;
};
/**
 * Константы для backup системы
 */
export declare const BACKUP_CONSTANTS: {
    BACKUP_TYPES: {
        readonly FULL: "full";
        readonly INCREMENTAL: "incremental";
        readonly DIFFERENTIAL: "differential";
    };
    BACKUP_STATUSES: {
        readonly IN_PROGRESS: "in_progress";
        readonly COMPLETED: "completed";
        readonly FAILED: "failed";
        readonly CORRUPTED: "corrupted";
    };
    COMPONENT_PRIORITIES: {
        readonly CRITICAL: "critical";
        readonly HIGH: "high";
        readonly MEDIUM: "medium";
        readonly LOW: "low";
    };
    ALERT_SEVERITIES: {
        readonly INFO: "info";
        readonly WARNING: "warning";
        readonly ERROR: "error";
        readonly CRITICAL: "critical";
        readonly EMERGENCY: "emergency";
    };
    SYSTEM_STATUSES: {
        readonly HEALTHY: "healthy";
        readonly WARNING: "warning";
        readonly CRITICAL: "critical";
        readonly DOWN: "down";
    };
};
/**
 * Экспорт всех типов для TypeScript
 */
export type { BackupConfig, BackupMetadata, BackupComponent, RestoreOptions, BackupReport, DisasterRecoveryConfig, RecoveryPlan, RecoveryStep, ValidationStep, DisasterEvent, RecoveryExecution, SystemHealthStatus, ComponentHealth, BackupMonitoringConfig, AlertChannel, EscalationPolicy, EscalationLevel, AlertSeverity, Alert, AlertNotification, BackupMetrics, DashboardData, IntegratedBackupSystemConfig, SystemStatus } from './BackupIntegration';
