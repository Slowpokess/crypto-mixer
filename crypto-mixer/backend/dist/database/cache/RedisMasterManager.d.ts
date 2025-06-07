/**
 * Redis Master Manager - Центральная система управления Redis
 *
 * Объединяет все Redis компоненты:
 * - Connection Management
 * - Cache Layer
 * - Critical Data Caching
 * - Session Management
 * - Monitoring & Health Checks
 * - Performance Analytics
 */
import { RedisConnectionManager } from './RedisConnectionManager';
import { RedisCacheLayer } from './RedisCacheLayer';
import { CriticalDataCacheManager } from './CriticalDataCacheManager';
import { RedisSessionManager } from './RedisSessionManager';
import { EventEmitter } from 'events';
export interface RedisMasterConfig {
    connection: {
        host: string;
        port: number;
        password?: string;
        db: number;
        keyPrefix: string;
        enableCluster: boolean;
        enableReadWriteSplit: boolean;
    };
    cache: {
        defaultTTL: number;
        enableCompression: boolean;
        enableMultiLevel: boolean;
        enableBatching: boolean;
    };
    monitoring: {
        enableHealthChecks: boolean;
        healthCheckInterval: number;
        enablePerformanceTracking: boolean;
        enableAnalytics: boolean;
    };
    security: {
        enableRateLimiting: boolean;
        enableAntiSpam: boolean;
        enableDistributedLocking: boolean;
    };
}
export interface RedisSystemHealth {
    overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    components: {
        connection: 'HEALTHY' | 'WARNING' | 'CRITICAL';
        cache: 'HEALTHY' | 'WARNING' | 'CRITICAL';
        sessions: 'HEALTHY' | 'WARNING' | 'CRITICAL';
        performance: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    };
    lastCheck: Date;
    details: {
        connectionStats: any;
        cacheStats: any;
        sessionStats: any;
        memoryUsage: number;
        responseTime: number;
    };
}
export interface RedisPerformanceMetrics {
    connections: {
        total: number;
        active: number;
        failed: number;
    };
    cache: {
        hitRate: number;
        missRate: number;
        evictionRate: number;
        memoryUsage: number;
    };
    operations: {
        commandsPerSecond: number;
        averageLatency: number;
        errorRate: number;
    };
    sessions: {
        active: number;
        rateLimitViolations: number;
        blockedUsers: number;
    };
}
/**
 * Центральная система управления Redis для криптомиксера
 */
export declare class RedisMasterManager extends EventEmitter {
    private config;
    private connectionManager;
    private cacheLayer;
    private criticalDataManager;
    private sessionManager;
    private systemHealth;
    private performanceMetrics;
    private healthCheckTimer?;
    private metricsTimer?;
    private isInitialized;
    private isShuttingDown;
    constructor(config?: Partial<RedisMasterConfig>);
    /**
     * Полная инициализация Redis системы
     */
    initialize(): Promise<void>;
    /**
     * Настройка обработчиков событий Connection Manager
     */
    private setupConnectionEventHandlers;
    /**
     * Настройка обработчиков событий Cache Layer
     */
    private setupCacheEventHandlers;
    /**
     * Настройка обработчиков событий Critical Data Manager
     */
    private setupCriticalDataEventHandlers;
    /**
     * Настройка обработчиков событий Session Manager
     */
    private setupSessionEventHandlers;
    /**
     * Запуск мониторинга здоровья системы
     */
    private startHealthMonitoring;
    /**
     * Запуск отслеживания производительности
     */
    private startPerformanceTracking;
    /**
     * Комплексная проверка здоровья Redis системы
     */
    performHealthCheck(): Promise<RedisSystemHealth>;
    /**
     * Обновление метрик производительности
     */
    private updatePerformanceMetrics;
    /**
     * Инициализация статуса здоровья
     */
    private initializeHealthStatus;
    /**
     * Инициализация метрик производительности
     */
    private initializePerformanceMetrics;
    /**
     * ПУБЛИЧНЫЕ МЕТОДЫ ДОСТУПА К КОМПОНЕНТАМ
     */
    /**
     * Получение Connection Manager
     */
    getConnectionManager(): RedisConnectionManager;
    /**
     * Получение Cache Layer
     */
    getCacheLayer(): RedisCacheLayer;
    /**
     * Получение Critical Data Manager
     */
    getCriticalDataManager(): CriticalDataCacheManager;
    /**
     * Получение Session Manager
     */
    getSessionManager(): RedisSessionManager;
    /**
     * Получение статуса здоровья системы
     */
    getSystemHealth(): RedisSystemHealth;
    /**
     * Получение метрик производительности
     */
    getPerformanceMetrics(): RedisPerformanceMetrics;
    /**
     * Проверка инициализации
     */
    private ensureInitialized;
    /**
     * Graceful shutdown всей Redis системы
     */
    shutdown(): Promise<void>;
}
export default RedisMasterManager;
