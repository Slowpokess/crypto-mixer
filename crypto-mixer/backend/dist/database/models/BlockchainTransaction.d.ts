import { Model, Sequelize, Optional } from 'sequelize';
import { CurrencyType, TransactionStatus, TransactionInput, TransactionOutput } from '../types';
export interface BlockchainTransactionAttributes {
    id: string;
    mixRequestId?: string;
    txid: string;
    currency: CurrencyType;
    status: TransactionStatus;
    type: 'INPUT' | 'OUTPUT' | 'INTERNAL';
    amount: number;
    fee: number;
    feeRate?: number;
    blockHeight?: number;
    blockHash?: string;
    confirmations: number;
    requiredConfirmations: number;
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
    inputsCount: number;
    outputsCount: number;
    fromAddress?: string;
    toAddress?: string;
    broadcastedAt?: Date;
    confirmedAt?: Date;
    estimatedConfirmationTime?: Date;
    rawTransaction?: string;
    hexData?: string;
    size: number;
    vsize?: number;
    weight?: number;
    nonce?: number;
    gasPrice?: number;
    gasLimit?: number;
    gasUsed?: number;
    lastCheckedAt?: Date;
    checkCount: number;
    errorMessage?: string;
    retryCount: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface BlockchainTransactionCreationAttributes extends Optional<BlockchainTransactionAttributes, 'id' | 'confirmations' | 'inputsCount' | 'outputsCount' | 'size' | 'checkCount' | 'retryCount' | 'createdAt' | 'updatedAt'> {
}
/**
 * Модель блокчейн транзакции
 * Отслеживание всех транзакций в блокчейне для микширования
 */
export declare class BlockchainTransaction extends Model<BlockchainTransactionAttributes, BlockchainTransactionCreationAttributes> implements BlockchainTransactionAttributes {
    id: string;
    mixRequestId?: string;
    txid: string;
    currency: CurrencyType;
    status: TransactionStatus;
    type: 'INPUT' | 'OUTPUT' | 'INTERNAL';
    amount: number;
    fee: number;
    feeRate?: number;
    blockHeight?: number;
    blockHash?: string;
    confirmations: number;
    requiredConfirmations: number;
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
    inputsCount: number;
    outputsCount: number;
    fromAddress?: string;
    toAddress?: string;
    broadcastedAt?: Date;
    confirmedAt?: Date;
    estimatedConfirmationTime?: Date;
    rawTransaction?: string;
    hexData?: string;
    size: number;
    vsize?: number;
    weight?: number;
    nonce?: number;
    gasPrice?: number;
    gasLimit?: number;
    gasUsed?: number;
    lastCheckedAt?: Date;
    checkCount: number;
    errorMessage?: string;
    retryCount: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    /**
     * Проверка подтверждения транзакции
     */
    isConfirmed(): boolean;
    /**
     * Проверка нахождения в мемпуле
     */
    isInMempool(): boolean;
    /**
     * Получение процента подтверждений
     */
    getConfirmationProgress(): number;
    /**
     * Обновление количества подтверждений
     */
    updateConfirmations(confirmations: number, blockHeight?: number, blockHash?: string): Promise<void>;
    /**
     * Отметка об ошибке
     */
    markAsFailed(errorMessage: string): Promise<void>;
    /**
     * Отметка о трансляции
     */
    markAsBroadcasted(): Promise<void>;
    /**
     * Получение эффективности комиссии
     */
    getFeeEfficiency(): number;
    /**
     * Расчет времени до подтверждения
     */
    getEstimatedConfirmationTime(): Date | null;
    /**
     * Получение среднего времени блока для валюты
     */
    private getAverageBlockTime;
    /**
     * Получение всех адресов транзакции
     */
    getAllAddresses(): string[];
    /**
     * Проверка принадлежности адреса к транзакции
     */
    containsAddress(address: string): boolean;
    /**
     * Получение суммы для конкретного адреса
     */
    getAmountForAddress(address: string): {
        received: number;
        sent: number;
    };
    /**
     * Поиск по txid
     */
    static findByTxid(txid: string): Promise<BlockchainTransaction | null>;
    /**
     * Поиск неподтвержденных транзакций
     */
    static findUnconfirmed(currency?: CurrencyType): Promise<BlockchainTransaction[]>;
    /**
     * Поиск транзакций для мониторинга
     */
    static findForMonitoring(limit?: number): Promise<BlockchainTransaction[]>;
    /**
     * Поиск по адресу
     */
    static findByAddress(address: string, currency?: CurrencyType): Promise<BlockchainTransaction[]>;
    /**
     * Статистика по транзакциям
     */
    static getStatistics(currency?: CurrencyType): Promise<any>;
    /**
     * Очистка старых транзакций
     */
    static cleanupOld(daysToKeep?: number): Promise<number>;
}
/**
 * Инициализация модели BlockchainTransaction
 */
export declare function initBlockchainTransaction(sequelize: Sequelize): typeof BlockchainTransaction;
export default BlockchainTransaction;
