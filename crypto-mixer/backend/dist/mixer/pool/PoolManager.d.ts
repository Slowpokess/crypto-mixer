import { EventEmitter } from 'events';
interface PoolManagerDependencies {
    database?: any;
    logger?: any;
    security?: any;
    blockchainManager?: any;
    config?: PoolManagerConfig;
}
interface PoolManagerConfig {
    minPoolSizes?: CurrencyAmounts;
    maxPoolSizes?: CurrencyAmounts;
    targetPoolSizes?: CurrencyAmounts;
    maxPoolAge?: number;
    rebalanceInterval?: number;
    minMixParticipants?: number;
    maxIntermediateAddresses?: number;
}
interface CurrencyAmounts {
    BTC?: number;
    ETH?: number;
    USDT?: number;
    SOL?: number;
}
type CurrencyType = 'BTC' | 'ETH' | 'USDT' | 'SOL';
interface PoolData {
    currency: CurrencyType;
    totalAmount: number;
    availableAmount: number;
    lockedAmount: number;
    transactions: PoolTransaction[];
    intermediateAddresses: string[];
    lastRebalance: Date;
    utilizationRate: number;
    averageAge: number;
}
interface PoolTransaction {
    id: string;
    amount: number;
    address: string;
    timestamp: Date;
    status: 'PENDING' | 'CONFIRMED' | 'MIXED' | 'DISTRIBUTED';
    mixGroupId?: string;
}
interface PoolStatistics {
    currency: CurrencyType;
    size: number;
    utilization: number;
    participants: number;
    averageTransactionSize: number;
    lastActivity: Date;
    healthScore: number;
}
interface PoolHealthCheck {
    healthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    pools: {
        [key in CurrencyType]?: {
            status: string;
            message: string;
            size: number;
            utilization: number;
        };
    };
    details: {
        totalPools: number;
        activePools: number;
        totalLiquidity: Map<CurrencyType, number>;
        averageUtilization: number;
        queueLength: number;
    };
    issues: string[];
}
/**
 * Система управления пулами ликвидности для микширования
 * Обеспечивает эффективное распределение и смешивание средств
 */
declare class PoolManager extends EventEmitter {
    private database?;
    private logger?;
    private security?;
    private blockchainManager?;
    private config;
    private pools;
    private intermediateAddresses;
    private mixingQueues;
    private rebalanceTimers;
    private metrics;
    private isMonitoring;
    private monitoringInterval?;
    private optimizationInterval?;
    constructor(dependencies?: PoolManagerDependencies);
    /**
     * Запускает мониторинг пулов
     */
    startMonitoring(): Promise<void>;
    /**
     * Останавливает мониторинг пулов
     */
    stopMonitoring(): Promise<void>;
    /**
     * Добавляет средства в пул
     */
    addToPool(request: any): Promise<void>;
    /**
     * Обрабатывает часть микширования
     */
    processMixingChunk(chunk: any, sessionId: string): Promise<void>;
    /**
     * Получает статистику пула для валюты
     */
    getPoolStatistics(currency: CurrencyType): Promise<PoolStatistics>;
    /**
     * Получает общую статистику всех пулов
     */
    getOverallStatistics(): any;
    /**
     * Проверка здоровья пулов
     */
    healthCheck(): Promise<PoolHealthCheck>;
    private _initializePools;
    private _loadPoolData;
    private _savePoolData;
    private _startPoolMonitoring;
    private _startPoolOptimization;
    private _getOrCreatePool;
    private _checkMixingReadiness;
    private _addToMixingQueue;
    private _triggerMixing;
    private _monitorPools;
    private _optimizePools;
    private _checkRebalanceNeed;
    private _scheduleRebalance;
    private _rebalancePool;
    private _optimizePool;
    private _updateAverageUtilization;
    private _calculatePoolHealth;
}
export default PoolManager;
export { PoolManager };
export type { PoolManagerConfig, PoolManagerDependencies, PoolData, PoolStatistics, PoolHealthCheck, CurrencyType };
