import { Sequelize } from 'sequelize';
import { DatabaseManager } from './DatabaseManager';
import { initializeModels, initializeSystemData } from './models';
import { initializeRepositories, RepositoryContainer } from './repositories';
import { MigrationManager } from './migrations/MigrationManager';
import { BackupManager } from './utils/BackupManager';
import { DatabaseMonitoring } from './utils/DatabaseMonitoring';
import DatabaseOptimizationSuite from './utils/DatabaseOptimizationSuite';

/**
 * Главная точка входа для всей системы базы данных
 * Предоставляет единый интерфейс для инициализации и управления
 */
export class DatabaseSystem {
  private dbManager: DatabaseManager;
  private sequelize: Sequelize;
  private models: any;
  private repositories!: RepositoryContainer; // Инициализируется позже через initialize()
  private migrationManager: MigrationManager;
  private backupManager: BackupManager;
  private monitoring: DatabaseMonitoring;
  private optimizationSuite?: DatabaseOptimizationSuite; // НОВЫЙ: Комплексная система оптимизации
  private isInitialized: boolean = false;
  private useOptimizations: boolean = true; // По умолчанию включаем оптимизации

  constructor(config?: any) {
    this.dbManager = new DatabaseManager(config);
    this.sequelize = this.dbManager.getSequelize();
    
    // Проверяем, нужно ли использовать оптимизации
    this.useOptimizations = config?.enableOptimizations !== false;
    
    // Инициализируем компоненты
    this.migrationManager = new MigrationManager(this.sequelize);
    this.backupManager = new BackupManager(this.sequelize);
    this.monitoring = new DatabaseMonitoring(this.sequelize);
  }

  /**
   * Полная инициализация системы
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Database system already initialized');
      return;
    }

    try {
      console.log('🔄 Initializing database system...');

      // 1. Подключение к базе данных
      await this.dbManager.connect();
      console.log('✅ Database connection established');

      // 2. Запуск миграций
      await this.migrationManager.up();
      console.log('✅ Database migrations completed');

      // 3. Инициализация моделей
      this.models = initializeModels(this.sequelize);
      console.log('✅ Database models initialized');

      // 4. Инициализация системных данных
      await initializeSystemData();
      console.log('✅ System data initialized');

      // 5. Инициализация оптимизированной системы (если включена)
      if (this.useOptimizations) {
        console.log('🚀 Initializing optimization suite...');
        this.optimizationSuite = new DatabaseOptimizationSuite(process.env.DATABASE_URL!, {
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
          enableRedisCache: process.env.ENABLE_REDIS_CACHE === 'true',
          redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
            enableCluster: process.env.REDIS_ENABLE_CLUSTER === 'true',
            enableHealthChecks: true,
            enablePerformanceTracking: true,
            enableRateLimiting: true,
            enableAntiSpam: true
          },
          enablePerformanceMonitoring: true,
          enableAutomatedMaintenance: true,
          enableAlerting: true
        });

        // Ждем инициализации оптимизационной системы
        await new Promise<void>((resolve) => {
          this.optimizationSuite!.once('initialized', resolve);
        });

        // Получаем оптимизированные репозитории (с Redis если включен)
        const optimizedRepos = process.env.ENABLE_REDIS_CACHE === 'true' 
          ? this.optimizationSuite.getRedisOptimizedRepositories()
          : this.optimizationSuite.getOptimizedRepositories();
          
        // Создаем базовый контейнер репозиториев
        const baseRepositories = initializeRepositories(this.models);
        
        // Объединяем с оптимизированными репозиториями, сохраняя методы класса
        Object.assign(baseRepositories, optimizedRepos);
        this.repositories = baseRepositories;
        console.log('✅ Optimization suite initialized');
        console.log('✅ Optimized repositories initialized');
      } else {
        // 5. Инициализация обычных репозиториев
        this.repositories = initializeRepositories(this.models);
        console.log('✅ Standard repositories initialized');
      }

      // 6. Запуск мониторинга
      this.monitoring.start();
      console.log('✅ Database monitoring started');

      // 7. Настройка автоматических бэкапов
      this.setupAutomaticBackups();
      console.log('✅ Backup system configured');

      this.isInitialized = true;
      console.log('🎉 Database system fully initialized!');

    } catch (error) {
      console.error('❌ Database system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Настройка автоматических бэкапов
   */
  private setupAutomaticBackups(): void {
    // Полные бэкапы каждый день в 2:00
    // Инкрементальные бэкапы каждые 6 часов
    this.backupManager.scheduleBackups({
      full: '0 2 * * *',      // Ежедневно в 2:00
      incremental: '0 */6 * * *'  // Каждые 6 часов
    });
  }

  /**
   * Корректное завершение работы
   */
  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down database system...');

    try {
      // Останавливаем оптимизационную систему если она была инициализирована
      if (this.optimizationSuite) {
        await this.optimizationSuite.shutdown();
        console.log('✅ Optimization suite stopped');
      }

      // Останавливаем мониторинг
      this.monitoring.stop();
      console.log('✅ Monitoring stopped');

      // Останавливаем запланированные бэкапы
      this.backupManager.stopScheduledBackups();
      console.log('✅ Scheduled backups stopped');

      // Закрываем соединение с БД
      await this.dbManager.disconnect();
      console.log('✅ Database connection closed');

      this.isInitialized = false;
      console.log('✅ Database system shutdown completed');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Получение компонентов системы
   */
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  getSequelize(): Sequelize {
    return this.sequelize;
  }

  getModels(): any {
    this.ensureInitialized();
    return this.models;
  }

  getRepositories(): RepositoryContainer {
    this.ensureInitialized();
    return this.repositories;
  }

  getMigrationManager(): MigrationManager {
    return this.migrationManager;
  }

  getBackupManager(): BackupManager {
    return this.backupManager;
  }

  getMonitoring(): DatabaseMonitoring {
    return this.monitoring;
  }

  /**
   * НОВЫЙ: Получение оптимизационной системы
   */
  getOptimizationSuite(): DatabaseOptimizationSuite | undefined {
    return this.optimizationSuite;
  }

  /**
   * НОВЫЙ: Получение Redis компонентов
   */
  getRedisComponents() {
    return this.optimizationSuite?.getRedisComponents() || null;
  }

  /**
   * НОВЫЙ: Проверка, включены ли оптимизации
   */
  isOptimizationsEnabled(): boolean {
    return this.useOptimizations && !!this.optimizationSuite;
  }

  /**
   * НОВЫЙ: Проверка, включен ли Redis кэш
   */
  isRedisCacheEnabled(): boolean {
    return process.env.ENABLE_REDIS_CACHE === 'true' && !!this.optimizationSuite?.getRedisComponents();
  }

  /**
   * Проверка состояния системы
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    components: Record<string, any>;
    timestamp: Date;
  }> {
    const timestamp = new Date();
    const components: Record<string, any> = {};

    try {
      // Проверка соединения с БД
      components.database = await this.dbManager.getHealthStatus();

      // Проверка мониторинга
      components.monitoring = this.monitoring.getHealthReport();

      // НОВЫЙ: Проверка оптимизационной системы
      if (this.optimizationSuite) {
        components.optimization = this.optimizationSuite.getHealthStatus();
      }

      // Проверка бэкапов
      const backups = this.backupManager.listBackups();
      components.backup = {
        lastBackup: backups.length > 0 ? backups[0].timestamp : null,
        totalBackups: backups.length
      };

      // Определяем общий статус
      let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      
      if (components.database.status !== 'healthy' || 
          components.monitoring.status === 'critical' ||
          (components.optimization && components.optimization.overall === 'CRITICAL')) {
        overallStatus = 'critical';
      } else if (components.monitoring.status === 'warning' ||
                 (components.optimization && components.optimization.overall === 'WARNING') ||
                 !components.backup.lastBackup ||
                 Date.now() - new Date(components.backup.lastBackup).getTime() > 48 * 60 * 60 * 1000) {
        overallStatus = 'warning';
      }

      return {
        status: overallStatus,
        components,
        timestamp
      };

    } catch (error) {
      return {
        status: 'critical',
        components: { error: error instanceof Error ? error.message : String(error) },
        timestamp
      };
    }
  }

  /**
   * Проверка инициализации
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Database system not initialized. Call initialize() first.');
    }
  }

  /**
   * Статический метод для быстрой инициализации
   */
  static async create(config?: any): Promise<DatabaseSystem> {
    const system = new DatabaseSystem(config);
    await system.initialize();
    return system;
  }
}

// Экспорты для удобства использования
export { DatabaseManager } from './DatabaseManager';
export { MigrationManager } from './migrations/MigrationManager';
export { BackupManager } from './utils/BackupManager';
export { DatabaseMonitoring } from './utils/DatabaseMonitoring';
export { initializeRepositories, RepositoryContainer } from './repositories';
export { initializeModels } from './models';

// НОВЫЕ ЭКСПОРТЫ: Компоненты оптимизации
export { default as DatabaseOptimizationSuite } from './utils/DatabaseOptimizationSuite';
export { ConnectionPoolManager } from './utils/ConnectionPoolManager';
export { OptimizedQueryBuilder } from './utils/OptimizedQueryBuilder';
export { RedisOptimizedQueryBuilder } from './utils/RedisOptimizedQueryBuilder';
export { DataRecoveryManager } from './utils/DataRecoveryManager';
export { OptimizedMixRequestRepository } from './repositories/OptimizedMixRequestRepository';
export { OptimizedWalletRepository } from './repositories/OptimizedWalletRepository';

// НОВЫЕ ЭКСПОРТЫ: Redis компоненты
export { default as RedisMasterManager } from './cache/RedisMasterManager';
export { RedisConnectionManager } from './cache/RedisConnectionManager';
export { RedisCacheLayer } from './cache/RedisCacheLayer';
export { CriticalDataCacheManager } from './cache/CriticalDataCacheManager';
export { RedisSessionManager } from './cache/RedisSessionManager';

// Экспорт типов
export * from './types';

// Экспорт валидаторов
export { default as validators } from './validators';

// Экспорт тестовой системы
export { DatabaseTestSuite } from './test-initialization';

/**
 * Глобальный экземпляр для использования в приложении
 */
let globalDatabaseSystem: DatabaseSystem | null = null;

/**
 * Получение глобального экземпляра системы БД
 */
export function getGlobalDatabaseSystem(): DatabaseSystem {
  if (!globalDatabaseSystem) {
    throw new Error('Global database system not initialized. Call initializeGlobalDatabase() first.');
  }
  return globalDatabaseSystem;
}

/**
 * Инициализация глобального экземпляра
 */
export async function initializeGlobalDatabase(config?: any): Promise<DatabaseSystem> {
  if (globalDatabaseSystem) {
    console.log('⚠️ Global database system already initialized');
    return globalDatabaseSystem;
  }

  globalDatabaseSystem = await DatabaseSystem.create(config);
  return globalDatabaseSystem;
}

/**
 * Завершение работы глобального экземпляра
 */
export async function shutdownGlobalDatabase(): Promise<void> {
  if (globalDatabaseSystem) {
    await globalDatabaseSystem.shutdown();
    globalDatabaseSystem = null;
  }
}

// Экспорт по умолчанию
export default DatabaseSystem;