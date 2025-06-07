/**
 * Менеджер восстановления критических данных
 *
 * Обеспечивает:
 * - Восстановление критических данных микширования
 * - Проверка целостности данных и транзакций
 * - Автоматическое восстановление при сбоях
 * - Backup и rollback процедуры
 * - Мониторинг состояния данных
 */
import { Sequelize } from 'sequelize';
import { BackupManager } from './BackupManager';
import { EventEmitter } from 'events';
export interface RecoveryOptions {
    enableIntegrityChecks: boolean;
    integrityCheckInterval: number;
    enableAutoRecovery: boolean;
    maxRecoveryAttempts: number;
    recoveryDelay: number;
    createRecoveryBackups: boolean;
    backupRetentionDays: number;
    enableContinuousMonitoring: boolean;
    monitoringInterval: number;
    maxInconsistentRecords: number;
    maxBalanceDiscrepancy: number;
}
export interface DataIntegrityReport {
    timestamp: Date;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    issues: IntegrityIssue[];
    recommendedActions: string[];
}
export interface IntegrityIssue {
    type: 'BALANCE_MISMATCH' | 'ORPHANED_RECORD' | 'STATUS_INCONSISTENCY' | 'MISSING_RELATION' | 'DUPLICATE_ADDRESS';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    affectedRecords: string[];
    suggestedFix: string;
    autoFixable: boolean;
}
export interface RecoveryOperation {
    id: string;
    type: 'INTEGRITY_CHECK' | 'AUTO_RECOVERY' | 'MANUAL_RECOVERY' | 'BACKUP_RESTORE';
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    details: any;
}
/**
 * Менеджер восстановления данных
 */
export declare class DataRecoveryManager extends EventEmitter {
    private sequelize;
    private backupManager;
    private config;
    private integrityTimer?;
    private monitoringTimer?;
    private activeOperations;
    private isShuttingDown;
    constructor(sequelize: Sequelize, backupManager: BackupManager, config?: Partial<RecoveryOptions>);
    /**
     * Запуск регулярных проверок целостности
     */
    private startIntegrityChecks;
    /**
     * Запуск непрерывного мониторинга
     */
    private startContinuousMonitoring;
    /**
     * Комплексная проверка целостности данных
     */
    performIntegrityCheck(): Promise<DataIntegrityReport>;
    /**
     * Проверка балансов кошельков
     */
    private checkWalletBalances;
    /**
     * Проверка связности данных микширования
     */
    private checkMixRequestRelations;
    /**
     * Проверка консистентности статусов
     */
    private checkStatusConsistency;
    /**
     * Проверка дублирующихся адресов
     */
    private checkDuplicateAddresses;
    /**
     * Проверка orphaned записей
     */
    private checkOrphanedRecords;
    /**
     * Автоматическое восстановление
     */
    private performAutoRecovery;
    /**
     * Применение автоматического исправления
     */
    private applyAutoFix;
    /**
     * Исправление отсутствующих связей
     */
    private fixMissingRelation;
    /**
     * Исправление orphaned записей
     */
    private fixOrphanedRecord;
    /**
     * Исправление несоответствий статусов
     */
    private fixStatusInconsistency;
    /**
     * Исправление дублирующихся адресов
     */
    private fixDuplicateAddress;
    /**
     * Быстрая проверка здоровья системы
     */
    private performQuickHealthCheck;
    /**
     * Генерация рекомендаций на основе найденных проблем
     */
    private generateRecommendations;
    /**
     * Получение активных операций восстановления
     */
    getActiveOperations(): RecoveryOperation[];
    /**
     * Ручной запуск восстановления конкретной проблемы
     */
    manualRecovery(issueId: string, customFix?: string): Promise<void>;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default DataRecoveryManager;
