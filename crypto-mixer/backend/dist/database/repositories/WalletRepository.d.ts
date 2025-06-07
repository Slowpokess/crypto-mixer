import { Transaction } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { Wallet, WalletCreationAttributes } from '../models/Wallet';
import { CurrencyType } from '../types';
/**
 * Репозиторий для работы с кошельками
 */
export declare class WalletRepository extends BaseRepository<Wallet> {
    constructor(model: typeof Wallet);
    /**
     * Создание нового кошелька с инициализацией
     */
    createWallet(data: WalletCreationAttributes, transaction?: Transaction): Promise<Wallet>;
    /**
     * Поиск кошелька по адресу
     */
    findByAddress(address: string): Promise<Wallet | null>;
    /**
     * Поиск кошельков по валюте
     */
    findByCurrency(currency: CurrencyType): Promise<Wallet[]>;
    /**
     * Поиск кошельков по типу
     */
    findByType(type: 'HOT' | 'COLD' | 'MULTISIG' | 'POOL'): Promise<Wallet[]>;
    /**
     * Поиск активных кошельков
     */
    findActive(): Promise<Wallet[]>;
    /**
     * Поиск кошельков с достаточным балансом
     */
    findWithSufficientBalance(currency: CurrencyType, minAmount: number): Promise<Wallet[]>;
    /**
     * Обновление баланса кошелька
     */
    updateBalance(id: string, newBalance: number, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Добавление к балансу
     */
    addToBalance(id: string, amount: number, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Списание с баланса
     */
    subtractFromBalance(id: string, amount: number, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Блокировка кошелька
     */
    lockWallet(id: string, reason?: string, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Разблокировка кошелька
     */
    unlockWallet(id: string, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Поиск кошельков для ротации
     */
    findForRotation(): Promise<Wallet[]>;
    /**
     * Статистика по кошелькам
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
     * Поиск оптимального кошелька для вывода
     */
    findOptimalForWithdrawal(currency: CurrencyType, amount: number): Promise<Wallet | null>;
    /**
     * Обновление статистики использования
     */
    updateUsageStats(id: string, transaction?: Transaction): Promise<Wallet | null>;
    /**
     * Поиск кошельков для консолидации
     */
    findForConsolidation(currency: CurrencyType): Promise<Wallet[]>;
    /**
     * Получение истории транзакций кошелька
     */
    getTransactionHistory(id: string, limit?: number): Promise<any[]>;
    /**
     * Архивирование неактивных кошельков
     */
    archiveInactive(daysInactive?: number): Promise<number>;
}
export default WalletRepository;
