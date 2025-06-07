import { BackupConfig } from './BackupManager';
import { DisasterRecoveryConfig } from './DisasterRecoveryManager';
import { BackupMonitoringConfig } from './BackupMonitoring';
/**
 * Конфигурация интегрированной системы backup
 */
export interface IntegratedBackupSystemConfig {
    backup: BackupConfig;
    disasterRecovery: DisasterRecoveryConfig;
    monitoring: BackupMonitoringConfig;
    dashboard: {
        enabled: boolean;
        port: number;
    };
    integration: {
        autoStart: boolean;
        gracefulShutdownTimeout: number;
        healthCheckEnabled: boolean;
        healthCheckInterval: number;
    };
}
/**
 * Статус интегрированной системы
 */
export interface SystemStatus {
    overall: 'healthy' | 'warning' | 'critical' | 'down';
    components: {
        backupManager: 'running' | 'stopped' | 'error';
        disasterRecovery: 'running' | 'stopped' | 'error';
        monitoring: 'running' | 'stopped' | 'error';
        dashboard: 'running' | 'stopped' | 'error';
    };
    lastHealthCheck: Date;
    uptime: number;
    errors: string[];
}
/**
 * Интегрированная система Backup и Disaster Recovery
 * Объединяет все компоненты в единое решение enterprise-уровня
 */
export declare class IntegratedBackupSystem {
    private config;
    private backupManager;
    private drManager;
    private monitoring;
    private dashboard;
    private isInitialized;
    private isRunning;
    private startTime;
    private healthCheckInterval;
    private lastHealthCheck;
    private systemErrors;
    constructor(config: IntegratedBackupSystemConfig);
    /**
     * Инициализация всей системы
     */
    initialize(): Promise<void>;
    /**
     * Запуск всех компонентов системы
     */
    start(): Promise<void>;
    /**
     * Остановка всех компонентов системы
     */
    stop(): Promise<void>;
    /**
     * Перезапуск системы
     */
    restart(): Promise<void>;
    /**
     * Получение статуса системы
     */
    getSystemStatus(): SystemStatus;
    /**
     * Проверка готовности системы
     */
    isReady(): boolean;
    /**
     * Получение времени работы в секундах
     */
    getUptime(): number;
    /**
     * Создание backup через интегрированную систему
     */
    createBackup(options?: {
        priority?: string;
    }): Promise<any>;
    /**
     * Выполнение восстановления через интегрированную систему
     */
    performRecovery(planId: string, options?: {
        dryRun?: boolean;
    }): Promise<any>;
    private setupEventHandlers;
    private initializeBackupManager;
    private initializeDisasterRecoveryManager;
    private initializeMonitoring;
    private initializeDashboard;
    private startMonitoring;
    private startDisasterRecovery;
    private startDashboard;
    private startSystemHealthCheck;
    private performSystemHealthCheck;
    private stopMonitoring;
    private stopDisasterRecovery;
    private stopDashboard;
    private stopBackupManager;
    private calculateOverallStatus;
    private getComponentsStatus;
}
/**
 * Factory функция для создания настроенной системы backup
 */
export declare function createIntegratedBackupSystem(customConfig?: Partial<IntegratedBackupSystemConfig>): IntegratedBackupSystem;
