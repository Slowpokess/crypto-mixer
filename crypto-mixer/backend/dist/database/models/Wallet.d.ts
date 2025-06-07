import { Model, Sequelize, Optional } from 'sequelize';
import { CurrencyType, WalletType, WalletStatus } from '../types';
export interface WalletAttributes {
    id: string;
    currency: CurrencyType;
    type: WalletType;
    status: WalletStatus;
    address: string;
    publicKey?: string;
    vaultKeyId?: string;
    keyAlgorithm?: string;
    isHSMKey?: boolean;
    derivationPath?: string;
    balance: number;
    reservedBalance: number;
    availableBalance: number;
    totalReceived: number;
    totalSent: number;
    transactionCount: number;
    minBalance: number;
    maxBalance: number;
    isMultisig: boolean;
    requiredSignatures?: number;
    label?: string;
    description?: string;
    tags?: string[];
    lastUsedAt?: Date;
    lastBalanceCheck?: Date;
    lastBalanceUpdate?: Date;
    lastTransactionHash?: string;
    usageCount: number;
    isActive: boolean;
    isLocked: boolean;
    isCompromised: boolean;
    compromisedAt?: Date;
    compromisedReason?: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface WalletCreationAttributes extends Optional<WalletAttributes, 'id' | 'balance' | 'reservedBalance' | 'availableBalance' | 'totalReceived' | 'totalSent' | 'transactionCount' | 'minBalance' | 'maxBalance' | 'isMultisig' | 'isCompromised' | 'usageCount' | 'isActive' | 'isLocked' | 'createdAt' | 'updatedAt'> {
}
/**
 * Модель кошелька
 * Управление всеми кошельками в системе микширования
 */
export declare class Wallet extends Model<WalletAttributes, WalletCreationAttributes> implements WalletAttributes {
    id: string;
    currency: CurrencyType;
    type: WalletType;
    status: WalletStatus;
    address: string;
    publicKey?: string;
    vaultKeyId?: string;
    keyAlgorithm?: string;
    isHSMKey?: boolean;
    derivationPath?: string;
    balance: number;
    reservedBalance: number;
    availableBalance: number;
    totalReceived: number;
    totalSent: number;
    transactionCount: number;
    minBalance: number;
    maxBalance: number;
    isMultisig: boolean;
    requiredSignatures?: number;
    label?: string;
    description?: string;
    tags?: string[];
    lastUsedAt?: Date;
    lastBalanceCheck?: Date;
    lastBalanceUpdate?: Date;
    lastTransactionHash?: string;
    usageCount: number;
    isActive: boolean;
    isLocked: boolean;
    isCompromised: boolean;
    compromisedAt?: Date;
    compromisedReason?: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    /**
     * Проверка доступности кошелька
     */
    isAvailable(): boolean;
    /**
     * Проверка достаточности баланса
     */
    hasSufficientBalance(amount: number): boolean;
    /**
     * Резервирование средств
     */
    reserveBalance(amount: number): Promise<boolean>;
    /**
     * Освобождение резерва
     */
    releaseReserve(amount: number): Promise<void>;
    /**
     * Обновление баланса
     */
    updateBalance(newBalance: number, updateReserved?: boolean): Promise<void>;
    /**
     * Отметка об использовании
     */
    markAsUsed(transactionHash?: string): Promise<void>;
    /**
     * Отметка как скомпрометированный
     */
    markAsCompromised(reason: string): Promise<void>;
    /**
     * Проверка лимитов баланса
     */
    checkBalanceLimits(): {
        withinLimits: boolean;
        belowMin: boolean;
        aboveMax: boolean;
    };
    /**
     * Получение статистики использования
     */
    getUsageStats(): {
        totalVolume: number;
        netBalance: number;
        utilizationRate: number;
        avgTransactionSize: number;
    };
    /**
     * Поиск доступных кошельков
     */
    static findAvailable(currency?: CurrencyType, type?: WalletType): Promise<Wallet[]>;
    /**
     * Поиск кошелька с достаточным балансом
     */
    static findWithSufficientBalance(currency: CurrencyType, amount: number, type?: WalletType): Promise<Wallet | null>;
    /**
     * Получение общего баланса по валюте
     */
    static getTotalBalance(currency: CurrencyType): Promise<{
        total: number;
        available: number;
        reserved: number;
        byType: Record<WalletType, number>;
    }>;
    /**
     * Поиск неиспользуемых кошельков
     */
    static findUnused(hours?: number): Promise<Wallet[]>;
    /**
     * Статистика по кошелькам
     */
    static getStatistics(): Promise<Record<CurrencyType, any>>;
}
/**
 * Инициализация модели Wallet
 */
export declare function initWallet(sequelize: Sequelize): typeof Wallet;
export default Wallet;
