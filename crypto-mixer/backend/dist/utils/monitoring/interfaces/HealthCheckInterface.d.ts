/**
 * Универсальный интерфейс для Health Check во всех сервисах crypto-mixer
 * Обеспечивает единообразную реализацию проверок состояния
 */
export interface HealthCheckStatus {
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    timestamp: string;
    service: string;
    version?: string;
    uptime: number;
    details: {
        database?: DatabaseHealthDetails;
        cache?: CacheHealthDetails;
        blockchain?: BlockchainHealthDetails;
        messageQueue?: MessageQueueHealthDetails;
        vault?: VaultHealthDetails;
        hsm?: HSMHealthDetails;
        dependencies?: DependencyHealthDetails[];
        custom?: Record<string, any>;
    };
    responseTime: number;
    environment: string;
}
export interface DatabaseHealthDetails {
    connected: boolean;
    responseTime: number;
    activeConnections: number;
    maxConnections: number;
    lastQuery: string;
    version?: string;
    replicationLag?: number;
}
export interface CacheHealthDetails {
    connected: boolean;
    responseTime: number;
    memoryUsage: number;
    hitRatio: number;
    evictions: number;
    version?: string;
}
export interface BlockchainHealthDetails {
    connectedNodes: number;
    syncStatus: 'synced' | 'syncing' | 'not_synced';
    lastBlockHeight: number;
    pendingTransactions: number;
    responseTime: number;
    currencies: {
        [currency: string]: {
            connected: boolean;
            lastBlock: number;
            balance: string;
            pendingTxs: number;
        };
    };
}
export interface MessageQueueHealthDetails {
    connected: boolean;
    queues: {
        [queueName: string]: {
            messages: number;
            consumers: number;
            ready: number;
            unacked: number;
        };
    };
    channels: number;
    version?: string;
    responseTime?: number;
}
export interface VaultHealthDetails {
    sealed: boolean;
    standby: boolean;
    version: string;
    responseTime: number;
    lastAuthentication?: string;
}
export interface HSMHealthDetails {
    connected: boolean;
    sessions: number;
    slots: {
        [slotId: string]: {
            connected: boolean;
            label: string;
            keyCount: number;
            serialNumber?: string;
            manufacturerId?: string;
            firmwareVersion?: string;
            freeMemory?: number;
            totalMemory?: number;
            error?: string;
        };
    };
    version?: string;
    responseTime?: number;
    cryptoTestPassed?: boolean;
    libraryPath?: string;
    capabilities?: string[];
    error?: string;
}
export interface DependencyHealthDetails {
    service: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    responseTime: number;
    lastChecked: string;
    error?: string;
}
export interface HealthCheckConfig {
    enabledChecks: {
        database: boolean;
        cache: boolean;
        blockchain: boolean;
        messageQueue: boolean;
        vault: boolean;
        hsm: boolean;
        dependencies: boolean;
    };
    timeouts: {
        database: number;
        cache: number;
        blockchain: number;
        messageQueue: number;
        vault: number;
        hsm: number;
        dependencies: number;
    };
    intervals: {
        healthCheck: number;
        metricsCollection: number;
    };
    thresholds: {
        responseTime: {
            warning: number;
            critical: number;
        };
        memoryUsage: {
            warning: number;
            critical: number;
        };
        diskUsage: {
            warning: number;
            critical: number;
        };
        cpuUsage: {
            warning: number;
            critical: number;
        };
    };
}
/**
 * Абстрактный базовый класс для реализации Health Check в сервисах
 */
export declare abstract class BaseHealthChecker {
    protected serviceName: string;
    protected version: string;
    protected startTime: Date;
    protected config: HealthCheckConfig;
    constructor(serviceName: string, version: string, config?: Partial<HealthCheckConfig>);
    /**
     * Основной метод для получения полного статуса здоровья сервиса
     */
    getHealthStatus(): Promise<HealthCheckStatus>;
    /**
     * Выполнение всех настроенных проверок здоровья
     */
    protected performHealthChecks(): Promise<HealthCheckStatus['details']>;
    /**
     * Определение общего статуса на основе результатов проверок
     */
    protected determineOverallStatus(details: HealthCheckStatus['details']): 'healthy' | 'warning' | 'critical' | 'unknown';
    /**
     * Получение времени работы сервиса в секундах
     */
    protected getUptime(): number;
    /**
     * Построение конфигурации по умолчанию
     */
    protected buildDefaultConfig(partialConfig?: Partial<HealthCheckConfig>): HealthCheckConfig;
    protected abstract checkDatabase(): Promise<DatabaseHealthDetails>;
    protected abstract checkCache(): Promise<CacheHealthDetails>;
    protected abstract checkBlockchain(): Promise<BlockchainHealthDetails>;
    protected abstract checkMessageQueue(): Promise<MessageQueueHealthDetails>;
    protected abstract checkVault(): Promise<VaultHealthDetails>;
    protected abstract checkHSM(): Promise<HSMHealthDetails>;
    protected abstract checkDependencies(): Promise<DependencyHealthDetails[]>;
    protected abstract performCustomChecks(): Promise<Record<string, any>>;
}
/**
 * Утилитарные функции для работы с health checks
 */
export declare class HealthCheckUtils {
    /**
     * Создание стандартного HTTP endpoint для health check
     */
    static createHealthEndpoint(healthChecker: BaseHealthChecker): (_req: any, res: any) => Promise<void>;
    /**
     * Проверка HTTP сервиса с таймаутом
     */
    static checkHttpService(url: string, timeout?: number, expectedStatus?: number): Promise<{
        status: boolean;
        responseTime: number;
        httpStatus?: number;
        error?: string;
    }>;
    /**
     * Проверка TCP порта
     */
    static checkTcpPort(host: string, port: number, timeout?: number): Promise<{
        status: boolean;
        responseTime: number;
        error?: string;
    }>;
    /**
     * Форматирование времени работы
     */
    static formatUptime(uptimeSeconds: number): string;
    /**
     * Получение системных метрик
     */
    static getSystemMetrics(): Promise<{
        cpu: number;
        memory: {
            used: number;
            total: number;
            percentage: number;
        };
        disk: {
            used: number;
            total: number;
            percentage: number;
        };
        network: {
            bytesIn: number;
            bytesOut: number;
        };
    }>;
}
