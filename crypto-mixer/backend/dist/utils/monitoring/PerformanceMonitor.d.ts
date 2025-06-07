import { EventEmitter } from 'events';
/**
 * Интерфейсы для метрик производительности
 */
export interface SystemMetrics {
    cpu: {
        usage: number;
        loadAverage: number[];
        cores: number;
        speed: number;
    };
    memory: {
        total: number;
        used: number;
        free: number;
        available: number;
        usage: number;
        swap: {
            total: number;
            used: number;
            free: number;
        };
    };
    disk: {
        usage: number;
        total: number;
        used: number;
        free: number;
        iops: {
            read: number;
            write: number;
        };
    };
    network: {
        bytesReceived: number;
        bytesSent: number;
        packetsReceived: number;
        packetsSent: number;
        errors: number;
    };
}
export interface ApplicationMetrics {
    requests: {
        total: number;
        perSecond: number;
        errorRate: number;
        averageResponseTime: number;
        percentiles: {
            p50: number;
            p95: number;
            p99: number;
        };
    };
    database: {
        connections: {
            active: number;
            idle: number;
            total: number;
        };
        queries: {
            total: number;
            perSecond: number;
            averageTime: number;
            slowQueries: number;
        };
        transactions: {
            total: number;
            perSecond: number;
            rollbacks: number;
        };
    };
    cache: {
        redis: {
            hitRate: number;
            missRate: number;
            evictions: number;
            memoryUsage: number;
            connections: number;
        };
    };
    queues: {
        rabbitmq: {
            messages: number;
            consumers: number;
            publishRate: number;
            consumeRate: number;
        };
    };
}
export interface BusinessMetrics {
    mixing: {
        operationsInProgress: number;
        operationsCompleted: number;
        operationsFailed: number;
        averageProcessingTime: number;
        totalVolume: {
            btc: number;
            eth: number;
            usdt: number;
            sol: number;
        };
        successRate: number;
    };
    wallets: {
        totalWallets: number;
        activeWallets: number;
        totalBalance: {
            btc: number;
            eth: number;
            usdt: number;
            sol: number;
        };
    };
    blockchain: {
        bitcoin: {
            connected: boolean;
            blockHeight: number;
            syncStatus: number;
            transactionPool: number;
        };
        ethereum: {
            connected: boolean;
            blockNumber: number;
            gasPrice: number;
            pendingTransactions: number;
        };
        solana: {
            connected: boolean;
            slot: number;
            epoch: number;
            transactionCount: number;
        };
    };
    security: {
        alertsActive: number;
        blockedTransactions: number;
        riskScore: number;
        amlChecks: number;
    };
}
export interface PerformanceSnapshot {
    timestamp: Date;
    system: SystemMetrics;
    application: ApplicationMetrics;
    business: BusinessMetrics;
    uptime: number;
    version: string;
}
export interface PerformanceConfig {
    enabled: boolean;
    collectInterval: number;
    retentionPeriod: number;
    prometheusEnabled: boolean;
    prometheusPort: number;
    alerting: {
        enabled: boolean;
        thresholds: {
            cpu: number;
            memory: number;
            disk: number;
            responseTime: number;
            errorRate: number;
        };
    };
    sampling: {
        enabled: boolean;
        rate: number;
    };
}
/**
 * Система мониторинга производительности для crypto-mixer
 * Собирает системные, приложенческие и бизнес-метрики
 */
export declare class PerformanceMonitor extends EventEmitter {
    private config;
    private isRunning;
    private collectInterval;
    private metricsHistory;
    private lastSnapshot;
    private requestCounter;
    private responseTimes;
    private errorCounter;
    private lastRequestTime;
    private lastCpuUsage;
    private lastNetworkStats;
    constructor(config?: Partial<PerformanceConfig>);
    /**
     * Запуск системы мониторинга производительности
     */
    start(): Promise<void>;
    /**
     * Остановка системы мониторинга
     */
    stop(): Promise<void>;
    /**
     * Сбор всех метрик производительности
     */
    private collectMetrics;
    /**
     * Сбор системных метрик
     */
    private collectSystemMetrics;
    /**
     * Сбор метрик приложения
     */
    private collectApplicationMetrics;
    /**
     * Сбор бизнес-метрик
     */
    private collectBusinessMetrics;
    /**
     * Вычисление процента использования CPU
     */
    private calculateCpuPercent;
    /**
     * Получение информации о swap
     */
    private getSwapInfo;
    /**
     * Получение информации о диске
     */
    private getDiskInfo;
    /**
     * Получение информации о сети
     */
    private getNetworkInfo;
    /**
     * Получение метрик базы данных
     */
    private getDatabaseMetrics;
    /**
     * Получение метрик Redis
     */
    private getRedisMetrics;
    /**
     * Получение метрик RabbitMQ
     */
    private getRabbitMQMetrics;
    /**
     * Получение метрик микширования
     */
    private getMixingMetrics;
    /**
     * Получение метрик кошельков
     */
    private getWalletMetrics;
    /**
     * Получение метрик блокчейнов
     */
    private getBlockchainMetrics;
    /**
     * Получение метрик безопасности
     */
    private getSecurityMetrics;
    /**
     * Вычисление перцентиля
     */
    private getPercentile;
    /**
     * Очистка старых метрик
     */
    private cleanupOldMetrics;
    /**
     * Проверка пороговых значений и отправка алертов
     */
    private checkThresholds;
    /**
     * Запуск Prometheus endpoint
     */
    private startPrometheusEndpoint;
    /**
     * Запись запроса для метрик
     */
    recordRequest(responseTime: number, isError?: boolean): void;
    /**
     * Получение последнего снимка метрик
     */
    getLastSnapshot(): PerformanceSnapshot | null;
    /**
     * Получение истории метрик
     */
    getMetricsHistory(limit?: number): PerformanceSnapshot[];
    /**
     * Получение метрик за определенный период
     */
    getMetricsByTimeRange(startTime: Date, endTime: Date): PerformanceSnapshot[];
    /**
     * Получение агрегированных метрик
     */
    getAggregatedMetrics(period: 'hour' | 'day' | 'week'): any;
    /**
     * Экспорт метрик в различных форматах
     */
    exportMetrics(format: 'json' | 'csv' | 'prometheus'): string;
    /**
     * Получение статуса работы монитора
     */
    isActive(): boolean;
    /**
     * Получение конфигурации
     */
    getConfig(): PerformanceConfig;
    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig: Partial<PerformanceConfig>): void;
}
export default PerformanceMonitor;
