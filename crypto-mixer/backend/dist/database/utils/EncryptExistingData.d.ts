import { Sequelize } from 'sequelize';
import { DataEncryptionManager } from './DataEncryption';
/**
 * Утилита для миграции существующих чувствительных данных в зашифрованном виде
 * Переносит открытые данные в зашифрованные поля с возможностью отката
 */
export declare class ExistingDataEncryptionMigrator {
    private sequelize;
    private encryptionManager;
    private batchSize;
    private dryRun;
    constructor(sequelize: Sequelize, encryptionManager?: DataEncryptionManager, options?: {
        batchSize?: number;
        dryRun?: boolean;
    });
    /**
     * Полная миграция всех чувствительных данных
     */
    migrateAllSensitiveData(): Promise<{
        success: boolean;
        totalRecords: number;
        migratedRecords: number;
        errors: any[];
    }>;
    /**
     * Миграция данных таблицы mix_requests
     */
    private migrateMixRequestsData;
    /**
     * Миграция данных таблицы audit_logs
     */
    private migrateAuditLogsData;
    /**
     * Миграция данных для конкретной таблицы
     */
    private migrateTableData;
    /**
     * Миграция одного batch-а записей
     */
    private migrateBatch;
    /**
     * Обновление метаданных миграции
     */
    private updateMigrationMetadata;
    /**
     * Проверка статуса миграции
     */
    getMigrationStatus(): Promise<{
        completed: boolean;
        progress: Record<string, any>;
        summary: {
            totalTables: number;
            completedTables: number;
            totalFields: number;
            completedFields: number;
            totalRecords: number;
            migratedRecords: number;
        };
    }>;
    /**
     * Откат миграции (расшифровка и восстановление исходных данных)
     */
    rollbackMigration(tableName?: string): Promise<{
        success: boolean;
        restoredRecords: number;
        errors: any[];
    }>;
    /**
     * Откат данных для конкретной таблицы
     */
    private rollbackTableData;
}
export default ExistingDataEncryptionMigrator;
