/**
 * Оптимизированный MixRequestRepository с устранением N+1 проблем
 *
 * Основные оптимизации:
 * - Агрегированные запросы вместо загрузки всех записей в память
 * - Эффективные JOIN'ы вместо отдельных запросов
 * - Кэширование часто используемых данных
 * - Пагинация с оптимизацией
 * - Performance monitoring всех запросов
 */
import { Transaction } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { MixRequest, MixRequestAttributes, MixRequestCreationAttributes } from '../models/MixRequest';
import { CurrencyType, MixRequestStatus } from '../types';
import { OptimizedQueryBuilder, PaginatedResult } from '../utils/OptimizedQueryBuilder';
/**
 * Оптимизированный репозиторий для работы с запросами микширования
 */
export declare class OptimizedMixRequestRepository extends BaseRepository<MixRequest> {
    private queryBuilder;
    constructor(model: typeof MixRequest, queryBuilder: OptimizedQueryBuilder);
    /**
     * Создание нового запроса микширования с полной инициализацией
     * Оптимизация: Использование транзакций для консистентности
     */
    createMixRequest(data: MixRequestCreationAttributes, transaction?: Transaction): Promise<MixRequest>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск запросов по статусу с eager loading
     * Устранение N+1: Один запрос вместо множественных
     */
    findByStatus(status: MixRequestStatus): Promise<MixRequest[]>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск активных запросов по валюте
     * Использует индексированный запрос с кэшированием
     */
    findActiveByCurrency(currency: CurrencyType): Promise<MixRequest[]>;
    /**
     * КАРДИНАЛЬНО ОПТИМИЗИРОВАННЫЙ: Статистика с агрегацией на БД
     * Устранение N+1: Вместо загрузки всех записей - агрегация на уровне БД
     */
    getStatistics(startDate?: Date, endDate?: Date, currency?: CurrencyType): Promise<{
        total: number;
        byStatus: Record<MixRequestStatus, number>;
        byCurrency: Record<CurrencyType, number>;
        totalAmount: Record<CurrencyType, number>;
        averageAmount: Record<CurrencyType, number>;
        successRate: number;
    }>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск с фильтрацией и пагинацией
     * Устранение N+1: Единый JOIN запрос с пагинацией
     */
    findWithFilters(filters: {
        currency?: CurrencyType;
        status?: MixRequestStatus | MixRequestStatus[];
        minAmount?: number;
        maxAmount?: number;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResult<any>>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Получение полной информации о запросе
     * Один запрос с глубокими JOIN'ами вместо множественных
     */
    getFullDetails(id: string): Promise<MixRequest | null>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Batch обновление статуса
     * Обновление множества записей одним запросом
     */
    batchUpdateStatus(ids: string[], status: MixRequestStatus, additionalData?: Partial<MixRequestAttributes>, transaction?: Transaction): Promise<number>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск готовых к обработке с оптимизированными JOIN'ами
     */
    findReadyForProcessing(limit?: number): Promise<MixRequest[]>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Очистка старых записей с batch операциями
     */
    cleanupOldRequests(daysToKeep?: number, batchSize?: number): Promise<number>;
    /**
     * НОВЫЙ: Получение метрик производительности запросов
     */
    getQueryPerformanceMetrics(): Promise<{
        slowQueries: number;
        avgQueryTime: number;
        cacheHitRate: number;
        totalQueries: number;
    }>;
    /**
     * НОВЫЙ: Bulk операции для массовых обновлений
     */
    bulkCreateMixRequests(data: MixRequestCreationAttributes[], transaction?: Transaction): Promise<MixRequest[]>;
    /**
     * НОВЫЙ: Оптимизированный поиск по валюте с агрегацией
     */
    getCurrencyAggregates(currency: CurrencyType): Promise<{
        totalRequests: number;
        totalAmount: number;
        averageAmount: number;
        completedCount: number;
        pendingCount: number;
        successRate: number;
    }>;
    /**
     * Инвалидация кэша при изменении данных
     */
    private invalidateRelevantCache;
    /**
     * Переопределение updateById с инвалидацией кэша
     */
    updateById(id: string, data: Partial<MixRequestAttributes>, transaction?: Transaction): Promise<MixRequest | null>;
    /**
     * Переопределение deleteById с инвалидацией кэша
     */
    deleteById(id: string, transaction?: Transaction): Promise<boolean>;
}
export default OptimizedMixRequestRepository;
