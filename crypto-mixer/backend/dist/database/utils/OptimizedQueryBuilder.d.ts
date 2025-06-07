/**
 * Оптимизированный Query Builder для устранения N+1 проблем
 *
 * Обеспечивает:
 * - Эффективные JOIN запросы вместо multiple queries
 * - Агрегация данных на уровне БД
 * - Кэширование результатов
 * - Пагинация с оптимизацией
 * - Query analysis и performance monitoring
 */
import { Sequelize, Transaction } from 'sequelize';
import { PerformanceMonitor } from '../../utils/monitoring/PerformanceMonitor';
export interface QueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    cache?: boolean;
    cacheKey?: string;
    cacheTTL?: number;
    explain?: boolean;
    timeout?: number;
    raw?: boolean;
    transaction?: Transaction;
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
export interface QueryPerformanceStats {
    queryTime: number;
    rowsReturned: number;
    rowsExamined: number;
    indexesUsed: string[];
    cacheHit: boolean;
    optimizationTips: string[];
}
/**
 * Оптимизированный Query Builder
 */
export declare class OptimizedQueryBuilder {
    private sequelize;
    private cache;
    private performanceMonitor?;
    private queryStats;
    constructor(sequelize: Sequelize, performanceMonitor?: PerformanceMonitor);
    /**
     * Оптимизированная статистика для MixRequest с агрегацией на уровне БД
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
     * Оптимизированная статистика для Wallet с агрегацией
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
     * Оптимизированный поиск MixRequest с JOIN'ами вместо N+1
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
     * Оптимизированный поиск кошельков с достаточным балансом
     */
    findWalletsWithSufficientBalance(currency: string, minAmount: number, limit?: number): Promise<any[]>;
    /**
     * Агрегированная статистика производительности БД
     */
    getDatabasePerformanceStats(): Promise<{
        avgQueryTime: number;
        slowQueries: number;
        totalQueries: number;
        cacheHitRate: number;
        connectionStats: any;
    }>;
    /**
     * Выполнение оптимизированного запроса с мониторингом
     */
    private executeQuery;
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
     * Инвалидация кэша по паттерну
     */
    invalidateCache(pattern: string): void;
    /**
     * Очистка всего кэша
     */
    clearCache(): void;
    /**
     * Получение статистики кэша
     */
    getCacheStats(): {
        size: number;
        hitRate: number;
    };
    /**
     * Получение статистики запросов
     */
    getQueryStats(): Map<string, QueryPerformanceStats>;
    /**
     * Очистка статистики запросов
     */
    clearQueryStats(): void;
}
export default OptimizedQueryBuilder;
