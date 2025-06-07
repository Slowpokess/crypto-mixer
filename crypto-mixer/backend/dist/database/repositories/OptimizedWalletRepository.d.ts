/**
 * Оптимизированный WalletRepository с устранением N+1 проблем
 *
 * Основные оптимизации:
 * - Агрегированные запросы для статистики вместо загрузки всех записей
 * - Оптимизированные индексированные запросы для поиска кошельков
 * - Кэширование балансов и часто используемых данных
 * - Batch операции для массовых обновлений
 * - Connection pooling optimization
 */
import { Transaction } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { Wallet, WalletAttributes, WalletCreationAttributes } from '../models/Wallet';
import { CurrencyType } from '../types';
import { OptimizedQueryBuilder } from '../utils/OptimizedQueryBuilder';
/**
 * Оптимизированный репозиторий для работы с кошельками
 */
export declare class OptimizedWalletRepository extends BaseRepository<Wallet> {
    private queryBuilder;
    private balanceCache;
    private readonly BALANCE_CACHE_TTL;
    constructor(model: typeof Wallet, queryBuilder: OptimizedQueryBuilder);
    /**
     * Создание нового кошелька с проверкой уникальности
     * Оптимизация: Использование EXISTS вместо полной загрузки записи
     */
    createWallet(data: WalletCreationAttributes, transaction?: Transaction): Promise<Wallet>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск кошелька по адресу с кэшированием
     */
    findByAddress(address: string): Promise<Wallet | null>;
    /**
     * КАРДИНАЛЬНО ОПТИМИЗИРОВАННЫЙ: Статистика с агрегацией на БД
     * Устранение N+1: Вместо загрузки всех записей - агрегация на уровне БД
     */
    getStatistics(): Promise<{
        total: number;
        byType: Record<string, number>;
        byCurrency: Record<CurrencyType, number>;
        totalBalance: Record<CurrencyType, number>;
        activeWallets: number;
        lockedWallets: number;
    }>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск кошельков с достаточным балансом
     * Использует оптимизированный query builder с индексами
     */
    findWithSufficientBalance(currency: CurrencyType, minAmount: number, limit?: number): Promise<Wallet[]>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Batch обновление балансов
     * Массовое обновление одним запросом вместо множественных
     */
    batchUpdateBalances(updates: Array<{
        id: string;
        newBalance: number;
    }>, transaction?: Transaction): Promise<number>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Получение баланса с кэшированием
     */
    getBalance(id: string): Promise<number>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Обновление баланса с кэшем
     */
    updateBalance(id: string, newBalance: number, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * НОВЫЙ: Атомарное списание средств с проверкой баланса
     */
    atomicSubtractBalance(id: string, amount: number, transaction?: Transaction): Promise<{
        success: boolean;
        newBalance?: number;
        error?: string;
    }>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск оптимального кошелька для вывода с индексами
     */
    findOptimalForWithdrawal(currency: CurrencyType, amount: number): Promise<Wallet | null>;
    /**
     * НОВЫЙ: Агрегированная статистика по валюте
     */
    getCurrencyAggregates(currency: CurrencyType): Promise<{
        totalWallets: number;
        activeWallets: number;
        totalBalance: number;
        averageBalance: number;
        hotWallets: number;
        coldWallets: number;
        poolWallets: number;
    }>;
    /**
     * НОВЫЙ: Batch создание кошельков
     */
    bulkCreateWallets(data: WalletCreationAttributes[], transaction?: Transaction): Promise<Wallet[]>;
    /**
     * ОПТИМИЗИРОВАННЫЙ: Архивирование неактивных кошельков batch операциями
     */
    archiveInactive(daysInactive?: number, batchSize?: number): Promise<number>;
    /**
     * Очистка кэша балансов
     */
    clearBalanceCache(): void;
    /**
     * Получение статистики кэша балансов
     */
    getBalanceCacheStats(): {
        size: number;
        hitRate: number;
    };
    /**
     * Инвалидация кэша при изменении данных
     */
    private invalidateRelevantCache;
    /**
     * Переопределение методов с инвалидацией кэша
     */
    updateById(id: string, data: Partial<WalletAttributes>, transaction?: Transaction): Promise<Wallet | null>;
    deleteById(id: string, transaction?: Transaction): Promise<boolean>;
}
export default OptimizedWalletRepository;
