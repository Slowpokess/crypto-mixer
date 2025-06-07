import { Model, Sequelize, Optional } from 'sequelize';
import { CurrencyType, TransactionStatus } from '../types';
export interface OutputTransactionAttributes {
    id: string;
    mixRequestId: string;
    blockchainTransactionId?: string;
    currency: CurrencyType;
    amount: number;
    fee: number;
    status: TransactionStatus;
    fromAddress: string;
    toAddress: string;
    scheduledAt: Date;
    delayMinutes: number;
    processedAt?: Date;
    txid?: string;
    blockHeight?: number;
    confirmations: number;
    requiredConfirmations: number;
    outputIndex: number;
    totalOutputs: number;
    percentage: number;
    priority: number;
    retryCount: number;
    maxRetries: number;
    errorMessage?: string;
    isAnonymized: boolean;
    mixingRounds: number;
    anonymitySet: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface OutputTransactionCreationAttributes extends Optional<OutputTransactionAttributes, 'id' | 'confirmations' | 'outputIndex' | 'totalOutputs' | 'priority' | 'retryCount' | 'maxRetries' | 'isAnonymized' | 'mixingRounds' | 'anonymitySet' | 'createdAt' | 'updatedAt'> {
}
/**
 * Модель исходящей транзакции
 * Управление выводом средств после микширования
 */
export declare class OutputTransaction extends Model<OutputTransactionAttributes, OutputTransactionCreationAttributes> implements OutputTransactionAttributes {
    id: string;
    mixRequestId: string;
    blockchainTransactionId?: string;
    currency: CurrencyType;
    amount: number;
    fee: number;
    status: TransactionStatus;
    fromAddress: string;
    toAddress: string;
    scheduledAt: Date;
    delayMinutes: number;
    processedAt?: Date;
    txid?: string;
    blockHeight?: number;
    confirmations: number;
    requiredConfirmations: number;
    outputIndex: number;
    totalOutputs: number;
    percentage: number;
    priority: number;
    retryCount: number;
    maxRetries: number;
    errorMessage?: string;
    isAnonymized: boolean;
    mixingRounds: number;
    anonymitySet: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    /**
     * Проверка готовности к обработке
     */
    isReadyForProcessing(): boolean;
    /**
     * Проверка подтверждения транзакции
     */
    isConfirmed(): boolean;
    /**
     * Проверка возможности повтора
     */
    canRetry(): boolean;
    /**
     * Обновление статуса обработки
     */
    updateProcessingStatus(status: TransactionStatus, txid?: string, errorMessage?: string): Promise<void>;
    /**
     * Обновление подтверждений
     */
    updateConfirmations(confirmations: number, blockHeight?: number): Promise<void>;
    /**
     * Отметка неудачи с увеличением счетчика повторов
     */
    markAsFailed(errorMessage: string): Promise<void>;
    /**
     * Повторная обработка
     */
    retry(delayMinutes?: number): Promise<void>;
    /**
     * Расчет времени ожидания
     */
    getTimeUntilProcessing(): number;
    /**
     * Получение процента завершения
     */
    getCompletionPercentage(): number;
    /**
     * Проверка просроченности
     */
    isOverdue(maxDelayHours?: number): boolean;
    /**
     * Получение эффективной комиссии
     */
    getEffectiveFeeRate(): number;
    /**
     * Поиск транзакций готовых к обработке
     */
    static findReadyForProcessing(limit?: number): Promise<OutputTransaction[]>;
    /**
     * Поиск по запросу микширования
     */
    static findByMixRequest(mixRequestId: string): Promise<OutputTransaction[]>;
    /**
     * Поиск неподтвержденных транзакций для мониторинга
     */
    static findUnconfirmed(currency?: CurrencyType): Promise<OutputTransaction[]>;
    /**
     * Поиск просроченных транзакций
     */
    static findOverdue(maxDelayHours?: number): Promise<OutputTransaction[]>;
    /**
     * Поиск неудачных транзакций для повтора
     */
    static findForRetry(): Promise<OutputTransaction[]>;
    /**
     * Статистика по исходящим транзакциям
     */
    static getStatistics(currency?: CurrencyType): Promise<any>;
    /**
     * Групповое обновление статуса для запроса микширования
     */
    static updateStatusForMixRequest(mixRequestId: string, status: TransactionStatus): Promise<number>;
    /**
     * Получение общей статистики успешности
     */
    static getSuccessRate(timeFrame?: 'day' | 'week' | 'month'): Promise<{
        successRate: number;
        totalProcessed: number;
        successful: number;
        failed: number;
    }>;
    /**
     * Очистка старых записей
     */
    static cleanupOld(daysToKeep?: number): Promise<number>;
}
/**
 * Инициализация модели OutputTransaction
 */
export declare function initOutputTransaction(sequelize: Sequelize): typeof OutputTransaction;
export default OutputTransaction;
