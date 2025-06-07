/**
 * Мощный Redis Connection Manager для продакшн криптомиксера
 *
 * Обеспечивает:
 * - Connection pooling с автоматическим масштабированием
 * - Cluster support для высокой доступности
 * - Automatic failover и reconnection
 * - Health monitoring и performance metrics
 * - Read/Write splitting для оптимизации
 */
import Redis, { Cluster } from 'ioredis';
import { EventEmitter } from 'events';
export interface RedisConnectionConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    enableCluster: boolean;
    clusterNodes?: Array<{
        host: string;
        port: number;
    }>;
    maxConnections: number;
    minConnections: number;
    connectionTimeout: number;
    commandTimeout: number;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
    enableReadWriteSplit: boolean;
    readOnlyNodes?: Array<{
        host: string;
        port: number;
    }>;
    readWriteRatio: number;
    enableHealthChecks: boolean;
    healthCheckInterval: number;
    healthCheckTimeout: number;
    enableKeepAlive: boolean;
    enableCompression: boolean;
    lazyConnect: boolean;
    enableOfflineQueue: boolean;
    enableAutomaticFailover: boolean;
    failoverTimeout: number;
    maxFailoverAttempts: number;
}
export interface RedisConnectionStats {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    failedConnections: number;
    commandsExecuted: number;
    commandsFailed: number;
    averageResponseTime: number;
    memoryUsage: number;
    hitRate: number;
    uptime: number;
}
export interface RedisHealthStatus {
    isHealthy: boolean;
    responseTime: number;
    memoryUsage: number;
    connectedClients: number;
    lastError?: string;
    clusterStatus?: string;
    replicationStatus?: string;
}
/**
 * Продвинутый Redis Connection Manager
 */
export declare class RedisConnectionManager extends EventEmitter {
    private config;
    private masterConnection?;
    private readConnections;
    private writeConnection?;
    private connectionPool;
    private isConnected;
    private isShuttingDown;
    private stats;
    private healthStatus;
    private responseTimes;
    private healthCheckTimer?;
    private currentMasterIndex;
    private failoverInProgress;
    private failoverAttempts;
    constructor(config?: Partial<RedisConnectionConfig>);
    /**
     * Подключение к Redis с полной инициализацией
     */
    connect(): Promise<void>;
    /**
     * Подключение к Redis Cluster
     */
    private connectToCluster;
    /**
     * Подключение к одиночному Redis инстансу
     */
    private connectToSingleInstance;
    /**
     * Настройка Read/Write splitting
     */
    private setupReadWriteSplitting;
    /**
     * Инициализация connection pool
     */
    private initializeConnectionPool;
    /**
     * Настройка обработчиков событий соединения
     */
    private setupConnectionEventHandlers;
    /**
     * Получение оптимального соединения для операции
     */
    getConnection(isReadOperation?: boolean): Redis | Cluster;
    /**
     * Выполнение команды с мониторингом производительности
     */
    executeCommand(command: string, args: any[], isReadOperation?: boolean): Promise<any>;
    /**
     * Запуск мониторинга здоровья
     */
    private startHealthMonitoring;
    /**
     * Проверка здоровья Redis
     */
    private performHealthCheck;
    /**
     * Попытка failover при проблемах с соединением
     */
    private attemptFailover;
    /**
     * Переподключение к Redis
     */
    private reconnect;
    /**
     * Запись времени ответа для статистики
     */
    private recordResponseTime;
    /**
     * Обработка ошибок соединения
     */
    private handleConnectionError;
    /**
     * Парсинг использования памяти из Redis INFO
     */
    private parseMemoryUsage;
    /**
     * Парсинг количества подключенных клиентов
     */
    private parseConnectedClients;
    /**
     * Парсинг статуса кластера
     */
    private parseClusterStatus;
    /**
     * Получение статистики соединений
     */
    getConnectionStats(): RedisConnectionStats;
    /**
     * Получение статуса здоровья
     */
    getHealthStatus(): RedisHealthStatus;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default RedisConnectionManager;
