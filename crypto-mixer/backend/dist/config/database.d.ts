/**
 * Конфигурация подключения к базе данных для crypto-mixer backend
 * Поддерживает различные окружения: development, production, test
 * Использует переменные окружения для безопасного хранения учетных данных
 */
import { Sequelize, Options, Transaction } from 'sequelize';
interface PoolConfig {
    max: number;
    min: number;
    acquire: number;
    idle: number;
    evict?: number;
}
interface DialectOptions {
    ssl?: boolean | {
        require: boolean;
        rejectUnauthorized: boolean;
    };
    connectTimeout: number;
    requestTimeout: number;
}
interface DefineOptions {
    timestamps: boolean;
    createdAt: string;
    updatedAt: string;
    underscored: boolean;
    freezeTableName: boolean;
}
interface SyncOptions {
    force: boolean;
    alter: boolean;
}
interface DatabaseConfig extends Options {
    host?: string;
    port: number;
    database?: string;
    username?: string;
    password?: string;
    dialect: 'postgres';
    logging: boolean | ((sql: string, timing?: number) => void);
    pool: PoolConfig;
    dialectOptions: DialectOptions;
    define: DefineOptions;
    transactionType?: typeof Transaction.TYPES[keyof typeof Transaction.TYPES];
    isolationLevel: Transaction.ISOLATION_LEVELS;
    sync: SyncOptions;
    benchmark?: boolean;
    logQueryParameters?: boolean;
}
interface AllConfigs {
    development: DatabaseConfig;
    test: DatabaseConfig;
    production: DatabaseConfig;
}
declare const createConnection: () => Sequelize;
declare const currentConfig: DatabaseConfig;
declare const allConfigs: AllConfigs;
export default currentConfig;
export { allConfigs as all, createConnection };
