/**
 * Redis-powered Оптимизированный Query Builder
 *
 * Расширяет OptimizedQueryBuilder с интеграцией Redis кэширования:
 * - Замена in-memory кэша на Redis
 * - Intelligent cache invalidation
 * - Query result caching с smart TTL
 * - Database query optimization with Redis backing
 * - Performance monitoring с Redis analytics
 */
import { Sequelize, Transaction } from 'sequelize';
import { PerformanceMonitor } from '../../utils/monitoring/PerformanceMonitor';
import { RedisCacheLayer } from '../cache/RedisCacheLayer';
export interface RedisQueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    cache?: boolean;
    cacheKey?: string;
    cacheTTL?: number;
    cacheInvalidationTags?: string[];
    explain?: boolean;
    timeout?: number;
    enableCompression?: boolean;
    raw?: boolean;
    transaction?: Transaction;
    useMultiLevel?: boolean;
    enableBatching?: boolean;
    distributedLocking?: boolean;
}
export interface AggregationResult {
    [key: string]: number | string | null;
}
export interface PaginatedResult<T> {
    rows: T[];
    count: number;
    totalPages: number;
    currentPage: number;
    hasNext: boolean;
    hasPrev: boolean;
    limit: number;
    offset: number;
}
export interface RedisQueryPerformanceStats {
    queryTime: number;
    rowsReturned: number;
    rowsExamined: number;
    indexesUsed: string[];
    cacheHit: boolean;
    cacheSource: 'l1' | 'l2' | 'none';
    optimizationTips: string[];
    redisLatency?: number;
    compressionRatio?: number;
}
/**
 * Redis-интегрированный Query Builder
 */
export declare class RedisOptimizedQueryBuilder {
    private sequelize;
    private redisCache;
    private performanceMonitor?;
    private queryStats;
    private invalidationTagsMap;
    constructor(sequelize: Sequelize, redisCache: RedisCacheLayer, performanceMonitor?: PerformanceMonitor);
    /**
     * REDIS-ОПТИМИЗИРОВАННАЯ статистика для MixRequest
     */
    getMixRequestStatistics(filters?: {
        startDate?: Date;
        endDate?: Date;
        currency?: string;
    }): Promise<{
        total: number;
        byStatus: Record<string, number>;
        byCurrency: Record<string, number>;
        totalAmount: Record<string, number>;
        averageAmount: Record<string, number>;
        successRate: number;
    }>;
    /**
     * REDIS-ОПТИМИЗИРОВАННАЯ статистика для Wallet
     */
    getWalletStatistics(): Promise<{
        total: number;
        byType: Record<string, number>;
        byCurrency: Record<string, number>;
        totalBalance: Record<string, number>;
        activeWallets: number;
        lockedWallets: number;
    }>;
    /**
     * REDIS-ОПТИМИЗИРОВАННЫЙ поиск MixRequest с отношениями
     */
    findMixRequestsWithRelations(filters: {
        currency?: string;
        status?: string | string[];
        minAmount?: number;
        maxAmount?: number;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResult<any>>;
    /**
     * REDIS-ОПТИМИЗИРОВАННЫЙ поиск кошельков с достаточным балансом
     */
    findWalletsWithSufficientBalance(currency: string, minAmount: number, limit?: number): Promise<any[]>;
    /**
     * Выполнение оптимизированного запроса с Redis кэшированием
     */
    private executeQuery;
    /**
     * Умная генерация cache key
     */
    private generateSmartCacheKey;
    /**
     * Расчет умного TTL на основе типа данных
     */
    private calculateSmartTTL;
    /**
     * Регистрация invalidation tags для умной инвалидации
     */
    private registerInvalidationTags;
    /**
     * Умная инвалидация кэша по тегам
     */
    invalidateByTags(tags: string[]): Promise<number>;
    /**
     * Построение фильтра по датам
     */
    private buildDateFilter;
    /**
     * Генерация ключа для кэша
     */
    private generateQueryKey;
    /**
     * Обработка строки результата MixRequest
     */
    private processMixRequestRow;
    /**
     * Инвалидация кэша по паттерну (переадресация в Redis)
     */
    invalidateCache(pattern: string): Promise<void>;
    /**
     * Получение статистики кэша
     */
    getCacheStats(): any;
    /**
     * Получение статистики запросов
     */
    getQueryStats(): Map<string, RedisQueryPerformanceStats>;
    /**
     * Очистка статистики запросов
     */
    clearQueryStats(): void;
    /**
     * Получение статистики производительности БД с Redis метриками
     */
    getDatabasePerformanceStats(): Promise<{
        avgQueryTime: number;
        slowQueries: number;
        totalQueries: number;
        cacheHitRate: number;
        redisStats: any;
        connectionStats: any;
    }>;
}
export default RedisOptimizedQueryBuilder;
