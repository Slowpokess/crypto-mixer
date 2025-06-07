import { EventEmitter } from 'events';
interface MixingSchedulerDependencies {
    database?: any;
    logger?: any;
    blockchainManager?: any;
    poolManager?: any;
    security?: any;
    config?: MixingSchedulerConfig;
}
interface MixingSchedulerConfig {
    minDelay?: number;
    maxDelay?: number;
    maxConcurrentOperations?: number;
    scheduleCheckInterval?: number;
    maxRetryAttempts?: number;
    retryBackoffMultiplier?: number;
    operationTTL?: number;
    batchSize?: number;
}
interface OperationType {
    priority: number;
    maxConcurrent: number;
}
interface ScheduledOperation {
    id: string;
    type: keyof OperationTypes;
    priority: number;
    scheduledTime: Date;
    payload: any;
    retryCount: number;
    maxRetries: number;
    createdAt: Date;
    mixId?: string;
    currency?: string;
    amount?: number;
    status: 'SCHEDULED' | 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}
interface OperationTypes {
    DISTRIBUTION: OperationType;
    CONSOLIDATION: OperationType;
    REBALANCING: OperationType;
    COINJOIN: OperationType;
    CLEANUP: OperationType;
}
interface DistributionPayload {
    mixId: string;
    toAddress: string;
    amount: number;
    currency: string;
    delay?: number;
}
interface SchedulerHealthCheck {
    healthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
        scheduler: {
            status: string;
            message: string;
        };
        operations: {
            status: string;
            message: string;
        };
        queue: {
            status: string;
            message: string;
        };
        performance: {
            status: string;
            message: string;
        };
    };
    details: {
        isRunning: boolean;
        scheduledOperations: number;
        activeOperations: number;
        queueLength: number;
        averageProcessingTime: number;
        successRate: number;
        operationLoad: number;
    };
    issues: string[];
}
/**
 * Планировщик операций микширования
 * Координирует временные задержки, распределяет нагрузку и управляет очередями
 */
declare class MixingScheduler extends EventEmitter {
    private database?;
    private logger?;
    private blockchainManager?;
    private poolManager?;
    private security?;
    private config;
    private state;
    private operationTypes;
    private readonly SCHEDULE_TIMER;
    private readonly EXECUTION_TIMER;
    private readonly CLEANUP_TIMER;
    private readonly METRICS_TIMER;
    constructor(dependencies?: MixingSchedulerDependencies);
    /**
     * Запускает планировщик
     */
    start(): Promise<void>;
    /**
     * Останавливает планировщик
     */
    stop(): Promise<void>;
    /**
     * Планирует операцию распределения средств
     */
    scheduleDistribution(payload: DistributionPayload): Promise<string>;
    /**
     * Планирует операцию консолидации
     */
    scheduleConsolidation(payload: any): Promise<string>;
    /**
     * Планирует операцию ребалансировки
     */
    scheduleRebalancing(payload: any): Promise<string>;
    /**
     * Получает статус операции
     */
    getOperationStatus(operationId: string): ScheduledOperation | null;
    /**
     * Отменяет запланированную операцию
     */
    cancelOperation(operationId: string): Promise<boolean>;
    /**
     * Получает текущий статус планировщика
     */
    getStatus(): any;
    /**
     * Проверка здоровья планировщика
     */
    healthCheck(): Promise<SchedulerHealthCheck>;
    private _loadScheduledOperations;
    private _startScheduleLoop;
    private _startExecutionLoop;
    private _startPeriodicTasks;
    private _clearAllTimers;
    private _waitForActiveOperations;
    private _saveScheduledOperations;
    private _scheduleOperation;
    private _processSchedule;
    private _processExecutionQueue;
    private _cleanupExpiredOperations;
    private _updateMetrics;
    private _calculateOperationLoad;
    private _calculateSuccessRate;
    private _calculateAverageProcessingTime;
    private _findStuckOperations;
    private _setupMemoryListeners;
    private _triggerEmergencyCleanup;
    private _clearAllOperationTimers;
    /**
     * Graceful shutdown with proper cleanup
     */
    shutdown(): Promise<void>;
}
export default MixingScheduler;
export { MixingScheduler };
export type { MixingSchedulerConfig, MixingSchedulerDependencies, ScheduledOperation, DistributionPayload, SchedulerHealthCheck };
