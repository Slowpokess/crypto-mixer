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
import { ConnectionPoolConfig } from './ConnectionPoolManager';
import { OptimizedQueryBuilder } from './OptimizedQueryBuilder';
import { RedisOptimizedQueryBuilder } from './RedisOptimizedQueryBuilder';
import RedisMasterManager from '../cache/RedisMasterManager';
import { DataRecoveryManager, RecoveryOptions } from './DataRecoveryManager';
import { EventEmitter } from 'events';
export interface DatabaseOptimizationConfig {
    connectionPool: Partial<ConnectionPoolConfig>;
    recovery: Partial<RecoveryOptions>;
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
    enablePerformanceMonitoring: boolean;
    performanceThresholds: {
        slowQueryThreshold: number;
        highUtilizationThreshold: number;
        maxConnectionWaitTime: number;
    };
    enableAutomatedMaintenance: boolean;
    maintenanceSchedule: {
        integrityCheckHour: number;
        performanceAnalysisHour: number;
        cleanupHour: number;
    };
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
export declare class DatabaseOptimizationSuite extends EventEmitter {
    private sequelize;
    private config;
    private connectionPoolManager;
    private queryBuilder;
    private redisQueryBuilder?;
    private redisMaster?;
    private recoveryManager;
    private backupManager;
    private performanceMonitor?;
    private healthStatus;
    private maintenanceTimer?;
    private healthCheckTimer?;
    private isInitialized;
    private isShuttingDown;
    constructor(databaseUrl: string, config?: Partial<DatabaseOptimizationConfig>);
    /**
     * Инициализация всей системы оптимизации
     */
    private initializeSystem;
    /**
     * Инициализация Redis кэширования
     */
    private initializeRedisCache;
    /**
     * Настройка обработчиков событий Redis
     */
    private setupRedisEventListeners;
    /**
     * Настройка обработчиков событий
     */
    private setupEventListeners;
    /**
     * Запуск автоматизированного обслуживания
     */
    private startAutomatedMaintenance;
    /**
     * Запуск мониторинга здоровья системы
     */
    private startHealthMonitoring;
    /**
     * Комплексная проверка здоровья системы
     */
    performHealthCheck(): Promise<SystemHealthStatus>;
    /**
     * Scheduled проверка целостности данных
     */
    private performScheduledIntegrityCheck;
    /**
     * Scheduled анализ производительности
     */
    private performScheduledPerformanceAnalysis;
    /**
     * Scheduled очистка и оптимизация
     */
    private performScheduledCleanup;
    /**
     * Получение оптимизированных репозиториев
     */
    getOptimizedRepositories(): {
        MixRequestRepository: any;
        WalletRepository: any;
    };
    /**
     * Получение Redis-оптимизированных репозиториев
     */
    getRedisOptimizedRepositories(): {
        MixRequestRepository: any;
        WalletRepository: any;
    };
    /**
     * Получение Redis компонентов
     */
    getRedisComponents(): {
        redisMaster: RedisMasterManager | undefined;
        cacheLayer: import("..").RedisCacheLayer | undefined;
        criticalDataManager: import("..").CriticalDataCacheManager | undefined;
        sessionManager: import("..").RedisSessionManager | undefined;
        redisQueryBuilder: RedisOptimizedQueryBuilder | undefined;
    } | null;
    /**
     * Получение оптимизированного Sequelize инстанса
     */
    getSequelize(isReadOnly?: boolean): Sequelize;
    /**
     * Получение query builder
     */
    getQueryBuilder(): OptimizedQueryBuilder;
    /**
     * Получение recovery manager
     */
    getRecoveryManager(): DataRecoveryManager;
    /**
     * Получение статуса здоровья системы
     */
    getHealthStatus(): SystemHealthStatus;
    /**
     * Ручной trigger integrity check
     */
    triggerIntegrityCheck(): Promise<void>;
    /**
     * Ручной trigger performance analysis
     */
    triggerPerformanceAnalysis(): Promise<any>;
    /**
     * Graceful shutdown всей системы
     */
    shutdown(): Promise<void>;
}
export default DatabaseOptimizationSuite;
