"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseTestSuite = exports.validators = exports.RedisSessionManager = exports.CriticalDataCacheManager = exports.RedisCacheLayer = exports.RedisConnectionManager = exports.RedisMasterManager = exports.OptimizedWalletRepository = exports.OptimizedMixRequestRepository = exports.DataRecoveryManager = exports.RedisOptimizedQueryBuilder = exports.OptimizedQueryBuilder = exports.ConnectionPoolManager = exports.DatabaseOptimizationSuite = exports.initializeModels = exports.RepositoryContainer = exports.initializeRepositories = exports.DatabaseMonitoring = exports.BackupManager = exports.MigrationManager = exports.DatabaseManager = exports.DatabaseSystem = void 0;
exports.getGlobalDatabaseSystem = getGlobalDatabaseSystem;
exports.initializeGlobalDatabase = initializeGlobalDatabase;
exports.shutdownGlobalDatabase = shutdownGlobalDatabase;
const DatabaseManager_1 = require("./DatabaseManager");
const models_1 = require("./models");
const repositories_1 = require("./repositories");
const MigrationManager_1 = require("./migrations/MigrationManager");
const BackupManager_1 = require("./utils/BackupManager");
const DatabaseMonitoring_1 = require("./utils/DatabaseMonitoring");
const DatabaseOptimizationSuite_1 = __importDefault(require("./utils/DatabaseOptimizationSuite"));
/**
 * Главная точка входа для всей системы базы данных
 * Предоставляет единый интерфейс для инициализации и управления
 */
class DatabaseSystem {
    constructor(config) {
        this.isInitialized = false;
        this.useOptimizations = true; // По умолчанию включаем оптимизации
        this.dbManager = new DatabaseManager_1.DatabaseManager(config);
        this.sequelize = this.dbManager.getSequelize();
        // Проверяем, нужно ли использовать оптимизации
        this.useOptimizations = config?.enableOptimizations !== false;
        // Инициализируем компоненты
        this.migrationManager = new MigrationManager_1.MigrationManager(this.sequelize);
        this.backupManager = new BackupManager_1.BackupManager(this.sequelize);
        this.monitoring = new DatabaseMonitoring_1.DatabaseMonitoring(this.sequelize);
    }
    /**
     * Полная инициализация системы
     */
    async initialize() {
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
            this.models = (0, models_1.initializeModels)(this.sequelize);
            console.log('✅ Database models initialized');
            // 4. Инициализация системных данных
            await (0, models_1.initializeSystemData)();
            console.log('✅ System data initialized');
            // 5. Инициализация оптимизированной системы (если включена)
            if (this.useOptimizations) {
                console.log('🚀 Initializing optimization suite...');
                this.optimizationSuite = new DatabaseOptimizationSuite_1.default(process.env.DATABASE_URL, {
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
                await new Promise((resolve) => {
                    this.optimizationSuite.once('initialized', resolve);
                });
                // Получаем оптимизированные репозитории (с Redis если включен)
                const optimizedRepos = process.env.ENABLE_REDIS_CACHE === 'true'
                    ? this.optimizationSuite.getRedisOptimizedRepositories()
                    : this.optimizationSuite.getOptimizedRepositories();
                this.repositories = {
                    ...(0, repositories_1.initializeRepositories)(this.models),
                    ...optimizedRepos
                };
                console.log('✅ Optimization suite initialized');
                console.log('✅ Optimized repositories initialized');
            }
            else {
                // 5. Инициализация обычных репозиториев
                this.repositories = (0, repositories_1.initializeRepositories)(this.models);
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
        }
        catch (error) {
            console.error('❌ Database system initialization failed:', error);
            throw error;
        }
    }
    /**
     * Настройка автоматических бэкапов
     */
    setupAutomaticBackups() {
        // Полные бэкапы каждый день в 2:00
        // Инкрементальные бэкапы каждые 6 часов
        this.backupManager.scheduleBackups({
            full: '0 2 * * *', // Ежедневно в 2:00
            incremental: '0 */6 * * *' // Каждые 6 часов
        });
    }
    /**
     * Корректное завершение работы
     */
    async shutdown() {
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
        }
        catch (error) {
            console.error('❌ Error during shutdown:', error);
            throw error;
        }
    }
    /**
     * Получение компонентов системы
     */
    getDatabaseManager() {
        return this.dbManager;
    }
    getSequelize() {
        return this.sequelize;
    }
    getModels() {
        this.ensureInitialized();
        return this.models;
    }
    getRepositories() {
        this.ensureInitialized();
        return this.repositories;
    }
    getMigrationManager() {
        return this.migrationManager;
    }
    getBackupManager() {
        return this.backupManager;
    }
    getMonitoring() {
        return this.monitoring;
    }
    /**
     * НОВЫЙ: Получение оптимизационной системы
     */
    getOptimizationSuite() {
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
    isOptimizationsEnabled() {
        return this.useOptimizations && !!this.optimizationSuite;
    }
    /**
     * НОВЫЙ: Проверка, включен ли Redis кэш
     */
    isRedisCacheEnabled() {
        return process.env.ENABLE_REDIS_CACHE === 'true' && !!this.optimizationSuite?.getRedisComponents();
    }
    /**
     * Проверка состояния системы
     */
    async getSystemHealth() {
        const timestamp = new Date();
        const components = {};
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
            let overallStatus = 'healthy';
            if (components.database.status !== 'healthy' ||
                components.monitoring.status === 'critical' ||
                (components.optimization && components.optimization.overall === 'CRITICAL')) {
                overallStatus = 'critical';
            }
            else if (components.monitoring.status === 'warning' ||
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
        }
        catch (error) {
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
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Database system not initialized. Call initialize() first.');
        }
    }
    /**
     * Статический метод для быстрой инициализации
     */
    static async create(config) {
        const system = new DatabaseSystem(config);
        await system.initialize();
        return system;
    }
}
exports.DatabaseSystem = DatabaseSystem;
// Экспорты для удобства использования
var DatabaseManager_2 = require("./DatabaseManager");
Object.defineProperty(exports, "DatabaseManager", { enumerable: true, get: function () { return DatabaseManager_2.DatabaseManager; } });
var MigrationManager_2 = require("./migrations/MigrationManager");
Object.defineProperty(exports, "MigrationManager", { enumerable: true, get: function () { return MigrationManager_2.MigrationManager; } });
var BackupManager_2 = require("./utils/BackupManager");
Object.defineProperty(exports, "BackupManager", { enumerable: true, get: function () { return BackupManager_2.BackupManager; } });
var DatabaseMonitoring_2 = require("./utils/DatabaseMonitoring");
Object.defineProperty(exports, "DatabaseMonitoring", { enumerable: true, get: function () { return DatabaseMonitoring_2.DatabaseMonitoring; } });
var repositories_2 = require("./repositories");
Object.defineProperty(exports, "initializeRepositories", { enumerable: true, get: function () { return repositories_2.initializeRepositories; } });
Object.defineProperty(exports, "RepositoryContainer", { enumerable: true, get: function () { return repositories_2.RepositoryContainer; } });
var models_2 = require("./models");
Object.defineProperty(exports, "initializeModels", { enumerable: true, get: function () { return models_2.initializeModels; } });
// НОВЫЕ ЭКСПОРТЫ: Компоненты оптимизации
var DatabaseOptimizationSuite_2 = require("./utils/DatabaseOptimizationSuite");
Object.defineProperty(exports, "DatabaseOptimizationSuite", { enumerable: true, get: function () { return __importDefault(DatabaseOptimizationSuite_2).default; } });
var ConnectionPoolManager_1 = require("./utils/ConnectionPoolManager");
Object.defineProperty(exports, "ConnectionPoolManager", { enumerable: true, get: function () { return ConnectionPoolManager_1.ConnectionPoolManager; } });
var OptimizedQueryBuilder_1 = require("./utils/OptimizedQueryBuilder");
Object.defineProperty(exports, "OptimizedQueryBuilder", { enumerable: true, get: function () { return OptimizedQueryBuilder_1.OptimizedQueryBuilder; } });
var RedisOptimizedQueryBuilder_1 = require("./utils/RedisOptimizedQueryBuilder");
Object.defineProperty(exports, "RedisOptimizedQueryBuilder", { enumerable: true, get: function () { return RedisOptimizedQueryBuilder_1.RedisOptimizedQueryBuilder; } });
var DataRecoveryManager_1 = require("./utils/DataRecoveryManager");
Object.defineProperty(exports, "DataRecoveryManager", { enumerable: true, get: function () { return DataRecoveryManager_1.DataRecoveryManager; } });
var OptimizedMixRequestRepository_1 = require("./repositories/OptimizedMixRequestRepository");
Object.defineProperty(exports, "OptimizedMixRequestRepository", { enumerable: true, get: function () { return OptimizedMixRequestRepository_1.OptimizedMixRequestRepository; } });
var OptimizedWalletRepository_1 = require("./repositories/OptimizedWalletRepository");
Object.defineProperty(exports, "OptimizedWalletRepository", { enumerable: true, get: function () { return OptimizedWalletRepository_1.OptimizedWalletRepository; } });
// НОВЫЕ ЭКСПОРТЫ: Redis компоненты
var RedisMasterManager_1 = require("./cache/RedisMasterManager");
Object.defineProperty(exports, "RedisMasterManager", { enumerable: true, get: function () { return __importDefault(RedisMasterManager_1).default; } });
var RedisConnectionManager_1 = require("./cache/RedisConnectionManager");
Object.defineProperty(exports, "RedisConnectionManager", { enumerable: true, get: function () { return RedisConnectionManager_1.RedisConnectionManager; } });
var RedisCacheLayer_1 = require("./cache/RedisCacheLayer");
Object.defineProperty(exports, "RedisCacheLayer", { enumerable: true, get: function () { return RedisCacheLayer_1.RedisCacheLayer; } });
var CriticalDataCacheManager_1 = require("./cache/CriticalDataCacheManager");
Object.defineProperty(exports, "CriticalDataCacheManager", { enumerable: true, get: function () { return CriticalDataCacheManager_1.CriticalDataCacheManager; } });
var RedisSessionManager_1 = require("./cache/RedisSessionManager");
Object.defineProperty(exports, "RedisSessionManager", { enumerable: true, get: function () { return RedisSessionManager_1.RedisSessionManager; } });
// Экспорт типов
__exportStar(require("./types"), exports);
// Экспорт валидаторов
var validators_1 = require("./validators");
Object.defineProperty(exports, "validators", { enumerable: true, get: function () { return __importDefault(validators_1).default; } });
// Экспорт тестовой системы
var test_initialization_1 = require("./test-initialization");
Object.defineProperty(exports, "DatabaseTestSuite", { enumerable: true, get: function () { return test_initialization_1.DatabaseTestSuite; } });
/**
 * Глобальный экземпляр для использования в приложении
 */
let globalDatabaseSystem = null;
/**
 * Получение глобального экземпляра системы БД
 */
function getGlobalDatabaseSystem() {
    if (!globalDatabaseSystem) {
        throw new Error('Global database system not initialized. Call initializeGlobalDatabase() first.');
    }
    return globalDatabaseSystem;
}
/**
 * Инициализация глобального экземпляра
 */
async function initializeGlobalDatabase(config) {
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
async function shutdownGlobalDatabase() {
    if (globalDatabaseSystem) {
        await globalDatabaseSystem.shutdown();
        globalDatabaseSystem = null;
    }
}
// Экспорт по умолчанию
exports.default = DatabaseSystem;
//# sourceMappingURL=index.js.map