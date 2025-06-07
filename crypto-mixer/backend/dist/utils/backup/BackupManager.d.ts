/**
 * Типы и интерфейсы для системы backup
 */
export interface BackupConfig {
    enabled: boolean;
    storage: {
        local: {
            enabled: boolean;
            path: string;
            maxFiles: number;
            retention: {
                daily: number;
                weekly: number;
                monthly: number;
            };
        };
        remote: {
            enabled: boolean;
            type: 'aws-s3' | 'azure-blob' | 'gcp-storage' | 'sftp';
            credentials: Record<string, any>;
            bucket?: string;
            region?: string;
            encryption: boolean;
        };
    };
    schedule: {
        full: string;
        incremental: string;
        differential: string;
    };
    compression: {
        enabled: boolean;
        level: number;
        algorithm: 'gzip' | 'brotli' | 'lz4';
    };
    encryption: {
        enabled: boolean;
        algorithm: 'aes-256-gcm' | 'chacha20-poly1305';
        keyRotation: boolean;
        keyRotationDays: number;
    };
    verification: {
        checksumAlgorithm: 'sha256' | 'sha512' | 'blake3';
        integrityCheck: boolean;
        testRestore: boolean;
        testRestoreFrequency: number;
    };
    alerts: {
        enabled: boolean;
        webhookUrl?: string;
        emailRecipients?: string[];
        slackChannel?: string;
        alertOnFailure: boolean;
        alertOnSuccess: boolean;
        alertOnLongDuration: boolean;
        maxDurationMinutes: number;
    };
}
export interface BackupMetadata {
    id: string;
    type: 'full' | 'incremental' | 'differential';
    timestamp: Date;
    size: number;
    compressed: boolean;
    encrypted: boolean;
    checksum: string;
    checksumAlgorithm: string;
    components: string[];
    retention: Date;
    status: 'in_progress' | 'completed' | 'failed' | 'corrupted';
    duration: number;
    errors?: string[];
    metadata: {
        dbVersion: string;
        appVersion: string;
        nodeVersion: string;
        environment: string;
        hostInfo: any;
    };
}
export interface BackupComponent {
    name: string;
    type: 'database' | 'files' | 'configuration' | 'secrets';
    priority: 'critical' | 'high' | 'medium' | 'low';
    path?: string;
    excludePatterns?: string[];
    customBackupFunction?: () => Promise<Buffer>;
    customRestoreFunction?: (data: Buffer) => Promise<void>;
}
export interface RestoreOptions {
    backupId: string;
    components?: string[];
    targetTimestamp?: Date;
    verifyIntegrity: boolean;
    dryRun: boolean;
    continueOnError: boolean;
    restoreLocation?: string;
}
export interface BackupReport {
    id: string;
    timestamp: Date;
    type: 'full' | 'incremental' | 'differential';
    status: 'success' | 'partial' | 'failed';
    duration: number;
    totalSize: number;
    compressedSize: number;
    compressionRatio: number;
    componentsProcessed: number;
    componentsSuccessful: number;
    componentsFailed: number;
    checksumVerified: boolean;
    encryptionApplied: boolean;
    storageLocations: string[];
    errors: string[];
    warnings: string[];
    performance: {
        throughputMBps: number;
        cpuUsagePercent: number;
        memoryUsageMB: number;
        ioWaitPercent: number;
    };
}
/**
 * Enterprise-grade Backup Manager
 * Обеспечивает надежное резервное копирование критических данных
 */
export declare class BackupManager {
    private config;
    private isRunning;
    private currentBackupId;
    private backupHistory;
    private scheduledJobs;
    private encryptionKeys;
    private readonly BACKUP_COMPONENTS;
    constructor(config: BackupConfig);
    /**
     * Инициализация системы backup
     */
    initialize(): Promise<void>;
    /**
     * Выполнение полного backup
     */
    createFullBackup(options?: {
        priority?: string;
    }): Promise<BackupReport>;
    /**
     * Backup отдельного компонента
     */
    private backupComponent;
    /**
     * Backup базы данных
     */
    private backupDatabase;
    /**
     * Backup секретов (HSM/Vault)
     */
    private backupSecrets;
    /**
     * Backup конфигурации приложения
     */
    private backupConfiguration;
    /**
     * Backup файлов
     */
    private backupFiles;
    /**
     * Восстановление из backup
     */
    restore(options: RestoreOptions): Promise<BackupReport>;
    /**
     * Получение списка доступных backup
     */
    getBackupHistory(): BackupMetadata[];
    /**
     * Получение статуса текущего backup
     */
    getCurrentStatus(): {
        isRunning: boolean;
        currentBackupId: string | null;
        progress?: number;
    };
    private validateConfig;
    private generateBackupId;
    private calculateRetentionDate;
    private ensureDirectories;
    private initializeEncryptionKeys;
    private setupSchedules;
    private loadBackupHistory;
    private verifyComponentsHealth;
    private gatherSystemMetadata;
    private exportDatabaseSchema;
    private exportTableData;
    private exportHSMConfiguration;
    private exportVaultSecrets;
    private calculateDirectoryChecksum;
    private getDirectorySize;
    private getFileSize;
    private compressBackup;
    private encryptBackup;
    private uploadToRemoteStorage;
    private saveBackupMetadata;
    private cleanupOldBackups;
    private deleteBackup;
    private verifyBackupIntegrity;
    private sendAlert;
    private copyDirectoryWithExclusions;
    private decryptBackup;
    private decompressBackup;
    private restoreComponent;
    private restoreDatabase;
    private restoreSecrets;
    private restoreConfiguration;
    private restoreFiles;
    /**
     * Остановка всех операций backup
     */
    shutdown(): Promise<void>;
}
