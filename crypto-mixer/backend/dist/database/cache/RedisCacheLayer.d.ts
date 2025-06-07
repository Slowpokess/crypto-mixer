/**
 * Продвинутая Redis Cache Layer для криптомиксера
 *
 * Поддерживает:
 * - Multiple caching strategies (LRU, LFU, TTL-based)
 * - Cache warming и preloading
 * - Intelligent cache invalidation
 * - Multi-level caching (L1 memory + L2 Redis)
 * - Cache compression для больших объектов
 * - Distribution-aware caching для кластеров
 * - Cache analytics и performance monitoring
 */
import { RedisConnectionManager } from './RedisConnectionManager';
import { EventEmitter } from 'events';
export interface CacheConfig {
    defaultTTL: number;
    maxKeyLength: number;
    keyPrefix: string;
    enableLRUEviction: boolean;
    enableCompression: boolean;
    compressionThreshold: number;
    enableMultiLevel: boolean;
    enableBatching: boolean;
    batchSize: number;
    batchTimeout: number;
    enablePipelining: boolean;
    enableWarmup: boolean;
    warmupKeys: string[];
    warmupConcurrency: number;
    enableAnalytics: boolean;
    analyticsInterval: number;
    enableHitRateTracking: boolean;
    enableDistributedLocking: boolean;
    lockTimeout: number;
    enableCacheStampedeProtection: boolean;
    serializationStrategy: 'json' | 'msgpack' | 'protobuf';
    enableSchemaValidation: boolean;
}
export interface CacheEntry<T = any> {
    data: T;
    timestamp: number;
    ttl: number;
    hits: number;
    size: number;
    compressed: boolean;
    checksum?: string;
}
export interface CacheStats {
    totalKeys: number;
    memoryUsage: number;
    hitRate: number;
    missRate: number;
    evictionRate: number;
    compressionRatio: number;
    averageLatency: number;
    operationsPerSecond: number;
    errorRate: number;
}
export interface CacheOperation {
    type: 'get' | 'set' | 'del' | 'exists' | 'expire';
    key: string;
    startTime: number;
    success: boolean;
    latency?: number;
    size?: number;
    fromL1Cache?: boolean;
}
export interface CacheBatch {
    operations: Array<{
        type: 'get' | 'set' | 'del';
        key: string;
        value?: any;
        ttl?: number;
    }>;
    timeout?: number;
}
/**
 * Высокопроизводительная Redis Cache Layer
 */
export declare class RedisCacheLayer extends EventEmitter {
    private redis;
    private config;
    private l1Cache;
    private l1MaxSize;
    private pendingBatch;
    private batchTimer;
    private stats;
    private operations;
    private analyticsTimer?;
    private warmupInProgress;
    private activeLocks;
    constructor(redis: RedisConnectionManager, config?: Partial<CacheConfig>);
    /**
     * Инициализация системы аналитики
     */
    private initializeAnalytics;
    /**
     * Получение значения из кэша с multi-level поддержкой
     */
    get<T = any>(key: string): Promise<T | null>;
    /**
     * Сохранение значения в кэш
     */
    set<T = any>(key: string, value: T, ttl?: number): Promise<void>;
    /**
     * Удаление из кэша
     */
    delete(key: string): Promise<boolean>;
    /**
     * Проверка существования ключа
     */
    exists(key: string): Promise<boolean>;
    /**
     * Установка TTL для существующего ключа
     */
    expire(key: string, ttl: number): Promise<boolean>;
    /**
     * Batch операции для лучшей производительности
     */
    executeBatch(batch: CacheBatch): Promise<any[]>;
    /**
     * Cache warming - предзагрузка важных данных
     */
    warmupCache(): Promise<void>;
    /**
     * Интеллектуальная инвалидация кэша по паттерну
     */
    invalidatePattern(pattern: string): Promise<number>;
    /**
     * Выполнение произвольных Redis команд
     */
    executeCommand(command: string, args: any[], isReadOperation?: boolean): Promise<any>;
    /**
     * L1 Cache операции (memory cache)
     */
    private getFromL1Cache;
    private setInL1Cache;
    /**
     * Проверка истечения TTL
     */
    private isExpired;
    /**
     * Нормализация ключа кэша
     */
    private normalizeKey;
    /**
     * Сериализация данных с опциональной компрессией
     */
    private serializeData;
    /**
     * Десериализация данных с декомпрессией
     */
    private deserializeData;
    /**
     * Расчет размера объекта
     */
    private calculateSize;
    /**
     * Получение/освобождение distributed lock
     */
    private acquireDistributedLock;
    /**
     * Запись операции для аналитики
     */
    private recordOperation;
    /**
     * Обновление статистики
     */
    private updateStats;
    /**
     * Очистка старых операций
     */
    private cleanupOldOperations;
    /**
     * Очистка истекших locks
     */
    private cleanupExpiredLocks;
    /**
     * Получение статистики кэша
     */
    getStats(): CacheStats;
    /**
     * Очистка всего кэша
     */
    flush(): Promise<void>;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default RedisCacheLayer;
