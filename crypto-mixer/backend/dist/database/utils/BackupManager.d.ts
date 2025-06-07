import { Sequelize } from 'sequelize';
export interface BackupConfig {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    backupDir: string;
    retentionDays: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
    encryptionKey?: string;
}
export interface BackupInfo {
    filename: string;
    filepath: string;
    size: number;
    timestamp: Date;
    compressed: boolean;
    encrypted: boolean;
    checksum: string;
}
/**
 * Менеджер резервных копий PostgreSQL
 * Автоматическое создание, шифрование и ротация бэкапов
 */
export declare class BackupManager {
    private config;
    private sequelize;
    private scheduledJobs;
    constructor(sequelize: Sequelize, config?: Partial<BackupConfig>);
    /**
     * Создание директории для бэкапов
     */
    private ensureBackupDirectory;
    /**
     * Создание полного бэкапа базы данных
     */
    createFullBackup(description?: string): Promise<BackupInfo>;
    /**
     * Создание инкрементального бэкапа
     */
    createIncrementalBackup(baseBackup?: string): Promise<BackupInfo>;
    /**
     * Восстановление из бэкапа
     */
    restoreFromBackup(backupFilepath: string, targetDatabase?: string): Promise<void>;
    /**
     * Проверка целостности бэкапа
     */
    verifyBackup(backupFilepath: string): Promise<boolean>;
    /**
     * Настройка автоматических бэкапов
     */
    scheduleBackups(schedule: {
        full?: string;
        incremental?: string;
    }): void;
    /**
     * Остановка запланированных задач
     */
    stopScheduledBackups(): void;
    /**
     * Очистка старых бэкапов
     */
    cleanupOldBackups(): Promise<number>;
    /**
     * Получение списка доступных бэкапов
     */
    listBackups(): BackupInfo[];
    /**
     * Безопасное выполнение команд с валидацией
     */
    private executeCommand;
    /**
     * Валидация команды для предотвращения command injection
     */
    private validateCommand;
    /**
     * Валидация аргументов команды
     */
    private validateCommandArgs;
    private compressFile;
    private decompressFile;
    private encryptFile;
    private decryptFile;
    private calculateChecksum;
    private saveBackupMetadata;
    private getBackupMetadata;
    private getBackupMetadataSync;
    private getBackupTimestamp;
    private generateIncrementalQueries;
    private listBackupFiles;
    private createTestDatabase;
    private dropTestDatabase;
    private validateRestoredTables;
    /**
     * Валидация путей файлов для предотвращения path traversal
     */
    private validateFilePath;
    /**
     * Валидация строковых параметров
     */
    private validateStringParam;
    /**
     * Валидация ключа шифрования
     */
    private validateEncryptionKey;
    /**
     * Валидация имени таблицы
     */
    private validateTableName;
    private formatBytes;
}
export default BackupManager;
