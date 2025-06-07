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

// Core Backup Components
export { BackupManager } from './BackupManager';
export type { 
  BackupConfig, 
  BackupMetadata, 
  BackupComponent, 
  RestoreOptions, 
  BackupReport 
} from './BackupManager';

// Disaster Recovery Components
export { DisasterRecoveryManager } from './DisasterRecoveryManager';
export type { 
  DisasterRecoveryConfig, 
  RecoveryPlan, 
  RecoveryStep, 
  ValidationStep, 
  DisasterEvent, 
  RecoveryExecution, 
  SystemHealthStatus, 
  ComponentHealth 
} from './DisasterRecoveryManager';

// Monitoring & Alerting Components
export { BackupMonitoring } from './BackupMonitoring';
export type { 
  BackupMonitoringConfig, 
  AlertChannel, 
  EscalationPolicy, 
  EscalationLevel, 
  AlertSeverity, 
  Alert, 
  AlertNotification, 
  BackupMetrics, 
  DashboardData 
} from './BackupMonitoring';

// Dashboard Components
export { BackupDashboard } from './BackupDashboard';

// Integrated System
export { IntegratedBackupSystem, createIntegratedBackupSystem } from './BackupIntegration';
export type { 
  IntegratedBackupSystemConfig, 
  SystemStatus 
} from './BackupIntegration';

/**
 * Default конфигурации для быстрого старта
 */
export const DEFAULT_CONFIGS = {
  /**
   * Минимальная конфигурация для development окружения
   */
  DEVELOPMENT: {
    backup: {
      enabled: true,
      storage: {
        local: {
          enabled: true,
          path: './dev-backups',
          maxFiles: 10,
          retention: { daily: 3, weekly: 1, monthly: 1 }
        },
        remote: { enabled: false }
      },
      schedule: {
        full: '0 2 * * *',
        incremental: '0 */12 * * *',
        differential: '0 14 * * *'
      },
      compression: { enabled: true, level: 3, algorithm: 'gzip' },
      encryption: { enabled: false },
      verification: { checksumAlgorithm: 'sha256', integrityCheck: true, testRestore: false },
      alerts: { enabled: true, alertOnFailure: true, alertOnSuccess: false }
    },
    disasterRecovery: {
      enabled: true,
      autoRecovery: {
        enabled: false, // Отключено для dev
        triggers: { databaseFailure: false, applicationCrash: false }
      }
    },
    monitoring: {
      enabled: true,
      thresholds: {
        maxBackupDuration: 60,
        minSuccessRate: 80,
        maxFailedBackups: 5,
        diskSpaceWarning: 90,
        diskSpaceCritical: 98,
        healthCheckInterval: 120
      },
      alerts: { enabled: true, channels: [] },
      dashboard: { enabled: true }
    },
    dashboard: { enabled: true, port: 3030 },
    integration: { autoStart: true, gracefulShutdownTimeout: 10 }
  },

  /**
   * Production конфигурация с полной безопасностью
   */
  PRODUCTION: {
    backup: {
      enabled: true,
      storage: {
        local: {
          enabled: true,
          path: '/var/backups/crypto-mixer',
          maxFiles: 100,
          retention: { daily: 30, weekly: 12, monthly: 24 }
        },
        remote: {
          enabled: true,
          type: 'aws-s3',
          encryption: true
        }
      },
      schedule: {
        full: '0 2 * * 0',        // Воскресенье 02:00
        incremental: '0 */4 * * *', // Каждые 4 часа
        differential: '0 2 * * 1-6'  // Понедельник-Суббота 02:00
      },
      compression: { enabled: true, level: 9, algorithm: 'gzip' },
      encryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyRotation: true,
        keyRotationDays: 30
      },
      verification: {
        checksumAlgorithm: 'sha512',
        integrityCheck: true,
        testRestore: true,
        testRestoreFrequency: 7
      },
      alerts: {
        enabled: true,
        alertOnFailure: true,
        alertOnSuccess: true,
        alertOnLongDuration: true,
        maxDurationMinutes: 180
      }
    },
    disasterRecovery: {
      enabled: true,
      autoRecovery: {
        enabled: true,
        triggers: {
          databaseFailure: true,
          applicationCrash: true,
          dataCorruption: true,
          serviceUnavailable: true,
          manualTrigger: true
        },
        thresholds: {
          healthCheckFailures: 2,
          responseTimeMs: 3000,
          errorRate: 5,
          memoryUsagePercent: 85,
          diskUsagePercent: 90
        },
        cooldownPeriod: 10,
        maxRetries: 2
      },
      validation: {
        postRecoveryChecks: true,
        dataIntegrityValidation: true,
        serviceHealthValidation: true,
        performanceValidation: true,
        timeoutMinutes: 60
      },
      failover: {
        enabled: true,
        automaticFailover: false,
        manualApprovalRequired: true
      }
    },
    monitoring: {
      enabled: true,
      thresholds: {
        maxBackupDuration: 240,
        minSuccessRate: 98,
        maxFailedBackups: 2,
        diskSpaceWarning: 75,
        diskSpaceCritical: 90,
        healthCheckInterval: 30
      },
      alerts: {
        enabled: true,
        escalation: { enabled: true, maxEscalations: 5 },
        rateLimit: { enabled: true, maxAlertsPerHour: 50 }
      },
      metrics: {
        retentionDays: 90,
        exportEnabled: true,
        exportFormat: 'json'
      },
      dashboard: { enabled: true, historyDepth: 30 }
    },
    dashboard: { enabled: true, port: 3030 },
    integration: {
      autoStart: true,
      gracefulShutdownTimeout: 60,
      healthCheckEnabled: true,
      healthCheckInterval: 180
    }
  },

  /**
   * Testing конфигурация для unit/integration тестов
   */
  TESTING: {
    backup: {
      enabled: true,
      storage: {
        local: {
          enabled: true,
          path: './test-backups',
          maxFiles: 5,
          retention: { daily: 1, weekly: 0, monthly: 0 }
        },
        remote: { enabled: false }
      },
      schedule: {
        full: '0 0 1 1 *',  // Никогда (1 января в 00:00)
        incremental: '0 0 1 1 *',
        differential: '0 0 1 1 *'
      },
      compression: { enabled: false },
      encryption: { enabled: false },
      verification: { checksumAlgorithm: 'sha256', integrityCheck: true, testRestore: false },
      alerts: { enabled: false }
    },
    disasterRecovery: {
      enabled: true,
      autoRecovery: { enabled: false }
    },
    monitoring: {
      enabled: false,
      alerts: { enabled: false },
      dashboard: { enabled: false }
    },
    dashboard: { enabled: false },
    integration: { autoStart: false, gracefulShutdownTimeout: 5 }
  }
};

/**
 * Utility функции для работы с backup системой
 */
export const BackupUtils = {
  /**
   * Проверка конфигурации backup системы
   */
  validateConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.backup?.storage?.local?.path) {
      errors.push('Local storage path is required');
    }
    
    if (config.backup?.encryption?.enabled && !process.env.BACKUP_ENCRYPTION_KEY) {
      errors.push('BACKUP_ENCRYPTION_KEY environment variable is required when encryption is enabled');
    }
    
    if (config.monitoring?.alerts?.enabled && config.monitoring?.alerts?.channels?.length === 0) {
      errors.push('At least one alert channel is required when monitoring alerts are enabled');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Генерация рекомендуемой конфигурации на основе окружения
   */
  generateRecommendedConfig(environment: 'development' | 'production' | 'testing' = 'development'): any {
    const baseConfig = DEFAULT_CONFIGS[environment.toUpperCase() as keyof typeof DEFAULT_CONFIGS];
    
    // Добавление environment-specific настроек
    const envConfig = {
      ...baseConfig,
      backup: {
        ...baseConfig.backup,
        storage: {
          ...baseConfig.backup.storage,
          local: {
            ...baseConfig.backup.storage.local,
            path: process.env.BACKUP_PATH || baseConfig.backup.storage.local.path
          }
        }
      }
    };
    
    return envConfig;
  },

  /**
   * Конвертация размера в человеко-читаемый формат
   */
  formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  },

  /**
   * Конвертация длительности в человеко-читаемый формат
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  },

  /**
   * Расчет следующего времени backup по cron расписанию
   */
  getNextBackupTime(cronExpression: string): Date {
    // Упрощенная реализация - в production использовать cron-parser
    const now = new Date();
    return new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 часа
  }
};

/**
 * Константы для backup системы
 */
export const BACKUP_CONSTANTS = {
  // Типы backup
  BACKUP_TYPES: {
    FULL: 'full',
    INCREMENTAL: 'incremental',
    DIFFERENTIAL: 'differential'
  } as const,

  // Статусы backup
  BACKUP_STATUSES: {
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CORRUPTED: 'corrupted'
  } as const,

  // Приоритеты компонентов
  COMPONENT_PRIORITIES: {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
  } as const,

  // Уровни алертов
  ALERT_SEVERITIES: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency'
  } as const,

  // Статусы системы
  SYSTEM_STATUSES: {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    CRITICAL: 'critical',
    DOWN: 'down'
  } as const
};

/**
 * Экспорт всех типов для TypeScript
 */
export type {
  BackupConfig,
  BackupMetadata,
  BackupComponent,
  RestoreOptions,
  BackupReport,
  DisasterRecoveryConfig,
  RecoveryPlan,
  RecoveryStep,
  ValidationStep,
  DisasterEvent,
  RecoveryExecution,
  SystemHealthStatus,
  ComponentHealth,
  BackupMonitoringConfig,
  AlertChannel,
  EscalationPolicy,
  EscalationLevel,
  AlertSeverity,
  Alert,
  AlertNotification,
  BackupMetrics,
  DashboardData,
  IntegratedBackupSystemConfig,
  SystemStatus
} from './BackupIntegration';