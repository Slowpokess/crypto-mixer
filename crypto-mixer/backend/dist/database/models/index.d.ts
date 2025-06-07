import { Sequelize } from 'sequelize';
export { MixRequest } from './MixRequest';
export { Wallet } from './Wallet';
export { BlockchainTransaction } from './BlockchainTransaction';
export { TransactionPool } from './TransactionPool';
export { OutputTransaction } from './OutputTransaction';
export { MonitoredAddress } from './MonitoredAddress';
export { AuditLog } from './AuditLog';
export { SystemConfig } from './SystemConfig';
export { default as DepositAddress } from './DepositAddress';
export type { MixRequestAttributes, MixRequestCreationAttributes } from './MixRequest';
export type { WalletAttributes, WalletCreationAttributes } from './Wallet';
export type { BlockchainTransactionAttributes, BlockchainTransactionCreationAttributes } from './BlockchainTransaction';
export type { TransactionPoolAttributes, TransactionPoolCreationAttributes } from './TransactionPool';
export type { OutputTransactionAttributes, OutputTransactionCreationAttributes } from './OutputTransaction';
export type { MonitoredAddressAttributes, MonitoredAddressCreationAttributes } from './MonitoredAddress';
export type { AuditLogAttributes, AuditLogCreationAttributes } from './AuditLog';
export type { SystemConfigAttributes, SystemConfigCreationAttributes } from './SystemConfig';
/**
 * Инициализация всех моделей базы данных
 * @param sequelizeInstance - экземпляр Sequelize
 * @returns объект с инициализированными моделями
 */
declare const initializeModels: (sequelizeInstance: Sequelize) => Promise<{
    [key: string]: any;
}>;
declare const getModels: () => {
    [key: string]: any;
};
declare const getModel: (modelName: string) => any;
/**
 * Инициализация базовых данных системы
 * @param models - объект с инициализированными моделями
 */
declare const initializeSystemData: () => Promise<void>;
/**
 * Проверка целостности базы данных
 */
declare const validateDatabaseIntegrity: () => Promise<string[]>;
export { initializeModels, getModels, getModel, initializeSystemData, validateDatabaseIntegrity };
declare const _default: {
    initializeModels: (sequelizeInstance: Sequelize) => Promise<{
        [key: string]: any;
    }>;
    getModels: () => {
        [key: string]: any;
    };
    getModel: (modelName: string) => any;
    initializeSystemData: () => Promise<void>;
    validateDatabaseIntegrity: () => Promise<string[]>;
};
export default _default;
