/**
 * System Initializer для comprehensive error handling и logging систем
 * 
 * Централизованная инициализация и настройка всех систем:
 * - Error Handler с типизированными ошибками
 * - Audit Logger с шифрованием и целостностью
 * - Performance Monitor с трейсингом
 * - Alert Manager с множественными каналами
 * - Enhanced Logger с контекстом операций
 */

import winston from 'winston';
import { 
  ErrorHandler, 
  initializeErrorHandler
} from './errors/ErrorHandler';

import {
  AuditLogger,
  initializeAuditLogger,
  AuditConfig
} from './logging/AuditLogger';

import PerformanceMonitor, {
  PerformanceConfig
} from './monitoring/PerformanceMonitor';

import {
  AlertManager,
  initializeAlertManager,
  AlertChannel,
  AlertSeverity,
  AlertRule
} from './alerts/AlertManager';

import {
  initializeLoggingSystems,
  enhancedMixerLogger,
  enhancedDbLogger,
  enhancedApiLogger,
  enhancedSecurityLogger,
  enhancedBlockchainLogger,
  enhancedSchedulerLogger,
  enhancedWalletLogger
} from './logger';

import { ErrorSeverity, ErrorCode, SystemError } from './errors/ErrorTypes';

export interface SystemConfig {
  // Общие настройки
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Error Handler настройки
  errorHandler: {
    enabled: boolean;
    criticalErrorThreshold: number;
    errorRateThreshold: number;
    timeWindowMinutes: number;
  };
  
  // Audit Logger настройки
  auditLogger: Partial<AuditConfig>;
  
  // Performance Monitor настройки
  performanceMonitor: Partial<PerformanceConfig>;
  
  // Alert Manager настройки
  alertManager: {
    enabled: boolean;
    channels: {
      email?: {
        enabled: boolean;
        smtpHost: string;
        smtpPort: number;
        smtpUser: string;
        smtpPassword: string;
        recipients: string[];
      };
      slack?: {
        enabled: boolean;
        webhookUrl: string;
        channel: string;
      };
      webhook?: {
        enabled: boolean;
        url: string;
        headers?: Record<string, string>;
      };
    };
  };
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  components: {
    errorHandler: 'healthy' | 'degraded' | 'critical';
    auditLogger: 'healthy' | 'degraded' | 'critical';
    performanceMonitor: 'healthy' | 'degraded' | 'critical';
    alertManager: 'healthy' | 'degraded' | 'critical';
  };
  metrics: {
    totalErrors: number;
    criticalErrors: number;
    auditEvents: number;
    activeAlerts: number;
    systemPerformance: 'good' | 'warning' | 'critical';
  };
  lastCheck: Date;
}

/**
 * Централизованный инициализатор всех систем
 */
export class SystemInitializer {
  private config: SystemConfig;
  private logger: winston.Logger;
  private errorHandler?: ErrorHandler;
  private auditLogger?: AuditLogger;
  private performanceMonitor?: PerformanceMonitor;
  private alertManager?: AlertManager;
  private initialized = false;

  constructor(config: Partial<SystemConfig> = {}) {
    this.config = this.mergeWithDefaults(config);
    this.logger = this.createMainLogger();
  }

  /**
   * Инициализирует все системы
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('🔄 Системы уже инициализированы, пропускаем...');
      return;
    }

    this.logger.info('🚀 Начинаем инициализацию comprehensive систем...');
    
    try {
      // Этап 1: Инициализация базового логирования
      await this.initializeBaseLogging();
      
      // Этап 2: Инициализация Error Handler
      await this.initializeErrorHandler();
      
      // Этап 3: Инициализация Audit Logger
      await this.initializeAuditLogger();
      
      // Этап 4: Инициализация Performance Monitor
      await this.initializePerformanceMonitor();
      
      // Этап 5: Инициализация Alert Manager
      await this.initializeAlertManager();
      
      // Этап 6: Настройка интеграций между системами
      await this.setupSystemIntegrations();
      
      // Этап 7: Проверка здоровья систем
      await this.performHealthCheck();
      
      this.initialized = true;
      this.logger.info('✅ Все системы успешно инициализированы!');
      
    } catch (error) {
      this.logger.error('❌ Критическая ошибка при инициализации систем:', error);
      throw error;
    }
  }

  /**
   * Получает health статус всех систем
   */
  public async getSystemHealth(): Promise<SystemHealth> {
    if (!this.initialized) {
      throw new Error('Системы не инициализированы');
    }

    const health: SystemHealth = {
      overall: 'healthy',
      components: {
        errorHandler: 'healthy',
        auditLogger: 'healthy',
        performanceMonitor: 'healthy',
        alertManager: 'healthy'
      },
      metrics: {
        totalErrors: 0,
        criticalErrors: 0,
        auditEvents: 0,
        activeAlerts: 0,
        systemPerformance: 'good'
      },
      lastCheck: new Date()
    };

    try {
      // Проверяем Error Handler
      if (this.errorHandler) {
        const errorMetrics = this.errorHandler.getMetrics();
        health.metrics.totalErrors = errorMetrics.totalErrors;
        health.metrics.criticalErrors = errorMetrics.criticalErrorsCount;
        
        if (errorMetrics.criticalErrorsCount > 5) {
          health.components.errorHandler = 'critical';
        } else if (errorMetrics.totalErrors > 50) {
          health.components.errorHandler = 'degraded';
        }
      }

      // Проверяем Audit Logger
      if (this.auditLogger) {
        const auditMetrics = this.auditLogger.getMetrics();
        health.metrics.auditEvents = auditMetrics.totalEvents;
      }

      // Проверяем Performance Monitor
      if (this.performanceMonitor) {
        const lastSnapshot = this.performanceMonitor.getLastSnapshot();
        if (lastSnapshot) {
          // Determine health based on system metrics
          const cpuUsage = lastSnapshot.system.cpu.usage;
          const memoryUsage = lastSnapshot.system.memory.usage;
          
          if (cpuUsage > 90 || memoryUsage > 90) {
            health.components.performanceMonitor = 'critical';
            health.metrics.systemPerformance = 'critical';
          } else if (cpuUsage > 80 || memoryUsage > 80) {
            health.components.performanceMonitor = 'degraded';
            health.metrics.systemPerformance = 'warning';
          } else {
            health.metrics.systemPerformance = 'good';
          }
        }
      }

      // Проверяем Alert Manager
      if (this.alertManager) {
        const activeAlerts = this.alertManager.getActiveAlerts();
        health.metrics.activeAlerts = activeAlerts.length;
        
        const criticalAlerts = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL).length;
        if (criticalAlerts > 0) {
          health.components.alertManager = 'degraded';
        }
      }

      // Определяем общее состояние
      const componentStates = Object.values(health.components);
      if (componentStates.some(state => state === 'critical')) {
        health.overall = 'critical';
      } else if (componentStates.some(state => state === 'degraded')) {
        health.overall = 'degraded';
      }

    } catch (error) {
      this.logger.error('Ошибка при проверке health систем:', error);
      health.overall = 'critical';
    }

    return health;
  }

  /**
   * Graceful shutdown всех систем
   */
  public async shutdown(): Promise<void> {
    this.logger.info('🛑 Начинаем graceful shutdown систем...');
    
    try {
      // Останавливаем системы в обратном порядке инициализации
      if (this.alertManager) {
        this.logger.info('Останавливаем Alert Manager...');
        // AlertManager не требует explicit shutdown
      }

      if (this.performanceMonitor) {
        this.logger.info('Останавливаем Performance Monitor...');
        await this.performanceMonitor.stop();
      }

      if (this.auditLogger) {
        this.logger.info('Останавливаем Audit Logger...');
        // AuditLogger не требует explicit shutdown
      }

      if (this.errorHandler) {
        this.logger.info('Останавливаем Error Handler...');
        // ErrorHandler не требует explicit shutdown
      }

      this.initialized = false;
      this.logger.info('✅ Все системы успешно остановлены');
      
    } catch (error) {
      this.logger.error('❌ Ошибка при shutdown систем:', error);
      throw error;
    }
  }

  /**
   * Возвращает экземпляры всех систем
   */
  public getSystems(): {
    logger: winston.Logger;
    errorHandler: ErrorHandler;
    auditLogger: AuditLogger;
    performanceMonitor: PerformanceMonitor;
    alertManager: AlertManager;
  } {
    if (!this.initialized) {
      throw new Error('Системы не инициализированы');
    }

    return {
      logger: this.logger,
      errorHandler: this.errorHandler!,
      auditLogger: this.auditLogger!,
      performanceMonitor: this.performanceMonitor!,
      alertManager: this.alertManager!
    };
  }

  /**
   * Возвращает enhanced loggers для всех компонентов
   */
  public getLoggers() {
    return {
      mixer: enhancedMixerLogger,
      database: enhancedDbLogger,
      api: enhancedApiLogger,
      security: enhancedSecurityLogger,
      blockchain: enhancedBlockchainLogger,
      scheduler: enhancedSchedulerLogger,
      wallet: enhancedWalletLogger
    };
  }

  /**
   * Инициализирует базовое логирование
   */
  private async initializeBaseLogging(): Promise<void> {
    this.logger.info('📝 Инициализация enhanced logging систем...');
    
    try {
      initializeLoggingSystems();
      this.logger.info('✅ Enhanced logging системы инициализированы');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации logging систем:', error);
      throw error;
    }
  }

  /**
   * Инициализирует Error Handler
   */
  private async initializeErrorHandler(): Promise<void> {
    this.logger.info('🛠️ Инициализация Error Handler...');
    
    try {
      this.errorHandler = initializeErrorHandler(this.logger, {
        enabled: this.config.errorHandler.enabled,
        criticalErrorThreshold: this.config.errorHandler.criticalErrorThreshold,
        errorRateThreshold: this.config.errorHandler.errorRateThreshold,
        timeWindowMinutes: this.config.errorHandler.timeWindowMinutes
      });

      // Настраиваем слушатели событий
      this.errorHandler.on('error', (error) => {
        this.logger.warn('🔥 Error Handler обработал ошибку', { errorCode: error.code });
      });

      this.errorHandler.on('criticalError', (error) => {
        this.logger.error('🚨 Критическая ошибка!', { error: error.toLogObject() });
      });

      this.logger.info('✅ Error Handler инициализирован');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Error Handler:', error);
      throw error;
    }
  }

  /**
   * Инициализирует Audit Logger
   */
  private async initializeAuditLogger(): Promise<void> {
    this.logger.info('📋 Инициализация Audit Logger...');
    
    try {
      this.auditLogger = initializeAuditLogger(this.config.auditLogger);

      // Настраиваем слушатели событий
      this.auditLogger.on('auditEvent', (event) => {
        if (event.severity === 'critical' || event.severity === 'security') {
          this.logger.warn('📢 Важное audit событие', { eventType: event.eventType });
        }
      });

      this.auditLogger.on('criticalAuditEvent', (event) => {
        this.logger.error('🚨 Критическое audit событие!', { event });
      });

      this.logger.info('✅ Audit Logger инициализирован');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Audit Logger:', error);
      throw error;
    }
  }

  /**
   * Инициализирует Performance Monitor
   */
  private async initializePerformanceMonitor(): Promise<void> {
    this.logger.info('📊 Инициализация Performance Monitor...');
    
    try {
      this.performanceMonitor = new PerformanceMonitor(this.config.performanceMonitor);
      await this.performanceMonitor.start();

      // Настраиваем слушатели событий
      this.performanceMonitor.on('threshold_exceeded', (data) => {
        this.logger.warn('🐌 Превышен порог производительности', {
          type: data.type,
          value: data.value,
          threshold: data.threshold
        });
      });

      this.performanceMonitor.on('metrics_error', (error) => {
        this.logger.error('📊 Ошибка сбора метрик производительности!', { error });
      });

      this.logger.info('✅ Performance Monitor инициализирован');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Performance Monitor:', error);
      throw error;
    }
  }

  /**
   * Инициализирует Alert Manager
   */
  private async initializeAlertManager(): Promise<void> {
    this.logger.info('🚨 Инициализация Alert Manager...');
    
    try {
      this.alertManager = initializeAlertManager();

      // Настраиваем каналы уведомлений
      this.alertManager.configureChannel({
        channel: AlertChannel.CONSOLE,
        enabled: true,
        config: {}
      });

      if (this.config.alertManager.channels.email?.enabled) {
        this.alertManager.configureChannel({
          channel: AlertChannel.EMAIL,
          enabled: true,
          config: this.config.alertManager.channels.email
        });
      }

      if (this.config.alertManager.channels.slack?.enabled) {
        this.alertManager.configureChannel({
          channel: AlertChannel.SLACK,
          enabled: true,
          config: this.config.alertManager.channels.slack
        });
      }

      // Добавляем production-ready правила алертов
      this.setupProductionAlertRules();

      // Настраиваем слушатели событий
      this.alertManager.on('alertTriggered', (alert) => {
        this.logger.warn('🚨 Алерт активирован', { 
          alertId: alert.id, 
          severity: alert.severity,
          title: alert.title 
        });
      });

      this.alertManager.on('alertResolved', (alert) => {
        this.logger.info('✅ Алерт разрешен', { alertId: alert.id, title: alert.title });
      });

      this.logger.info('✅ Alert Manager инициализирован');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Alert Manager:', error);
      throw error;
    }
  }

  /**
   * Настраивает интеграции между системами
   */
  private async setupSystemIntegrations(): Promise<void> {
    this.logger.info('🔗 Настройка интеграций между системами...');
    
    try {
      // Интеграция Error Handler -> Alert Manager
      if (this.errorHandler && this.alertManager) {
        this.errorHandler.on('error', async (error) => {
          await this.alertManager!.processError(error, 'errorHandler');
        });

        this.errorHandler.on('criticalError', async (error) => {
          await this.alertManager!.processError(error, 'errorHandler');
        });
      }

      // Интеграция Performance Monitor -> Alert Manager
      if (this.performanceMonitor && this.alertManager) {
        this.performanceMonitor.on('threshold_exceeded', async (data) => {
          // Create a SystemError for alert processing
          const performanceError = new SystemError(
            `Performance threshold exceeded: ${data.type} (${data.value}% > ${data.threshold}%)`,
            ErrorCode.SYSTEM_OVERLOAD,
            {
              component: 'performanceMonitor',
              operation: 'threshold_check',
              additionalInfo: {
                type: data.type,
                value: data.value,
                threshold: data.threshold,
                timestamp: data.timestamp
              }
            }
          );
          await this.alertManager!.processError(performanceError, 'performanceMonitor');
        });
      }

      this.logger.info('✅ Интеграции настроены');
    } catch (error) {
      this.logger.error('❌ Ошибка настройки интеграций:', error);
      throw error;
    }
  }

  /**
   * Настраивает production-ready правила алертов
   */
  private setupProductionAlertRules(): void {
    if (!this.alertManager) return;

    const rules: AlertRule[] = [
      {
        id: 'critical_system_errors',
        name: 'Критические системные ошибки',
        description: 'Алерт для критических ошибок всех компонентов',
        enabled: true,
        conditions: {
          errorSeverity: [ErrorSeverity.CRITICAL]
        },
        alertSeverity: AlertSeverity.CRITICAL,
        channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL],
        cooldownMinutes: 5,
        maxAlertsPerHour: 20
      },
      {
        id: 'security_violations',
        name: 'Нарушения безопасности',
        description: 'Алерт для всех нарушений безопасности',
        enabled: true,
        conditions: {
          components: ['security', 'authentication', 'authorization', 'vault', 'hsm']
        },
        alertSeverity: AlertSeverity.EMERGENCY,
        channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL, AlertChannel.SLACK],
        cooldownMinutes: 0,
        maxAlertsPerHour: 100
      },
      {
        id: 'mixing_failures',
        name: 'Ошибки микширования',
        description: 'Алерт для критических ошибок процесса микширования',
        enabled: true,
        conditions: {
          components: ['mixer', 'pool', 'scheduler'],
          errorSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]
        },
        alertSeverity: AlertSeverity.CRITICAL,
        channels: [AlertChannel.CONSOLE, AlertChannel.EMAIL],
        cooldownMinutes: 10,
        maxAlertsPerHour: 15
      },
      {
        id: 'blockchain_issues',
        name: 'Проблемы с блокчейном',
        description: 'Алерт для проблем с блокчейн соединениями и транзакциями',
        enabled: true,
        conditions: {
          components: ['blockchain', 'wallet'],
          errorSeverity: [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]
        },
        alertSeverity: AlertSeverity.WARNING,
        channels: [AlertChannel.CONSOLE],
        cooldownMinutes: 15,
        maxAlertsPerHour: 10
      },
      {
        id: 'high_memory_usage',
        name: 'Высокое использование памяти',
        description: 'Алерт при превышении лимита памяти',
        enabled: true,
        conditions: {
          metricThresholds: [{
            metric: 'system.memory.usage',
            operator: 'gt',
            value: 85,
            duration: 60000
          }]
        },
        alertSeverity: AlertSeverity.WARNING,
        channels: [AlertChannel.CONSOLE],
        cooldownMinutes: 20,
        maxAlertsPerHour: 5
      },
      {
        id: 'event_loop_lag',
        name: 'Высокий lag event loop',
        description: 'Алерт при высоком lag event loop',
        enabled: true,
        conditions: {
          metricThresholds: [{
            metric: 'system.eventloop.lag',
            operator: 'gt',
            value: 100,
            duration: 30000
          }]
        },
        alertSeverity: AlertSeverity.WARNING,
        channels: [AlertChannel.CONSOLE],
        cooldownMinutes: 10,
        maxAlertsPerHour: 8
      }
    ];

    rules.forEach(rule => {
      this.alertManager!.addRule(rule);
    });

    this.logger.info(`✅ Добавлено ${rules.length} production правил алертов`);
  }

  /**
   * Выполняет проверку здоровья систем
   */
  private async performHealthCheck(): Promise<void> {
    this.logger.info('🔍 Выполнение health check систем...');
    
    try {
      const health = await this.getSystemHealth();
      
      this.logger.info('📊 Health check результаты:', {
        overall: health.overall,
        components: health.components,
        metrics: health.metrics
      });

      if (health.overall === 'critical') {
        this.logger.error('🚨 Обнаружены критические проблемы в системах!');
      } else if (health.overall === 'degraded') {
        this.logger.warn('⚠️ Некоторые системы работают с деградацией');
      } else {
        this.logger.info('✅ Все системы здоровы');
      }
      
    } catch (error) {
      this.logger.error('❌ Ошибка health check:', error);
    }
  }

  /**
   * Создает основной logger
   */
  private createMainLogger(): winston.Logger {
    return winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'crypto-mixer-system-initializer',
        environment: this.config.environment
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              let log = `${timestamp} [${level}] ${message}`;
              if (Object.keys(meta).length > 0) {
                log += ` ${JSON.stringify(meta)}`;
              }
              return log;
            })
          )
        })
      ]
    });
  }

  /**
   * Объединяет конфигурацию с дефолтными значениями
   */
  private mergeWithDefaults(config: Partial<SystemConfig>): SystemConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      environment: (process.env.NODE_ENV as any) || 'development',
      logLevel: process.env.LOG_LEVEL as any || (isProduction ? 'info' : 'debug'),
      
      errorHandler: {
        enabled: true,
        criticalErrorThreshold: isProduction ? 10 : 5,
        errorRateThreshold: isProduction ? 100 : 50,
        timeWindowMinutes: 15,
        ...config.errorHandler
      },
      
      auditLogger: {
        enabled: true,
        encryptLogs: isProduction,
        enableIntegrityCheck: true,
        retentionDays: isProduction ? 365 : 30,
        maxFileSize: '100mb',
        maxFiles: isProduction ? 100 : 10,
        enableCompression: isProduction,
        enableRemoteLogging: false,
        ...config.auditLogger
      },
      
      performanceMonitor: {
        enabled: true,
        collectInterval: 30,
        retentionPeriod: isProduction ? 3600 : 1800,
        prometheusEnabled: false,
        prometheusPort: 9090,
        alerting: {
          enabled: true,
          thresholds: {
            cpu: 80,
            memory: 85,
            disk: 90,
            responseTime: isProduction ? 2000 : 1000,
            errorRate: 5
          }
        },
        sampling: {
          enabled: isProduction,
          rate: isProduction ? 10 : 100
        },
        ...config.performanceMonitor
      },
      
      alertManager: {
        enabled: true,
        channels: {
          email: {
            enabled: false,
            smtpHost: '',
            smtpPort: 587,
            smtpUser: '',
            smtpPassword: '',
            recipients: []
          },
          slack: {
            enabled: false,
            webhookUrl: '',
            channel: '#alerts'
          },
          webhook: {
            enabled: false,
            url: ''
          }
        },
        ...config.alertManager
      }
    };
  }
}

/**
 * Глобальный экземпляр system initializer'а
 */
let globalSystemInitializer: SystemInitializer | null = null;

/**
 * Инициализирует все системы с конфигурацией
 */
export async function initializeAllSystems(config?: Partial<SystemConfig>): Promise<SystemInitializer> {
  globalSystemInitializer = new SystemInitializer(config);
  await globalSystemInitializer.initialize();
  return globalSystemInitializer;
}

/**
 * Получает глобальный system initializer
 */
export function getSystemInitializer(): SystemInitializer {
  if (!globalSystemInitializer) {
    throw new Error('Systems не инициализированы. Вызовите initializeAllSystems() сначала.');
  }
  return globalSystemInitializer;
}

/**
 * Graceful shutdown всех систем
 */
export async function shutdownAllSystems(): Promise<void> {
  if (globalSystemInitializer) {
    await globalSystemInitializer.shutdown();
    globalSystemInitializer = null;
  }
}

