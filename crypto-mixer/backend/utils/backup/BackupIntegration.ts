import { BackupManager, BackupConfig } from './BackupManager';
import { DisasterRecoveryManager, DisasterRecoveryConfig } from './DisasterRecoveryManager';
import { BackupMonitoring, BackupMonitoringConfig } from './BackupMonitoring';
import { BackupDashboard } from './BackupDashboard';
import { enhancedDbLogger } from '../logger';

/**
 * Конфигурация интегрированной системы backup
 */
export interface IntegratedBackupSystemConfig {
  backup: BackupConfig;
  disasterRecovery: DisasterRecoveryConfig;
  monitoring: BackupMonitoringConfig;
  dashboard: {
    enabled: boolean;
    port: number;
  };
  integration: {
    autoStart: boolean;
    gracefulShutdownTimeout: number; // секунды
    healthCheckEnabled: boolean;
    healthCheckInterval: number; // секунды
  };
}

/**
 * Статус интегрированной системы
 */
export interface SystemStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'down';
  components: {
    backupManager: 'running' | 'stopped' | 'error';
    disasterRecovery: 'running' | 'stopped' | 'error';
    monitoring: 'running' | 'stopped' | 'error';
    dashboard: 'running' | 'stopped' | 'error';
  };
  lastHealthCheck: Date;
  uptime: number; // секунды
  errors: string[];
}

/**
 * Интегрированная система Backup и Disaster Recovery
 * Объединяет все компоненты в единое решение enterprise-уровня
 */
export class IntegratedBackupSystem {
  private config: IntegratedBackupSystemConfig;
  private backupManager: BackupManager;
  private drManager: DisasterRecoveryManager;
  private monitoring: BackupMonitoring;
  private dashboard: BackupDashboard | null = null;
  
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private startTime: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date | null = null;
  private systemErrors: string[] = [];

  constructor(config: IntegratedBackupSystemConfig) {
    this.config = config;
    
    // Инициализация компонентов
    this.backupManager = new BackupManager(config.backup);
    this.drManager = new DisasterRecoveryManager(config.disasterRecovery, this.backupManager);
    this.monitoring = new BackupMonitoring(config.monitoring, this.backupManager, this.drManager);
    
    if (config.dashboard.enabled) {
      this.dashboard = new BackupDashboard(
        this.monitoring,
        this.backupManager,
        this.drManager,
        config.dashboard.port
      );
    }
    
    this.setupEventHandlers();
  }

  /**
   * Инициализация всей системы
   */
  async initialize(): Promise<void> {
    const operationId = await enhancedDbLogger.startOperation('integrated_backup_system_init');
    
    try {
      enhancedDbLogger.info('🚀 Инициализация Integrated Backup System');
      
      this.systemErrors = [];
      
      // Последовательная инициализация компонентов
      await this.initializeBackupManager();
      await this.initializeDisasterRecoveryManager();
      await this.initializeMonitoring();
      
      if (this.dashboard) {
        await this.initializeDashboard();
      }
      
      this.isInitialized = true;
      
      // Автозапуск если включен
      if (this.config.integration.autoStart) {
        await this.start();
      }
      
      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Integrated Backup System инициализирован', {
        components: {
          backupManager: true,
          disasterRecovery: true,
          monitoring: true,
          dashboard: !!this.dashboard
        },
        autoStart: this.config.integration.autoStart
      });
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      this.systemErrors.push(`Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Запуск всех компонентов системы
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Система не инициализирована. Вызовите initialize() сначала');
    }
    
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Система уже запущена');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('integrated_backup_system_start');
    
    try {
      enhancedDbLogger.info('🚀 Запуск Integrated Backup System');
      
      this.startTime = new Date();
      this.systemErrors = [];
      
      // Запуск мониторинга (должен быть первым для отслеживания других компонентов)
      if (this.monitoring && this.config.monitoring.enabled) {
        await this.startMonitoring();
      }
      
      // Запуск disaster recovery менеджера
      if (this.drManager && this.config.disasterRecovery.enabled) {
        await this.startDisasterRecovery();
      }
      
      // Запуск dashboard
      if (this.dashboard && this.config.dashboard.enabled) {
        await this.startDashboard();
      }
      
      // Запуск системного health check
      if (this.config.integration.healthCheckEnabled) {
        this.startSystemHealthCheck();
      }
      
      this.isRunning = true;
      
      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Integrated Backup System запущен', {
        uptime: this.getUptime(),
        components: this.getComponentsStatus()
      });
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      this.systemErrors.push(`Start failed: ${error}`);
      throw error;
    }
  }

  /**
   * Остановка всех компонентов системы
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      enhancedDbLogger.warn('⚠️ Система уже остановлена');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('integrated_backup_system_stop');
    
    try {
      enhancedDbLogger.info('🛑 Остановка Integrated Backup System');
      
      // Остановка health check
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      // Graceful shutdown с таймаутом
      const shutdownPromises: Promise<void>[] = [];
      
      // Остановка dashboard (первым, чтобы перестать принимать запросы)
      if (this.dashboard) {
        shutdownPromises.push(
          this.stopDashboard().catch(error => {
            this.systemErrors.push(`Dashboard shutdown error: ${error}`);
          })
        );
      }
      
      // Остановка мониторинга
      if (this.monitoring) {
        shutdownPromises.push(
          this.stopMonitoring().catch(error => {
            this.systemErrors.push(`Monitoring shutdown error: ${error}`);
          })
        );
      }
      
      // Остановка disaster recovery
      if (this.drManager) {
        shutdownPromises.push(
          this.stopDisasterRecovery().catch(error => {
            this.systemErrors.push(`Disaster Recovery shutdown error: ${error}`);
          })
        );
      }
      
      // Остановка backup manager (последним)
      if (this.backupManager) {
        shutdownPromises.push(
          this.stopBackupManager().catch(error => {
            this.systemErrors.push(`Backup Manager shutdown error: ${error}`);
          })
        );
      }
      
      // Ожидание завершения всех операций с таймаутом
      const timeout = this.config.integration.gracefulShutdownTimeout * 1000;
      await Promise.race([
        Promise.allSettled(shutdownPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
        )
      ]);
      
      this.isRunning = false;
      this.startTime = null;
      
      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Integrated Backup System остановлен', {
        errors: this.systemErrors.length
      });
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      this.systemErrors.push(`Stop failed: ${error}`);
      
      // Принудительная остановка при ошибке
      this.isRunning = false;
      this.startTime = null;
      
      throw error;
    }
  }

  /**
   * Перезапуск системы
   */
  async restart(): Promise<void> {
    enhancedDbLogger.info('🔄 Перезапуск Integrated Backup System');
    
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза 2 секунды
    await this.start();
    
    enhancedDbLogger.info('✅ Integrated Backup System перезапущен');
  }

  /**
   * Получение статуса системы
   */
  getSystemStatus(): SystemStatus {
    return {
      overall: this.calculateOverallStatus(),
      components: this.getComponentsStatus(),
      lastHealthCheck: this.lastHealthCheck || new Date(0),
      uptime: this.getUptime(),
      errors: [...this.systemErrors]
    };
  }

  /**
   * Проверка готовности системы
   */
  isReady(): boolean {
    return this.isInitialized && this.isRunning;
  }

  /**
   * Получение времени работы в секундах
   */
  getUptime(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Создание backup через интегрированную систему
   */
  async createBackup(options: { priority?: string } = {}): Promise<any> {
    if (!this.isReady()) {
      throw new Error('Система не готова для создания backup');
    }
    
    enhancedDbLogger.info('📦 Создание backup через интегрированную систему', options);
    
    try {
      const report = await this.backupManager.createFullBackup(options);
      
      enhancedDbLogger.info('✅ Backup создан через интегрированную систему', {
        backupId: report.id,
        status: report.status,
        duration: report.duration
      });
      
      return report;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка создания backup', { error });
      throw error;
    }
  }

  /**
   * Выполнение восстановления через интегрированную систему
   */
  async performRecovery(planId: string, options: { dryRun?: boolean } = {}): Promise<any> {
    if (!this.isReady()) {
      throw new Error('Система не готова для восстановления');
    }
    
    enhancedDbLogger.info('🔄 Выполнение восстановления через интегрированную систему', {
      planId,
      ...options
    });
    
    try {
      const execution = await this.drManager.manualRecovery(planId, options);
      
      enhancedDbLogger.info('✅ Восстановление выполнено через интегрированную систему', {
        executionId: execution.id,
        status: execution.status
      });
      
      return execution;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка восстановления', { error });
      throw error;
    }
  }

  // ========== ПРИВАТНЫЕ МЕТОДЫ ==========

  private setupEventHandlers(): void {
    // Обработка критических ошибок
    process.on('uncaughtException', (error) => {
      enhancedDbLogger.error('💥 Необработанное исключение в Backup System', { error });
      this.systemErrors.push(`Uncaught exception: ${error.message}`);
    });

    process.on('unhandledRejection', (reason) => {
      enhancedDbLogger.error('💥 Необработанный Promise rejection в Backup System', { reason });
      this.systemErrors.push(`Unhandled rejection: ${reason}`);
    });

    // Graceful shutdown на системные сигналы
    const gracefulShutdown = async (signal: string) => {
      enhancedDbLogger.info(`🔚 Получен сигнал ${signal}, выполняется graceful shutdown`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка при graceful shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  private async initializeBackupManager(): Promise<void> {
    try {
      await this.backupManager.initialize();
      enhancedDbLogger.info('✅ BackupManager инициализирован');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации BackupManager', { error });
      throw new Error(`BackupManager initialization failed: ${error}`);
    }
  }

  private async initializeDisasterRecoveryManager(): Promise<void> {
    try {
      await this.drManager.initialize();
      enhancedDbLogger.info('✅ DisasterRecoveryManager инициализирован');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации DisasterRecoveryManager', { error });
      throw new Error(`DisasterRecoveryManager initialization failed: ${error}`);
    }
  }

  private async initializeMonitoring(): Promise<void> {
    try {
      await this.monitoring.initialize();
      enhancedDbLogger.info('✅ BackupMonitoring инициализирован');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации BackupMonitoring', { error });
      throw new Error(`BackupMonitoring initialization failed: ${error}`);
    }
  }

  private async initializeDashboard(): Promise<void> {
    if (!this.dashboard) return;
    
    try {
      // Dashboard инициализируется при создании, просто логируем
      enhancedDbLogger.info('✅ BackupDashboard инициализирован');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации BackupDashboard', { error });
      throw new Error(`BackupDashboard initialization failed: ${error}`);
    }
  }

  private async startMonitoring(): Promise<void> {
    try {
      // Monitoring запускается автоматически при инициализации если enabled
      enhancedDbLogger.info('✅ BackupMonitoring запущен');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска BackupMonitoring', { error });
      this.systemErrors.push(`Monitoring start failed: ${error}`);
    }
  }

  private async startDisasterRecovery(): Promise<void> {
    try {
      // DisasterRecovery запускается автоматически при инициализации если enabled
      enhancedDbLogger.info('✅ DisasterRecoveryManager запущен');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска DisasterRecoveryManager', { error });
      this.systemErrors.push(`DisasterRecovery start failed: ${error}`);
    }
  }

  private async startDashboard(): Promise<void> {
    if (!this.dashboard) return;
    
    try {
      await this.dashboard.start();
      enhancedDbLogger.info('✅ BackupDashboard запущен');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка запуска BackupDashboard', { error });
      this.systemErrors.push(`Dashboard start failed: ${error}`);
    }
  }

  private startSystemHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performSystemHealthCheck();
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка системного health check', { error });
        this.systemErrors.push(`Health check failed: ${error}`);
      }
    }, this.config.integration.healthCheckInterval * 1000);

    enhancedDbLogger.info('💓 Системный health check запущен', {
      interval: this.config.integration.healthCheckInterval
    });
  }

  private async performSystemHealthCheck(): Promise<void> {
    this.lastHealthCheck = new Date();
    
    const status = this.getSystemStatus();
    
    if (status.overall === 'critical' || status.overall === 'down') {
      enhancedDbLogger.error('🚨 Критическое состояние системы backup', {
        status: status.overall,
        errors: status.errors,
        components: status.components
      });
      
      // Можно добавить автоматические действия при критическом состоянии
      // Например, попытка перезапуска компонентов
    }
    
    enhancedDbLogger.debug('💓 Системный health check выполнен', {
      status: status.overall,
      uptime: status.uptime,
      errors: status.errors.length
    });
  }

  private async stopMonitoring(): Promise<void> {
    if (this.monitoring) {
      await this.monitoring.shutdown();
      enhancedDbLogger.info('🛑 BackupMonitoring остановлен');
    }
  }

  private async stopDisasterRecovery(): Promise<void> {
    if (this.drManager) {
      await this.drManager.shutdown();
      enhancedDbLogger.info('🛑 DisasterRecoveryManager остановлен');
    }
  }

  private async stopDashboard(): Promise<void> {
    if (this.dashboard) {
      await this.dashboard.stop();
      enhancedDbLogger.info('🛑 BackupDashboard остановлен');
    }
  }

  private async stopBackupManager(): Promise<void> {
    if (this.backupManager) {
      await this.backupManager.shutdown();
      enhancedDbLogger.info('🛑 BackupManager остановлен');
    }
  }

  private calculateOverallStatus(): 'healthy' | 'warning' | 'critical' | 'down' {
    if (!this.isRunning) return 'down';
    
    const components = this.getComponentsStatus();
    const componentValues = Object.values(components);
    
    if (componentValues.includes('error')) return 'critical';
    if (this.systemErrors.length > 5) return 'warning';
    if (!this.isReady()) return 'warning';
    
    return 'healthy';
  }

  private getComponentsStatus() {
    return {
      backupManager: this.isRunning ? 'running' : 'stopped',
      disasterRecovery: this.isRunning && this.config.disasterRecovery.enabled ? 'running' : 'stopped',
      monitoring: this.isRunning && this.config.monitoring.enabled ? 'running' : 'stopped',
      dashboard: this.dashboard?.getStatus().isRunning ? 'running' : 'stopped'
    };
  }
}

/**
 * Factory функция для создания настроенной системы backup
 */
export function createIntegratedBackupSystem(customConfig?: Partial<IntegratedBackupSystemConfig>): IntegratedBackupSystem {
  const defaultConfig: IntegratedBackupSystemConfig = {
    backup: {
      enabled: true,
      storage: {
        local: {
          enabled: true,
          path: '/app/backups',
          maxFiles: 50,
          retention: {
            daily: 7,
            weekly: 4,
            monthly: 12
          }
        },
        remote: {
          enabled: false,
          type: 'aws-s3',
          credentials: {},
          encryption: true
        }
      },
      schedule: {
        full: '0 2 * * *',      // 02:00 каждый день
        incremental: '0 */6 * * *', // каждые 6 часов
        differential: '0 8,20 * * *' // 08:00 и 20:00
      },
      compression: {
        enabled: true,
        level: 6,
        algorithm: 'gzip'
      },
      encryption: {
        enabled: true,
        algorithm: 'aes-256-gcm',
        keyRotation: true,
        keyRotationDays: 90
      },
      verification: {
        checksumAlgorithm: 'sha256',
        integrityCheck: true,
        testRestore: true,
        testRestoreFrequency: 7
      },
      alerts: {
        enabled: true,
        alertOnFailure: true,
        alertOnSuccess: false,
        alertOnLongDuration: true,
        maxDurationMinutes: 120
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
          healthCheckFailures: 3,
          responseTimeMs: 5000,
          errorRate: 10,
          memoryUsagePercent: 90,
          diskUsagePercent: 95
        },
        cooldownPeriod: 15,
        maxRetries: 3
      },
      recoveryPlan: [], // Will be populated by DisasterRecoveryManager
      monitoring: {
        healthCheckInterval: 60,
        alertThresholds: {
          warning: 1,
          critical: 3,
          emergency: 5
        },
        escalation: {
          level1: ['admin@crypto-mixer.com'],
          level2: ['emergency@crypto-mixer.com'],
          level3: ['+1234567890']
        }
      },
      validation: {
        postRecoveryChecks: true,
        dataIntegrityValidation: true,
        serviceHealthValidation: true,
        performanceValidation: true,
        timeoutMinutes: 30
      },
      failover: {
        enabled: false,
        primaryDatacenter: 'primary',
        secondaryDatacenter: 'secondary',
        automaticFailover: false,
        manualApprovalRequired: true,
        replicationLag: 60
      }
    },
    monitoring: {
      enabled: true,
      thresholds: {
        maxBackupDuration: 120,
        minSuccessRate: 95,
        maxFailedBackups: 3,
        diskSpaceWarning: 80,
        diskSpaceCritical: 95,
        healthCheckInterval: 60
      },
      alerts: {
        enabled: true,
        channels: [
          {
            type: 'webhook',
            name: 'default_webhook',
            enabled: true,
            config: {
              url: process.env.BACKUP_WEBHOOK_URL || 'http://localhost:3000/webhooks/backup',
              priority: 'normal'
            },
            filters: {}
          }
        ],
        escalation: {
          enabled: true,
          levels: [
            {
              level: 1,
              channels: ['default_webhook'],
              requireAcknowledgment: false,
              autoResolve: true,
              autoResolveTimeout: 60
            }
          ],
          timeouts: [15, 30, 60],
          maxEscalations: 3
        },
        rateLimit: {
          enabled: true,
          maxAlertsPerHour: 10,
          cooldownMinutes: 5
        }
      },
      metrics: {
        retentionDays: 30,
        aggregationIntervals: [5, 15, 60, 1440],
        exportEnabled: true,
        exportFormat: 'json',
        exportPath: '/app/backup-metrics'
      },
      dashboard: {
        enabled: true,
        refreshInterval: 30,
        historyDepth: 7
      }
    },
    dashboard: {
      enabled: true,
      port: 3030
    },
    integration: {
      autoStart: true,
      gracefulShutdownTimeout: 30,
      healthCheckEnabled: true,
      healthCheckInterval: 300
    }
  };

  // Слияние с пользовательской конфигурацией
  const config = mergeDeep(defaultConfig, customConfig || {});
  
  return new IntegratedBackupSystem(config);
}

/**
 * Глубокое слияние объектов
 */
function mergeDeep(target: any, source: any): any {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}