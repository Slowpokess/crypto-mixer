/**
 * Оптимизированный менеджер пула соединений для устранения проблем производительности
 *
 * Особенности:
 * - Адаптивное управление размером пула
 * - Мониторинг здоровья соединений
 * - Graceful degradation при проблемах с БД
 * - Connection warming и предзагрузка
 * - Read/Write репликация support
 */
import { Sequelize } from 'sequelize';
import { EventEmitter } from 'events';
export interface ConnectionPoolConfig {
    minConnections: number;
    maxConnections: number;
    acquireTimeout: number;
    idleTimeout: number;
    evictTimeout: number;
    adaptivePooling: boolean;
    maxPoolSizeIncrease: number;
    poolSizeDecreaseThreshold: number;
    healthCheckInterval: number;
    healthCheckTimeout: number;
    maxRetries: number;
    enableReadReplicas: boolean;
    readReplicaUrls?: string[];
    readWriteRatio: number;
    warmupConnections: boolean;
    warmupSize: number;
}
export interface ConnectionStats {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingClients: number;
    totalRequests: number;
    failedRequests: number;
    averageAcquireTime: number;
    peakConnections: number;
    poolUtilization: number;
}
export interface HealthCheckResult {
    isHealthy: boolean;
    responseTime: number;
    errorMessage?: string;
    lastCheck: Date;
}
/**
 * Оптимизированный менеджер пула соединений
 */
export declare class ConnectionPoolManager extends EventEmitter {
    private masterPool;
    private readPools;
    private config;
    private stats;
    private healthStatus;
    private healthCheckTimer?;
    private adaptiveTimer?;
    private isShuttingDown;
    private acquireTimes;
    private readonly MAX_ACQUIRE_SAMPLES;
    constructor(databaseUrl: string, config?: Partial<ConnectionPoolConfig>);
    /**
     * Инициализация пулов соединений
     */
    private initializePools;
    /**
     * Прогрев соединений для улучшения initial response time
     */
    private warmupConnections;
    /**
     * Получение оптимального пула для запроса
     */
    getPool(isReadOnly?: boolean): Sequelize;
    /**
     * Получение статистики пула соединений
     */
    getPoolStats(): Promise<ConnectionStats>;
    /**
     * Выполнение транзакции с оптимальным пулом
     */
    executeTransaction<T>(callback: (transaction: any) => Promise<T>, isReadOnly?: boolean): Promise<T>;
    /**
     * Проверка здоровья соединений
     */
    private startHealthChecks;
    /**
     * Выполнение проверок здоровья
     */
    private performHealthChecks;
    /**
     * Проверка здоровья конкретного пула
     */
    private checkPoolHealth;
    /**
     * Адаптивное управление размером пула
     */
    private startAdaptivePooling;
    /**
     * Автоматическая настройка размера пула
     */
    private adjustPoolSize;
    /**
     * Изменение размера пула
     */
    private resizePool;
    /**
     * Запись времени получения соединения
     */
    private recordAcquireTime;
    /**
     * Расчет среднего времени получения соединения
     */
    private calculateAverageAcquireTime;
    /**
     * Получение детальной информации о здоровье
     */
    getHealthStatus(): Map<string, HealthCheckResult>;
    /**
     * Graceful shutdown всех пулов
     */
    shutdown(): Promise<void>;
    /**
     * Получение master пула напрямую (для миграций и административных задач)
     */
    getMasterPool(): Sequelize;
    /**
     * Форсированное переподключение всех пулов
     */
    reconnectAll(): Promise<void>;
}
export default ConnectionPoolManager;
