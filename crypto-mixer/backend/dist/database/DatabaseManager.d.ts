import { Sequelize, QueryTypes } from 'sequelize';
import { EventEmitter } from 'events';
import * as winston from 'winston';
interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    dialect: 'postgres';
    ssl?: boolean;
    pool?: {
        max: number;
        min: number;
        acquire: number;
        idle: number;
    };
    logging?: boolean | ((sql: string, timing?: number) => void);
    dialectOptions?: {
        ssl?: {
            require: boolean;
            rejectUnauthorized: boolean;
        };
    };
}
interface ConnectionPoolInfo {
    size: number;
    used: number;
    waiting: number;
}
interface DatabaseStats {
    connections: ConnectionPoolInfo;
    activeQueries: number;
    totalQueries: number;
    avgQueryTime: number;
    lastQuery: Date | null;
    uptime: number;
    errors: number;
    reconnects: number;
}
interface HealthCheckResult {
    status: 'healthy' | 'warning' | 'critical';
    timestamp: Date;
    latency: number;
    connectionPool: ConnectionPoolInfo;
    details: {
        canConnect: boolean;
        canQuery: boolean;
        canWrite: boolean;
        diskSpace?: number;
        version?: string;
    };
    errors?: string[];
}
/**
 * Production-ready Database Manager с connection pooling, мониторингом и auto-reconnect
 */
export declare class DatabaseManager extends EventEmitter {
    private sequelize;
    private config;
    private logger;
    private isConnected;
    private connectionRetries;
    private maxRetries;
    private retryDelay;
    private startTime;
    private stats;
    private queryTimes;
    private reconnectTimer;
    private healthCheckTimer;
    constructor(config: DatabaseConfig, logger?: winston.Logger);
    /**
     * Инициализация подключения к базе данных
     */
    initialize(): Promise<void>;
    /**
     * Тестирование подключения к базе данных
     */
    testConnection(): Promise<void>;
    /**
     * Получение экземпляра Sequelize
     */
    getSequelize(): Sequelize;
    /**
     * Выполнение параметризованного SQL запроса с защитой от SQL injection
     */
    query<T = any>(sql: string, replacements?: Record<string, any>, options?: {
        type?: QueryTypes;
        transaction?: any;
        raw?: boolean;
        nest?: boolean;
    }): Promise<T>;
    /**
     * Безопасное выполнение модифицирующих SQL запросов
     */
    executeModifyingQuery<T = any>(sql: string, replacements?: Record<string, any>, options?: {
        type: QueryTypes.INSERT | QueryTypes.UPDATE | QueryTypes.DELETE | QueryTypes.BULKUPDATE | QueryTypes.BULKDELETE;
        transaction?: any;
        confirmOperation: boolean;
    }): Promise<T>;
    /**
     * Валидация SQL запроса для предотвращения injection атак
     */
    private validateSqlQuery;
    /**
     * Валидация параметров замены
     */
    private validateReplacements;
    /**
     * Выполнение транзакции
     */
    transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
    /**
     * Проверка здоровья базы данных
     */
    healthCheck(): Promise<HealthCheckResult>;
    /**
     * Получение статистики базы данных
     */
    getStats(): DatabaseStats;
    /**
     * Подключение к базе данных (алиас для initialize)
     */
    connect(): Promise<void>;
    /**
     * Отключение от базы данных (алиас для close)
     */
    disconnect(): Promise<void>;
    /**
     * Получение статуса здоровья БД (алиас для healthCheck)
     */
    getHealthStatus(): Promise<HealthCheckResult>;
    /**
     * Закрытие соединения (алиас для shutdown)
     */
    close(): Promise<void>;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    private setupEventHandlers;
    private createQueryLogger;
    private beforeQueryHook;
    private afterQueryHook;
    private updateQueryStats;
    private getConnectionPoolInfo;
    private handleConnectionError;
    private startHealthChecks;
}
export default DatabaseManager;
export type { DatabaseConfig, DatabaseStats, HealthCheckResult, ConnectionPoolInfo };
