import { Sequelize } from 'sequelize';
import { DatabaseManager } from './DatabaseManager';
import { RepositoryContainer } from './repositories';
import { MigrationManager } from './migrations/MigrationManager';
import { BackupManager } from './utils/BackupManager';
import { DatabaseMonitoring } from './utils/DatabaseMonitoring';
import DatabaseOptimizationSuite from './utils/DatabaseOptimizationSuite';
/**
 * Главная точка входа для всей системы базы данных
 * Предоставляет единый интерфейс для инициализации и управления
 */
export declare class DatabaseSystem {
    private dbManager;
    private sequelize;
    private models;
    private repositories;
    private migrationManager;
    private backupManager;
    private monitoring;
    private optimizationSuite?;
    private isInitialized;
    private useOptimizations;
    constructor(config?: any);
    /**
     * Полная инициализация системы
     */
    initialize(): Promise<void>;
    /**
     * Настройка автоматических бэкапов
     */
    private setupAutomaticBackups;
    /**
     * Корректное завершение работы
     */
    shutdown(): Promise<void>;
    /**
     * Получение компонентов системы
     */
    getDatabaseManager(): DatabaseManager;
    getSequelize(): Sequelize;
    getModels(): any;
    getRepositories(): RepositoryContainer;
    getMigrationManager(): MigrationManager;
    getBackupManager(): BackupManager;
    getMonitoring(): DatabaseMonitoring;
    /**
     * НОВЫЙ: Получение оптимизационной системы
     */
    getOptimizationSuite(): DatabaseOptimizationSuite | undefined;
    /**
     * НОВЫЙ: Получение Redis компонентов
     */
    getRedisComponents(): {
        redisMaster: import("./cache/RedisMasterManager").RedisMasterManager | undefined;
        cacheLayer: import("./cache/RedisCacheLayer").RedisCacheLayer | undefined;
        criticalDataManager: import("./cache/CriticalDataCacheManager").CriticalDataCacheManager | undefined;
        sessionManager: import("./cache/RedisSessionManager").RedisSessionManager | undefined;
        redisQueryBuilder: import("./utils/RedisOptimizedQueryBuilder").RedisOptimizedQueryBuilder | undefined;
    } | null;
    /**
     * НОВЫЙ: Проверка, включены ли оптимизации
     */
    isOptimizationsEnabled(): boolean;
    /**
     * НОВЫЙ: Проверка, включен ли Redis кэш
     */
    isRedisCacheEnabled(): boolean;
    /**
     * Проверка состояния системы
     */
    getSystemHealth(): Promise<{
        status: 'healthy' | 'warning' | 'critical';
        components: Record<string, any>;
        timestamp: Date;
    }>;
    /**
     * Проверка инициализации
     */
    private ensureInitialized;
    /**
     * Статический метод для быстрой инициализации
     */
    static create(config?: any): Promise<DatabaseSystem>;
}
export { DatabaseManager } from './DatabaseManager';
export { MigrationManager } from './migrations/MigrationManager';
export { BackupManager } from './utils/BackupManager';
export { DatabaseMonitoring } from './utils/DatabaseMonitoring';
export { initializeRepositories, RepositoryContainer } from './repositories';
export { initializeModels } from './models';
export { default as DatabaseOptimizationSuite } from './utils/DatabaseOptimizationSuite';
export { ConnectionPoolManager } from './utils/ConnectionPoolManager';
export { OptimizedQueryBuilder } from './utils/OptimizedQueryBuilder';
export { RedisOptimizedQueryBuilder } from './utils/RedisOptimizedQueryBuilder';
export { DataRecoveryManager } from './utils/DataRecoveryManager';
export { OptimizedMixRequestRepository } from './repositories/OptimizedMixRequestRepository';
export { OptimizedWalletRepository } from './repositories/OptimizedWalletRepository';
export { default as RedisMasterManager } from './cache/RedisMasterManager';
export { RedisConnectionManager } from './cache/RedisConnectionManager';
export { RedisCacheLayer } from './cache/RedisCacheLayer';
export { CriticalDataCacheManager } from './cache/CriticalDataCacheManager';
export { RedisSessionManager } from './cache/RedisSessionManager';
export * from './types';
export { default as validators } from './validators';
export { DatabaseTestSuite } from './test-initialization';
/**
 * Получение глобального экземпляра системы БД
 */
export declare function getGlobalDatabaseSystem(): DatabaseSystem;
/**
 * Инициализация глобального экземпляра
 */
export declare function initializeGlobalDatabase(config?: any): Promise<DatabaseSystem>;
/**
 * Завершение работы глобального экземпляра
 */
export declare function shutdownGlobalDatabase(): Promise<void>;
export default DatabaseSystem;
