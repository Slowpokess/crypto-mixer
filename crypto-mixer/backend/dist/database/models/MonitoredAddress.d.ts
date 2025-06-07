import { Model, Sequelize, Optional } from 'sequelize';
import { CurrencyType } from '../types';
export interface MonitoredAddressAttributes {
    id: string;
    currency: CurrencyType;
    address: string;
    type: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL';
    balance: number;
    lastBalance: number;
    balanceChangeThreshold: number;
    isActive: boolean;
    lastCheckedAt?: Date;
    lastTransactionAt?: Date;
    lastTransactionHash?: string;
    checkIntervalMinutes: number;
    alertOnBalance: boolean;
    alertOnTransactions: boolean;
    webhookUrl?: string;
    notificationEmail?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export interface MonitoredAddressCreationAttributes extends Optional<MonitoredAddressAttributes, 'id' | 'balance' | 'lastBalance' | 'balanceChangeThreshold' | 'isActive' | 'checkIntervalMinutes' | 'alertOnBalance' | 'alertOnTransactions' | 'createdAt' | 'updatedAt'> {
}
export declare class MonitoredAddress extends Model<MonitoredAddressAttributes, MonitoredAddressCreationAttributes> implements MonitoredAddressAttributes {
    id: string;
    currency: CurrencyType;
    address: string;
    type: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL';
    balance: number;
    lastBalance: number;
    balanceChangeThreshold: number;
    isActive: boolean;
    lastCheckedAt?: Date;
    lastTransactionAt?: Date;
    lastTransactionHash?: string;
    checkIntervalMinutes: number;
    alertOnBalance: boolean;
    alertOnTransactions: boolean;
    webhookUrl?: string;
    notificationEmail?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly deletedAt?: Date;
    needsCheck(): boolean;
    updateBalance(newBalance: number, transactionHash?: string): Promise<void>;
    private sendBalanceAlert;
    static findForMonitoring(): Promise<MonitoredAddress[]>;
    static findByType(type: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL'): Promise<MonitoredAddress[]>;
}
export declare function initMonitoredAddress(sequelize: Sequelize): typeof MonitoredAddress;
export default MonitoredAddress;
