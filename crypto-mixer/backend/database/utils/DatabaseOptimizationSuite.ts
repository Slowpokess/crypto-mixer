/**
 * Комплексный набор оптимизаций базы данных
 * 
 * Объединяет все компоненты оптимизации:
 * - Connection Pool Management
 * - Query Optimization
 * - Data Recovery & Integrity
 * - Performance Monitoring
 * - Automated Maintenance
 */

import { Sequelize } from 'sequelize';
import { ConnectionPoolManager, ConnectionPoolConfig } from './ConnectionPoolManager';
import { OptimizedQueryBuilder } from './OptimizedQueryBuilder';
import { RedisOptimizedQueryBuilder } from './RedisOptimizedQueryBuilder';
import RedisMasterManager from '../cache/RedisMasterManager';
import { DataRecoveryManager, RecoveryOptions } from './DataRecoveryManager';
import { BackupManager } from './BackupManager';
import { PerformanceMonitor } from '../../utils/monitoring/PerformanceMonitor';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';

export interface DatabaseOptimizationConfig {
  // Connection Pool настройки
  connectionPool: Partial<ConnectionPoolConfig>;
  
  // Recovery настройки
  recovery: Partial<RecoveryOptions>;
  
  // Redis Cache настройки
  enableRedisCache: boolean;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    enableCluster?: boolean;
    enableHealthChecks?: boolean;
    enablePerformanceTracking?: boolean;
    enableRateLimiting?: boolean;
    enableAntiSpam?: boolean;
  };
  
  // Performance monitoring
  enablePerformanceMonitoring: boolean;
  performanceThresholds: {
    slowQueryThreshold: number;
    highUtilizationThreshold: number;
    maxConnectionWaitTime: number;
  };
  
  // Automated maintenance
  enableAutomatedMaintenance: boolean;
  maintenanceSchedule: {
    integrityCheckHour: number; // 0-23
    performanceAnalysisHour: number;
    cleanupHour: number;
  };
  
  // Alerting
  enableAlerting: boolean;
  alertThresholds: {
    criticalIssuesCount: number;
    failedQueriesPercent: number;
    poolUtilizationPercent: number;
  };
}

export interface SystemHealthStatus {
  overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  components: {
    connectionPool: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    dataIntegrity: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    performance: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    recovery: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    redisCache?: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  lastCheck: Date;
  details: any;
}

/**
 * Комплексная система оптимизации базы данных
 */
export class DatabaseOptimizationSuite extends EventEmitter {
  private sequelize!: Sequelize; // Инициализируется в initializeSystem
  private config: DatabaseOptimizationConfig;
  
  // Компоненты системы
  private connectionPoolManager!: ConnectionPoolManager; // Инициализируется в initializeSystem
  private queryBuilder!: OptimizedQueryBuilder; // Инициализируется в initializeSystem
  private redisQueryBuilder?: RedisOptimizedQueryBuilder;
  private redisMaster?: RedisMasterManager;
  private recoveryManager!: DataRecoveryManager; // Инициализируется в initializeSystem
  private backupManager!: BackupManager; // Инициализируется в initializeSystem
  private performanceMonitor?: PerformanceMonitor;
  
  // Статус и мониторинг
  private healthStatus: SystemHealthStatus;
  private maintenanceTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(
    databaseUrl: string,
    config: Partial<DatabaseOptimizationConfig> = {}
  ) {
    super();
    
    this.config = {
      connectionPool: {
        minConnections: 5,
        maxConnections: 20,
        adaptivePooling: true,
        enableReadReplicas: false,
        warmupConnections: true
      },
      recovery: {
        enableIntegrityChecks: true,
        enableAutoRecovery: true,
        enableContinuousMonitoring: true,
        createRecoveryBackups: true
      },
      enableRedisCache: false,
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
        enableCluster: false,
        enableHealthChecks: true,
        enablePerformanceTracking: true,
        enableRateLimiting: true,
        enableAntiSpam: true
      },
      enablePerformanceMonitoring: true,
      performanceThresholds: {
        slowQueryThreshold: 1000,
        highUtilizationThreshold: 80,
        maxConnectionWaitTime: 5000
      },
      enableAutomatedMaintenance: true,
      maintenanceSchedule: {
        integrityCheckHour: 2, // 2 AM
        performanceAnalysisHour: 3, // 3 AM
        cleanupHour: 4 // 4 AM
      },
      enableAlerting: true,
      alertThresholds: {
        criticalIssuesCount: 5,
        failedQueriesPercent: 5,
        poolUtilizationPercent: 90
      },
      ...config
    };

    this.healthStatus = {
      overall: 'HEALTHY',
      components: {
        connectionPool: 'HEALTHY',
        dataIntegrity: 'HEALTHY',
        performance: 'HEALTHY',
        recovery: 'HEALTHY',
        redisCache: this.config.enableRedisCache ? 'HEALTHY' : undefined
      },
      lastCheck: new Date(),
      details: {}
    };

    this.initializeSystem(databaseUrl);
  }

  /**
   * Инициализация всей системы оптимизации
   */
  private async initializeSystem(databaseUrl: string): Promise<void> {
    try {
      enhancedDbLogger.info('🚀 Инициализация DatabaseOptimizationSuite');

      // 1. Инициализируем Connection Pool Manager
      this.connectionPoolManager = new ConnectionPoolManager(
        databaseUrl,
        this.config.connectionPool
      );

      // Получаем основной Sequelize инстанс
      this.sequelize = this.connectionPoolManager.getMasterPool();

      // 2. Инициализируем Performance Monitor
      if (this.config.enablePerformanceMonitoring) {
        this.performanceMonitor = new PerformanceMonitor();
      }

      // 3. Инициализируем Query Builder
      this.queryBuilder = new OptimizedQueryBuilder(
        this.sequelize,
        this.performanceMonitor
      );

      // 3.5. Инициализируем Redis (опционально)
      if (this.config.enableRedisCache) {
        await this.initializeRedisCache();
      }

      // 4. Инициализируем Backup Manager
      this.backupManager = new BackupManager(this.sequelize);

      // 5. Инициализируем Recovery Manager
      this.recoveryManager = new DataRecoveryManager(
        this.sequelize,
        this.backupManager,
        this.config.recovery
      );

      // 6. Настраиваем event listeners
      this.setupEventListeners();

      // 7. Запускаем automated maintenance
      if (this.config.enableAutomatedMaintenance) {
        this.startAutomatedMaintenance();
      }

      // 8. Запускаем health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      
      enhancedDbLogger.info('✅ DatabaseOptimizationSuite успешно инициализирован');
      this.emit('initialized');

      // Первоначальная проверка здоровья системы
      await this.performHealthCheck();

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации DatabaseOptimizationSuite', { error });
      throw error;
    }
  }

  /**
   * Инициализация Redis кэширования
   */
  private async initializeRedisCache(): Promise<void> {
    try {
      enhancedDbLogger.info('🔄 Инициализация Redis кэширования...');

      // Создаем RedisMasterManager
      this.redisMaster = new RedisMasterManager({
        connection: {
          host: this.config.redis?.host || 'localhost',
          port: this.config.redis?.port || 6379,
          password: this.config.redis?.password,
          db: this.config.redis?.db || 0,
          keyPrefix: this.config.redis?.keyPrefix || 'mixer:',
          enableCluster: this.config.redis?.enableCluster || false,
          enableReadWriteSplit: false
        },
        cache: {
          defaultTTL: 3600,
          enableCompression: true,
          enableMultiLevel: true,
          enableBatching: true
        },
        monitoring: {
          enableHealthChecks: this.config.redis?.enableHealthChecks || true,
          healthCheckInterval: 30000,
          enablePerformanceTracking: this.config.redis?.enablePerformanceTracking || true,
          enableAnalytics: true
        },
        security: {
          enableRateLimiting: this.config.redis?.enableRateLimiting || true,
          enableAntiSpam: this.config.redis?.enableAntiSpam || true,
          enableDistributedLocking: true
        }
      });

      // Инициализируем Redis
      await this.redisMaster.initialize();

      // Создаем Redis-powered Query Builder
      this.redisQueryBuilder = new RedisOptimizedQueryBuilder(
        this.sequelize,
        this.redisMaster.getCacheLayer(),
        this.performanceMonitor
      );

      // Настраиваем Redis event listeners
      this.setupRedisEventListeners();

      enhancedDbLogger.info('✅ Redis кэширование инициализировано');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации Redis кэширования', { error });
      this.healthStatus.components.redisCache = 'CRITICAL';
      // Не выбрасываем ошибку - Redis опциональный
    }
  }

  /**
   * Настройка обработчиков событий Redis
   */
  private setupRedisEventListeners(): void {
    if (!this.redisMaster) return;

    this.redisMaster.on('redis_connected', () => {
      enhancedDbLogger.info('✅ Redis подключение восстановлено');
      if (this.healthStatus.components.redisCache) {
        this.healthStatus.components.redisCache = 'HEALTHY';
      }
    });

    this.redisMaster.on('redis_connection_error', (error) => {
      enhancedDbLogger.error('❌ Redis connection error', { error });
      if (this.healthStatus.components.redisCache) {
        this.healthStatus.components.redisCache = 'CRITICAL';
      }
      this.emit('redis_connection_error', error);
    });

    this.redisMaster.on('system_warning', (health) => {
      enhancedDbLogger.warn('⚠️ Redis system warning', health);
      if (this.healthStatus.components.redisCache) {
        this.healthStatus.components.redisCache = 'WARNING';
      }
    });

    this.redisMaster.on('system_critical', (health) => {
      enhancedDbLogger.error('🚨 Redis system critical', health);
      if (this.healthStatus.components.redisCache) {
        this.healthStatus.components.redisCache = 'CRITICAL';
      }
      this.emit('redis_system_critical', health);
    });

    this.redisMaster.on('security_alert', (data) => {
      enhancedDbLogger.warn('🚫 Redis security alert', data);
      this.emit('redis_security_alert', data);
    });
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    // Connection Pool events
    this.connectionPoolManager.on('pool_unhealthy', (data) => {
      enhancedDbLogger.warn('⚠️ Unhealthy connection pool detected', data);
      this.healthStatus.components.connectionPool = 'WARNING';
      this.emit('connection_pool_warning', data);
    });

    this.connectionPoolManager.on('pool_resize_requested', (data) => {
      enhancedDbLogger.info('📏 Connection pool resize requested', data);
    });

    // Recovery Manager events
    this.recoveryManager.on('integrity_check_completed', (report) => {
      const criticalIssues = report.issues.filter((i: any) => i.severity === 'CRITICAL').length;
      
      if (criticalIssues > this.config.alertThresholds.criticalIssuesCount) {
        this.healthStatus.components.dataIntegrity = 'CRITICAL';
        this.emit('critical_data_integrity_issues', { criticalIssues, report });
      } else if (report.issues.length > 0) {
        this.healthStatus.components.dataIntegrity = 'WARNING';
      } else {
        this.healthStatus.components.dataIntegrity = 'HEALTHY';
      }
    });

    this.recoveryManager.on('auto_recovery_completed', (data) => {
      enhancedDbLogger.info('🔧 Auto recovery completed', data);
    });

    this.recoveryManager.on('health_check_warning', (data) => {
      enhancedDbLogger.warn('⚠️ Health check warning', data);
      this.healthStatus.components.recovery = 'WARNING';
    });
  }

  /**
   * Запуск автоматизированного обслуживания
   */
  private startAutomatedMaintenance(): void {
    // Проверяем каждый час, нужно ли выполнить scheduled задачи
    this.maintenanceTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      const currentHour = new Date().getHours();
      const { integrityCheckHour, performanceAnalysisHour, cleanupHour } = this.config.maintenanceSchedule;

      try {
        if (currentHour === integrityCheckHour) {
          await this.performScheduledIntegrityCheck();
        } else if (currentHour === performanceAnalysisHour) {
          await this.performScheduledPerformanceAnalysis();
        } else if (currentHour === cleanupHour) {
          await this.performScheduledCleanup();
        }
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка scheduled maintenance', { error, currentHour });
      }
    }, 3600000); // Каждый час

    enhancedDbLogger.info('🕐 Automated maintenance запущен', {
      schedule: this.config.maintenanceSchedule
    });
  }

  /**
   * Запуск мониторинга здоровья системы
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performHealthCheck();
      }
    }, 300000); // Каждые 5 минут

    enhancedDbLogger.info('💓 Health monitoring запущен');
  }

  /**
   * Комплексная проверка здоровья системы
   */
  public async performHealthCheck(): Promise<SystemHealthStatus> {
    try {
      enhancedDbLogger.info('🏥 Выполняем комплексную проверку здоровья системы');

      // 1. Проверяем connection pool
      const poolStats = await this.connectionPoolManager.getPoolStats();
      const poolHealth = this.connectionPoolManager.getHealthStatus();

      if (poolStats.poolUtilization > this.config.alertThresholds.poolUtilizationPercent) {
        this.healthStatus.components.connectionPool = 'CRITICAL';
      } else if (poolStats.poolUtilization > this.config.performanceThresholds.highUtilizationThreshold) {
        this.healthStatus.components.connectionPool = 'WARNING';
      } else {
        this.healthStatus.components.connectionPool = 'HEALTHY';
      }

      // 2. Проверяем производительность запросов
      if (this.performanceMonitor) {
        const perfStats = await this.queryBuilder.getDatabasePerformanceStats();
        
        if (perfStats.avgQueryTime > this.config.performanceThresholds.slowQueryThreshold * 2) {
          this.healthStatus.components.performance = 'CRITICAL';
        } else if (perfStats.avgQueryTime > this.config.performanceThresholds.slowQueryThreshold) {
          this.healthStatus.components.performance = 'WARNING';
        } else {
          this.healthStatus.components.performance = 'HEALTHY';
        }
      }

      // 2.5. Проверяем Redis (если включен)
      if (this.config.enableRedisCache && this.redisMaster) {
        try {
          const redisHealth = await this.redisMaster.performHealthCheck();
          this.healthStatus.components.redisCache = redisHealth.overall;
          
          // Добавляем Redis метрики в детали
          this.healthStatus.details.redisHealth = redisHealth;
        } catch (error) {
          enhancedDbLogger.error('❌ Ошибка проверки Redis здоровья', { error });
          if (this.healthStatus.components.redisCache) {
            this.healthStatus.components.redisCache = 'CRITICAL';
          }
        }
      }

      // 3. Определяем общий статус здоровья
      const componentStatuses = Object.values(this.healthStatus.components);
      
      if (componentStatuses.includes('CRITICAL')) {
        this.healthStatus.overall = 'CRITICAL';
      } else if (componentStatuses.includes('WARNING')) {
        this.healthStatus.overall = 'WARNING';
      } else {
        this.healthStatus.overall = 'HEALTHY';
      }

      this.healthStatus.lastCheck = new Date();
      this.healthStatus.details = {
        poolStats,
        poolHealth: Array.from(poolHealth.entries()),
        timestamp: new Date()
      };

      // Эмитим события в зависимости от статуса
      if (this.healthStatus.overall === 'CRITICAL') {
        this.emit('system_critical', this.healthStatus);
      } else if (this.healthStatus.overall === 'WARNING') {
        this.emit('system_warning', this.healthStatus);
      }

      enhancedDbLogger.info('✅ Health check завершен', {
        overall: this.healthStatus.overall,
        components: this.healthStatus.components
      });

      return { ...this.healthStatus };

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка health check', { error });
      this.healthStatus.overall = 'CRITICAL';
      this.healthStatus.lastCheck = new Date();
      throw error;
    }
  }

  /**
   * Scheduled проверка целостности данных
   */
  private async performScheduledIntegrityCheck(): Promise<void> {
    enhancedDbLogger.info('🔍 Выполняем scheduled integrity check');
    
    try {
      const report = await this.recoveryManager.performIntegrityCheck();
      
      enhancedDbLogger.info('✅ Scheduled integrity check завершен', {
        totalIssues: report.issues.length,
        criticalIssues: report.issues.filter(i => i.severity === 'CRITICAL').length
      });

      this.emit('scheduled_integrity_check_completed', report);
      
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка scheduled integrity check', { error });
    }
  }

  /**
   * Scheduled анализ производительности
   */
  private async performScheduledPerformanceAnalysis(): Promise<void> {
    enhancedDbLogger.info('📊 Выполняем scheduled performance analysis');
    
    try {
      const poolStats = await this.connectionPoolManager.getPoolStats();
      const queryStats = this.queryBuilder.getQueryStats();
      const cacheStats = this.queryBuilder.getCacheStats();

      const analysis = {
        poolStats,
        queryStats: {
          totalQueries: queryStats.size,
          avgQueryTime: Array.from(queryStats.values())
            .reduce((sum, stat) => sum + stat.queryTime, 0) / queryStats.size || 0
        },
        cacheStats,
        timestamp: new Date()
      };

      enhancedDbLogger.info('✅ Performance analysis завершен', analysis);
      this.emit('scheduled_performance_analysis_completed', analysis);
      
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка performance analysis', { error });
    }
  }

  /**
   * Scheduled очистка и оптимизация
   */
  private async performScheduledCleanup(): Promise<void> {
    enhancedDbLogger.info('🧹 Выполняем scheduled cleanup');
    
    try {
      // Очищаем старые query stats
      this.queryBuilder.clearQueryStats();
      
      // Частично очищаем cache
      this.queryBuilder.invalidateCache('old_');
      
      // Создаем backup перед очисткой если нужно
      if (this.config.recovery.createRecoveryBackups) {
        await this.backupManager.createFullBackup('scheduled_cleanup_' + Date.now());
      }

      enhancedDbLogger.info('✅ Scheduled cleanup завершен');
      this.emit('scheduled_cleanup_completed');
      
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка scheduled cleanup', { error });
    }
  }

  /**
   * Получение оптимизированных репозиториев
   */
  public getOptimizedRepositories() {
    if (!this.isInitialized) {
      throw new Error('DatabaseOptimizationSuite не инициализирован');
    }

    // Импортируем оптимизированные репозитории
    const { OptimizedMixRequestRepository } = require('../repositories/OptimizedMixRequestRepository');
    const { OptimizedWalletRepository } = require('../repositories/OptimizedWalletRepository');
    
    // Импортируем модели
    const { MixRequest } = require('../models/MixRequest');
    const { Wallet } = require('../models/Wallet');

    return {
      MixRequestRepository: new OptimizedMixRequestRepository(MixRequest, this.queryBuilder),
      WalletRepository: new OptimizedWalletRepository(Wallet, this.queryBuilder)
    };
  }

  /**
   * Получение Redis-оптимизированных репозиториев
   */
  public getRedisOptimizedRepositories() {
    if (!this.isInitialized) {
      throw new Error('DatabaseOptimizationSuite не инициализирован');
    }

    if (!this.config.enableRedisCache || !this.redisQueryBuilder) {
      // Возвращаем обычные оптимизированные репозитории если Redis не включен
      return this.getOptimizedRepositories();
    }

    // Импортируем оптимизированные репозитории
    const { OptimizedMixRequestRepository } = require('../repositories/OptimizedMixRequestRepository');
    const { OptimizedWalletRepository } = require('../repositories/OptimizedWalletRepository');
    
    // Импортируем модели
    const { MixRequest } = require('../models/MixRequest');
    const { Wallet } = require('../models/Wallet');

    return {
      MixRequestRepository: new OptimizedMixRequestRepository(MixRequest, this.redisQueryBuilder),
      WalletRepository: new OptimizedWalletRepository(Wallet, this.redisQueryBuilder)
    };
  }

  /**
   * Получение Redis компонентов
   */
  public getRedisComponents() {
    if (!this.config.enableRedisCache) {
      return null;
    }

    return {
      redisMaster: this.redisMaster,
      cacheLayer: this.redisMaster?.getCacheLayer(),
      criticalDataManager: this.redisMaster?.getCriticalDataManager(),
      sessionManager: this.redisMaster?.getSessionManager(),
      redisQueryBuilder: this.redisQueryBuilder
    };
  }

  /**
   * Получение оптимизированного Sequelize инстанса
   */
  public getSequelize(isReadOnly: boolean = false): Sequelize {
    return this.connectionPoolManager.getPool(isReadOnly);
  }

  /**
   * Получение query builder
   */
  public getQueryBuilder(): OptimizedQueryBuilder {
    return this.queryBuilder;
  }

  /**
   * Получение recovery manager
   */
  public getRecoveryManager(): DataRecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Получение статуса здоровья системы
   */
  public getHealthStatus(): SystemHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Ручной trigger integrity check
   */
  public async triggerIntegrityCheck(): Promise<void> {
    enhancedDbLogger.info('🔍 Manual integrity check triggered');
    await this.recoveryManager.performIntegrityCheck();
  }

  /**
   * Ручной trigger performance analysis
   */
  public async triggerPerformanceAnalysis(): Promise<any> {
    enhancedDbLogger.info('📊 Manual performance analysis triggered');
    
    const poolStats = await this.connectionPoolManager.getPoolStats();
    const dbStats = await this.queryBuilder.getDatabasePerformanceStats();
    const cacheStats = this.queryBuilder.getCacheStats();
    
    return {
      poolStats,
      databaseStats: dbStats,
      cacheStats,
      timestamp: new Date()
    };
  }

  /**
   * Graceful shutdown всей системы
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    enhancedDbLogger.info('🔄 Начинаем graceful shutdown DatabaseOptimizationSuite');

    try {
      // Останавливаем таймеры
      if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
      if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);

      // Завершаем компоненты в правильном порядке
      const shutdownPromises = [];

      if (this.recoveryManager) {
        shutdownPromises.push(this.recoveryManager.shutdown());
      }

      if (this.redisMaster) {
        shutdownPromises.push(this.redisMaster.shutdown());
      }

      if (this.connectionPoolManager) {
        shutdownPromises.push(this.connectionPoolManager.shutdown());
      }

      await Promise.all(shutdownPromises);
      
      enhancedDbLogger.info('✅ DatabaseOptimizationSuite успешно завершен');
      this.emit('shutdown_completed');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка при shutdown DatabaseOptimizationSuite', { error });
      throw error;
    }
  }
}

export default DatabaseOptimizationSuite;