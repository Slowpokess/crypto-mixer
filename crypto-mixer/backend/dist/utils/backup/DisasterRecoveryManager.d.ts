import { BackupManager } from './BackupManager';
/**
 * Типы и интерфейсы для Disaster Recovery
 */
export interface DisasterRecoveryConfig {
    enabled: boolean;
    autoRecovery: {
        enabled: boolean;
        triggers: {
            databaseFailure: boolean;
            applicationCrash: boolean;
            dataCorruption: boolean;
            serviceUnavailable: boolean;
            manualTrigger: boolean;
        };
        thresholds: {
            healthCheckFailures: number;
            responseTimeMs: number;
            errorRate: number;
            memoryUsagePercent: number;
            diskUsagePercent: number;
        };
        cooldownPeriod: number;
        maxRetries: number;
    };
    recoveryPlan: RecoveryPlan[];
    monitoring: {
        healthCheckInterval: number;
        alertThresholds: {
            warning: number;
            critical: number;
            emergency: number;
        };
        escalation: {
            level1: string[];
            level2: string[];
            level3: string[];
        };
    };
    validation: {
        postRecoveryChecks: boolean;
        dataIntegrityValidation: boolean;
        serviceHealthValidation: boolean;
        performanceValidation: boolean;
        timeoutMinutes: number;
    };
    failover: {
        enabled: boolean;
        primaryDatacenter: string;
        secondaryDatacenter: string;
        automaticFailover: boolean;
        manualApprovalRequired: boolean;
        replicationLag: number;
    };
}
export interface RecoveryPlan {
    id: string;
    name: string;
    priority: number;
    triggerConditions: string[];
    dependencies: string[];
    estimatedRTO: number;
    estimatedRPO: number;
    steps: RecoveryStep[];
    rollbackSteps?: RecoveryStep[];
    validationSteps: ValidationStep[];
}
export interface RecoveryStep {
    id: string;
    name: string;
    type: 'command' | 'api_call' | 'database_restore' | 'service_restart' | 'configuration' | 'custom';
    command?: string;
    parameters?: Record<string, any>;
    timeout: number;
    retryCount: number;
    continueOnFailure: boolean;
    rollbackOnFailure: boolean;
    description: string;
    customFunction?: () => Promise<void>;
}
export interface ValidationStep {
    id: string;
    name: string;
    type: 'health_check' | 'database_query' | 'api_test' | 'performance_test' | 'data_integrity';
    endpoint?: string;
    query?: string;
    expectedResult?: any;
    timeout: number;
    description: string;
    customValidator?: () => Promise<boolean>;
}
export interface DisasterEvent {
    id: string;
    timestamp: Date;
    type: 'database_failure' | 'application_crash' | 'data_corruption' | 'service_unavailable' | 'manual';
    severity: 'warning' | 'critical' | 'emergency';
    description: string;
    affectedComponents: string[];
    detectedBy: string;
    symptoms: string[];
    rootCause?: string;
    resolution?: string;
    recoveryPlanExecuted?: string;
    metadata: {
        errorLogs: string[];
        systemMetrics: any;
        userImpact: string;
        businessImpact: string;
    };
}
export interface RecoveryExecution {
    id: string;
    disasterEventId: string;
    planId: string;
    startTime: Date;
    endTime?: Date;
    status: 'initiated' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
    currentStep?: string;
    completedSteps: string[];
    failedSteps: string[];
    stepResults: Map<string, any>;
    errors: string[];
    warnings: string[];
    validationResults: Map<string, boolean>;
    totalDuration?: number;
    achievedRTO?: number;
    achievedRPO?: number;
}
export interface SystemHealthStatus {
    overall: 'healthy' | 'degraded' | 'critical' | 'down';
    components: {
        database: ComponentHealth;
        application: ComponentHealth;
        blockchain: ComponentHealth;
        backup: ComponentHealth;
        monitoring: ComponentHealth;
    };
    metrics: {
        uptime: number;
        responseTime: number;
        errorRate: number;
        throughput: number;
        memoryUsage: number;
        diskUsage: number;
        cpuUsage: number;
    };
    lastChecked: Date;
    alerts: string[];
}
export interface ComponentHealth {
    status: 'healthy' | 'degraded' | 'critical' | 'down';
    lastChecked: Date;
    responseTime?: number;
    errorCount: number;
    details: string;
}
/**
 * Enterprise Disaster Recovery Manager
 * Автоматическое обнаружение катастроф и восстановление системы
 */
export declare class DisasterRecoveryManager {
    private config;
    private backupManager;
    private isMonitoring;
    private monitoringInterval;
    private activeRecoveries;
    private disasterHistory;
    private recoveryPlans;
    private lastHealthCheck;
    private consecutiveFailures;
    private lastRecoveryTime;
    constructor(config: DisasterRecoveryConfig, backupManager: BackupManager);
    /**
     * Инициализация Disaster Recovery системы
     */
    initialize(): Promise<void>;
    /**
     * Выполнение проверки здоровья системы
     */
    performHealthCheck(): Promise<SystemHealthStatus>;
    /**
     * Обнаружение и обработка катастрофы
     */
    detectAndHandleDisaster(health: SystemHealthStatus): Promise<void>;
    /**
     * Запуск автоматического восстановления
     */
    triggerAutoRecovery(disaster: DisasterEvent): Promise<void>;
    /**
     * Выполнение плана восстановления
     */
    executeRecoveryPlan(plan: RecoveryPlan, disaster: DisasterEvent): Promise<RecoveryExecution>;
    /**
     * Выполнение шага восстановления
     */
    private executeRecoveryStep;
    /**
     * Валидация успешности восстановления
     */
    private validateRecovery;
    /**
     * Откат изменений при неудачном восстановлении
     */
    private executeRollback;
    /**
     * Мануальное восстановление
     */
    manualRecovery(planId: string, options?: {
        dryRun?: boolean;
    }): Promise<RecoveryExecution>;
    /**
     * Получение статуса системы
     */
    getSystemStatus(): {
        health: SystemHealthStatus | null;
        activeRecoveries: RecoveryExecution[];
        recentDisasters: DisasterEvent[];
        isMonitoring: boolean;
    };
    private loadRecoveryPlans;
    private validateConfiguration;
    private startMonitoring;
    private checkDatabaseHealth;
    private checkApplicationHealth;
    private checkBlockchainHealth;
    private checkBackupHealth;
    private checkMonitoringHealth;
    private identifyDisasters;
    private shouldTriggerAutoRecovery;
    private selectRecoveryPlan;
    private executeDatabaseRestore;
    private executeServiceRestart;
    private executeConfiguration;
    private executeCommand;
    private executeApiCall;
    private executeValidationStep;
    private sendDisasterAlert;
    private delay;
    /**
     * Остановка Disaster Recovery системы
     */
    shutdown(): Promise<void>;
}
