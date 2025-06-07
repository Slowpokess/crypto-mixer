import { Model, Sequelize, Optional } from 'sequelize';
import { CurrencyType } from '../types';
export interface TransactionPoolAttributes {
    id: string;
    currency: CurrencyType;
    name: string;
    minAmount: number;
    maxAmount: number;
    targetAmount: number;
    feePercentage: number;
    currentAmount: number;
    participantsCount: number;
    maxParticipants: number;
    minParticipants: number;
    isActive: boolean;
    isLocked: boolean;
    status: 'WAITING' | 'FILLING' | 'READY' | 'MIXING' | 'COMPLETED' | 'CANCELLED';
    createdAt: Date;
    startedAt?: Date;
    lockedAt?: Date;
    completedAt?: Date;
    expiresAt?: Date;
    mixingRounds: number;
    completedRounds: number;
    anonymitySet: number;
    shuffleIterations: number;
    description?: string;
    priority: number;
    tags?: string[];
    totalMixed: number;
    averageAmount: number;
    successRate: number;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface TransactionPoolCreationAttributes extends Optional<TransactionPoolAttributes, 'id' | 'currentAmount' | 'participantsCount' | 'isLocked' | 'status' | 'mixingRounds' | 'completedRounds' | 'anonymitySet' | 'shuffleIterations' | 'priority' | 'totalMixed' | 'averageAmount' | 'successRate' | 'createdAt' | 'updatedAt' | 'startedAt' | 'lockedAt' | 'completedAt' | 'expiresAt' | 'description' | 'tags' | 'feePercentage' | 'minAmount' | 'maxAmount' | 'targetAmount' | 'maxParticipants' | 'minParticipants' | 'isActive'> {
}
/**
 * Модель пула транзакций
 * Управление пулами для коллективного микширования
 */
export declare class TransactionPool extends Model<TransactionPoolAttributes, TransactionPoolCreationAttributes> implements TransactionPoolAttributes {
    id: string;
    currency: CurrencyType;
    name: string;
    minAmount: number;
    maxAmount: number;
    targetAmount: number;
    feePercentage: number;
    currentAmount: number;
    participantsCount: number;
    maxParticipants: number;
    minParticipants: number;
    isActive: boolean;
    isLocked: boolean;
    status: 'WAITING' | 'FILLING' | 'READY' | 'MIXING' | 'COMPLETED' | 'CANCELLED';
    readonly createdAt: Date;
    startedAt?: Date;
    lockedAt?: Date;
    completedAt?: Date;
    expiresAt?: Date;
    mixingRounds: number;
    completedRounds: number;
    anonymitySet: number;
    shuffleIterations: number;
    description?: string;
    priority: number;
    tags?: string[];
    totalMixed: number;
    averageAmount: number;
    successRate: number;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    /**
     * Проверка готовности к микшированию
     */
    isReadyForMixing(): boolean;
    /**
     * Проверка возможности добавления участника
     */
    canAddParticipant(amount: number): boolean;
    /**
     * Добавление участника в пул
     */
    addParticipant(amount: number): Promise<boolean>;
    /**
     * Удаление участника из пула
     */
    removeParticipant(amount: number): Promise<boolean>;
    /**
     * Блокировка пула для микширования
     */
    lockForMixing(): Promise<void>;
    /**
     * Разблокировка пула
     */
    unlock(): Promise<void>;
    /**
     * Завершение микширования
     */
    completeMixing(successful?: boolean): Promise<void>;
    /**
     * Сброс пула для повторного использования
     */
    reset(): Promise<void>;
    /**
     * Получение статистики эффективности
     */
    getEfficiencyStats(): {
        utilizationRate: number;
        fillRate: number;
        avgTimeToFill: number;
        mixingEfficiency: number;
    };
    /**
     * Проверка истечения срока
     */
    isExpired(): boolean;
    /**
     * Расчет общей комиссии пула
     */
    getTotalFee(): number;
    /**
     * Поиск активных пулов
     */
    static findActive(currency?: CurrencyType): Promise<TransactionPool[]>;
    /**
     * Поиск пулов готовых к микшированию
     */
    static findReadyForMixing(currency?: CurrencyType): Promise<TransactionPool[]>;
    /**
     * Поиск подходящего пула для суммы
     */
    static findSuitablePool(currency: CurrencyType, amount: number): Promise<TransactionPool | null>;
    /**
     * Статистика по пулам
     */
    static getStatistics(currency?: CurrencyType): Promise<any>;
    /**
     * Очистка завершенных пулов
     */
    static cleanupCompleted(daysToKeep?: number): Promise<number>;
    /**
     * Автоматическое создание пулов для валют
     */
    static createDefaultPools(): Promise<TransactionPool[]>;
    /**
     * Получение конфигурации пула по умолчанию
     */
    private static getDefaultPoolConfig;
}
/**
 * Инициализация модели TransactionPool
 */
export declare function initTransactionPool(sequelize: Sequelize): typeof TransactionPool;
export default TransactionPool;
