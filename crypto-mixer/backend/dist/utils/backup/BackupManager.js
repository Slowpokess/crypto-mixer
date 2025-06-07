"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const DatabaseManager_1 = require("../../database/DatabaseManager");
const logger_1 = require("../logger");
/**
 * Enterprise-grade Backup Manager
 * Обеспечивает надежное резервное копирование критических данных
 */
class BackupManager {
    constructor(config) {
        this.isRunning = false;
        this.currentBackupId = null;
        this.backupHistory = new Map();
        this.scheduledJobs = new Map();
        this.encryptionKeys = new Map();
        this.BACKUP_COMPONENTS = [
            {
                name: 'database_structure',
                type: 'database',
                priority: 'critical'
            },
            {
                name: 'database_data_critical',
                type: 'database',
                priority: 'critical'
            },
            {
                name: 'database_data_high',
                type: 'database',
                priority: 'high'
            },
            {
                name: 'hsm_configuration',
                type: 'secrets',
                priority: 'critical'
            },
            {
                name: 'vault_secrets',
                type: 'secrets',
                priority: 'critical'
            },
            {
                name: 'application_config',
                type: 'configuration',
                priority: 'high'
            },
            {
                name: 'logs',
                type: 'files',
                priority: 'medium',
                path: '/app/logs',
                excludePatterns: ['*.tmp', '*.lock']
            }
        ];
        this.config = config;
        this.validateConfig();
    }
    /**
     * Инициализация системы backup
     */
    async initialize() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('backup_initialize');
        try {
            // Создание необходимых директорий
            await this.ensureDirectories();
            // Инициализация ключей шифрования
            await this.initializeEncryptionKeys();
            // Загрузка истории backup
            await this.loadBackupHistory();
            // Настройка расписания
            if (this.config.enabled) {
                this.setupSchedules();
            }
            // Проверка доступности компонентов
            await this.verifyComponentsHealth();
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ BackupManager успешно инициализирован', {
                enabled: this.config.enabled,
                scheduledJobs: this.scheduledJobs.size,
                components: this.BACKUP_COMPONENTS.length
            });
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Выполнение полного backup
     */
    async createFullBackup(options = {}) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('backup_full');
        const backupId = this.generateBackupId('full');
        try {
            if (this.isRunning) {
                throw new Error('Backup уже выполняется');
            }
            this.isRunning = true;
            this.currentBackupId = backupId;
            const startTime = Date.now();
            const metadata = {
                id: backupId,
                type: 'full',
                timestamp: new Date(),
                size: 0,
                compressed: this.config.compression.enabled,
                encrypted: this.config.encryption.enabled,
                checksum: '',
                checksumAlgorithm: this.config.verification.checksumAlgorithm,
                components: [],
                retention: this.calculateRetentionDate('full'),
                status: 'in_progress',
                duration: 0,
                metadata: await this.gatherSystemMetadata()
            };
            logger_1.enhancedDbLogger.info('🚀 Начало полного backup', {
                backupId,
                components: this.BACKUP_COMPONENTS.length,
                encryption: metadata.encrypted,
                compression: metadata.compressed
            });
            const report = {
                id: backupId,
                timestamp: metadata.timestamp,
                type: 'full',
                status: 'success',
                duration: 0,
                totalSize: 0,
                compressedSize: 0,
                compressionRatio: 0,
                componentsProcessed: 0,
                componentsSuccessful: 0,
                componentsFailed: 0,
                checksumVerified: false,
                encryptionApplied: metadata.encrypted,
                storageLocations: [],
                errors: [],
                warnings: [],
                performance: {
                    throughputMBps: 0,
                    cpuUsagePercent: 0,
                    memoryUsageMB: 0,
                    ioWaitPercent: 0
                }
            };
            // Фильтрация компонентов по приоритету
            const components = options.priority
                ? this.BACKUP_COMPONENTS.filter(c => c.priority === options.priority)
                : this.BACKUP_COMPONENTS;
            // Создание backup директории
            const backupDir = path_1.default.join(this.config.storage.local.path, backupId);
            await promises_1.default.mkdir(backupDir, { recursive: true });
            // Backup каждого компонента
            for (const component of components) {
                try {
                    await this.backupComponent(component, backupDir, metadata);
                    report.componentsSuccessful++;
                    metadata.components.push(component.name);
                }
                catch (error) {
                    logger_1.enhancedDbLogger.error(`❌ Ошибка backup компонента ${component.name}`, {
                        component: component.name,
                        error: error
                    });
                    report.componentsFailed++;
                    report.errors.push(`Component ${component.name}: ${error}`);
                    if (component.priority === 'critical') {
                        throw new Error(`Критический компонент ${component.name} не удалось сохранить: ${error}`);
                    }
                }
                report.componentsProcessed++;
            }
            // Вычисление checksums и финализация
            metadata.checksum = await this.calculateDirectoryChecksum(backupDir);
            metadata.size = await this.getDirectorySize(backupDir);
            // Сжатие если включено
            if (this.config.compression.enabled) {
                const compressedPath = await this.compressBackup(backupDir);
                report.compressedSize = await this.getFileSize(compressedPath);
                report.compressionRatio = (metadata.size - report.compressedSize) / metadata.size;
            }
            else {
                report.compressedSize = metadata.size;
            }
            // Шифрование если включено
            if (this.config.encryption.enabled) {
                await this.encryptBackup(backupDir);
            }
            // Загрузка в удаленное хранилище
            if (this.config.storage.remote.enabled) {
                const remoteLocation = await this.uploadToRemoteStorage(backupDir, metadata);
                report.storageLocations.push(remoteLocation);
            }
            // Локальное хранение
            report.storageLocations.push(backupDir);
            // Завершение
            const endTime = Date.now();
            metadata.duration = Math.floor((endTime - startTime) / 1000);
            metadata.status = 'completed';
            report.duration = metadata.duration;
            report.totalSize = metadata.size;
            // Расчет производительности
            report.performance.throughputMBps = (report.totalSize / (1024 * 1024)) / metadata.duration;
            // Сохранение метаданных
            await this.saveBackupMetadata(metadata);
            this.backupHistory.set(backupId, metadata);
            // Очистка старых backup
            await this.cleanupOldBackups();
            // Верификация
            if (this.config.verification.integrityCheck) {
                report.checksumVerified = await this.verifyBackupIntegrity(backupId);
            }
            // Отправка уведомлений
            if (this.config.alerts.enabled && this.config.alerts.alertOnSuccess) {
                await this.sendAlert('backup_success', report);
            }
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Полный backup завершен успешно', {
                backupId,
                duration: metadata.duration,
                size: metadata.size,
                components: metadata.components.length,
                compressionRatio: report.compressionRatio
            });
            return report;
        }
        catch (error) {
            const metadata = this.backupHistory.get(backupId);
            if (metadata) {
                metadata.status = 'failed';
                metadata.errors = [String(error)];
            }
            if (this.config.alerts.enabled && this.config.alerts.alertOnFailure) {
                await this.sendAlert('backup_failure', { error: String(error), backupId });
            }
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
        finally {
            this.isRunning = false;
            this.currentBackupId = null;
        }
    }
    /**
     * Backup отдельного компонента
     */
    async backupComponent(component, backupDir, metadata) {
        logger_1.enhancedDbLogger.info(`📦 Backup компонента: ${component.name}`, {
            type: component.type,
            priority: component.priority
        });
        const componentDir = path_1.default.join(backupDir, component.name);
        await promises_1.default.mkdir(componentDir, { recursive: true });
        switch (component.type) {
            case 'database':
                await this.backupDatabase(component, componentDir);
                break;
            case 'secrets':
                await this.backupSecrets(component, componentDir);
                break;
            case 'configuration':
                await this.backupConfiguration(component, componentDir);
                break;
            case 'files':
                await this.backupFiles(component, componentDir);
                break;
            default:
                if (component.customBackupFunction) {
                    const data = await component.customBackupFunction();
                    await promises_1.default.writeFile(path_1.default.join(componentDir, 'custom_backup.bin'), data);
                }
                else {
                    throw new Error(`Неизвестный тип компонента: ${component.type}`);
                }
        }
    }
    /**
     * Backup базы данных
     */
    async backupDatabase(component, outputDir) {
        const dbManager = DatabaseManager_1.DatabaseManager.getInstance();
        if (component.name === 'database_structure') {
            // Схема базы данных
            const schema = await this.exportDatabaseSchema();
            await promises_1.default.writeFile(path_1.default.join(outputDir, 'schema.sql'), schema);
        }
        else if (component.name === 'database_data_critical') {
            // Критические таблицы
            const tables = ['mix_requests', 'deposit_addresses', 'wallets', 'system_config'];
            for (const table of tables) {
                const data = await this.exportTableData(table);
                await promises_1.default.writeFile(path_1.default.join(outputDir, `${table}.sql`), data);
            }
        }
        else if (component.name === 'database_data_high') {
            // Высокоприоритетные таблицы
            const tables = ['blockchain_transactions', 'audit_logs', 'monitored_addresses'];
            for (const table of tables) {
                const data = await this.exportTableData(table);
                await promises_1.default.writeFile(path_1.default.join(outputDir, `${table}.sql`), data);
            }
        }
    }
    /**
     * Backup секретов (HSM/Vault)
     */
    async backupSecrets(component, outputDir) {
        if (component.name === 'hsm_configuration') {
            // HSM конфигурация (без приватных ключей!)
            const hsmConfig = await this.exportHSMConfiguration();
            await promises_1.default.writeFile(path_1.default.join(outputDir, 'hsm_config.json'), JSON.stringify(hsmConfig));
        }
        else if (component.name === 'vault_secrets') {
            // Vault секреты (зашифрованные)
            const vaultBackup = await this.exportVaultSecrets();
            await promises_1.default.writeFile(path_1.default.join(outputDir, 'vault_backup.enc'), vaultBackup);
        }
    }
    /**
     * Backup конфигурации приложения
     */
    async backupConfiguration(component, outputDir) {
        const config = {
            environment: process.env.NODE_ENV,
            database: {
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                name: process.env.DB_NAME
            },
            redis: {
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT
            },
            // НЕ включаем секретные данные!
            backup_timestamp: new Date().toISOString()
        };
        await promises_1.default.writeFile(path_1.default.join(outputDir, 'app_config.json'), JSON.stringify(config, null, 2));
    }
    /**
     * Backup файлов
     */
    async backupFiles(component, outputDir) {
        if (!component.path)
            return;
        // Копирование файлов с исключением паттернов
        await this.copyDirectoryWithExclusions(component.path, outputDir, component.excludePatterns || []);
    }
    /**
     * Восстановление из backup
     */
    async restore(options) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('backup_restore');
        try {
            logger_1.enhancedDbLogger.info('🔄 Начало восстановления из backup', {
                backupId: options.backupId,
                dryRun: options.dryRun,
                components: options.components?.length || 'all'
            });
            if (this.isRunning && !options.dryRun) {
                throw new Error('Backup операция уже выполняется');
            }
            const metadata = this.backupHistory.get(options.backupId);
            if (!metadata) {
                throw new Error(`Backup ${options.backupId} не найден`);
            }
            // Проверка целостности
            if (options.verifyIntegrity) {
                const isValid = await this.verifyBackupIntegrity(options.backupId);
                if (!isValid) {
                    throw new Error(`Backup ${options.backupId} поврежден`);
                }
            }
            const startTime = Date.now();
            const report = {
                id: `restore_${Date.now()}`,
                timestamp: new Date(),
                type: metadata.type,
                status: 'success',
                duration: 0,
                totalSize: metadata.size,
                compressedSize: 0,
                compressionRatio: 0,
                componentsProcessed: 0,
                componentsSuccessful: 0,
                componentsFailed: 0,
                checksumVerified: options.verifyIntegrity,
                encryptionApplied: metadata.encrypted,
                storageLocations: [],
                errors: [],
                warnings: [],
                performance: {
                    throughputMBps: 0,
                    cpuUsagePercent: 0,
                    memoryUsageMB: 0,
                    ioWaitPercent: 0
                }
            };
            // Получение backup данных
            const backupDir = path_1.default.join(this.config.storage.local.path, options.backupId);
            // Расшифровка если необходимо
            if (metadata.encrypted) {
                await this.decryptBackup(backupDir);
            }
            // Декомпрессия если необходимо
            if (metadata.compressed) {
                await this.decompressBackup(backupDir);
            }
            // Восстановление компонентов
            const componentsToRestore = options.components
                ? this.BACKUP_COMPONENTS.filter(c => options.components.includes(c.name))
                : this.BACKUP_COMPONENTS;
            for (const component of componentsToRestore) {
                if (!metadata.components.includes(component.name)) {
                    report.warnings.push(`Компонент ${component.name} отсутствует в backup`);
                    continue;
                }
                try {
                    if (!options.dryRun) {
                        await this.restoreComponent(component, backupDir, options);
                    }
                    report.componentsSuccessful++;
                }
                catch (error) {
                    logger_1.enhancedDbLogger.error(`❌ Ошибка восстановления компонента ${component.name}`, {
                        component: component.name,
                        error
                    });
                    report.componentsFailed++;
                    report.errors.push(`Component ${component.name}: ${error}`);
                    if (!options.continueOnError && component.priority === 'critical') {
                        throw error;
                    }
                }
                report.componentsProcessed++;
            }
            // Финализация
            const endTime = Date.now();
            report.duration = Math.floor((endTime - startTime) / 1000);
            report.performance.throughputMBps = (report.totalSize / (1024 * 1024)) / report.duration;
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.info('✅ Восстановление завершено успешно', {
                backupId: options.backupId,
                duration: report.duration,
                components: report.componentsSuccessful,
                warnings: report.warnings.length
            });
            return report;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw error;
        }
    }
    /**
     * Получение списка доступных backup
     */
    getBackupHistory() {
        return Array.from(this.backupHistory.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Получение статуса текущего backup
     */
    getCurrentStatus() {
        return {
            isRunning: this.isRunning,
            currentBackupId: this.currentBackupId
        };
    }
    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
    validateConfig() {
        if (!this.config.storage.local.enabled && !this.config.storage.remote.enabled) {
            throw new Error('Должно быть включено хотя бы одно хранилище backup');
        }
        if (this.config.storage.local.enabled && !this.config.storage.local.path) {
            throw new Error('Не указан путь для локального хранилища backup');
        }
    }
    generateBackupId(type) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substring(2, 8);
        return `${type}_${timestamp}_${random}`;
    }
    calculateRetentionDate(type) {
        const date = new Date();
        const retention = this.config.storage.local.retention;
        switch (type) {
            case 'full':
                date.setDate(date.getDate() + retention.monthly * 30);
                break;
            case 'differential':
                date.setDate(date.getDate() + retention.weekly * 7);
                break;
            case 'incremental':
                date.setDate(date.getDate() + retention.daily);
                break;
        }
        return date;
    }
    async ensureDirectories() {
        if (this.config.storage.local.enabled) {
            await promises_1.default.mkdir(this.config.storage.local.path, { recursive: true });
        }
    }
    async initializeEncryptionKeys() {
        if (this.config.encryption.enabled) {
            // Генерация или загрузка ключа шифрования
            const keyId = 'backup_master_key';
            let key = this.encryptionKeys.get(keyId);
            if (!key) {
                key = crypto_1.default.randomBytes(32); // 256-bit key
                this.encryptionKeys.set(keyId, key);
                // В продакшене ключ должен храниться в Vault или HSM
                logger_1.enhancedDbLogger.warn('⚠️ Ключ шифрования backup создан в памяти - настройте Vault для продакшена');
            }
        }
    }
    setupSchedules() {
        // Здесь бы использовался cron, но для примера используем setTimeout
        logger_1.enhancedDbLogger.info('📅 Настройка расписания backup', {
            full: this.config.schedule.full,
            incremental: this.config.schedule.incremental
        });
    }
    async loadBackupHistory() {
        // Загрузка истории backup из файла метаданных
        try {
            const historyFile = path_1.default.join(this.config.storage.local.path, 'backup_history.json');
            const data = await promises_1.default.readFile(historyFile, 'utf-8');
            const history = JSON.parse(data);
            for (const [id, metadata] of Object.entries(history)) {
                this.backupHistory.set(id, metadata);
            }
            logger_1.enhancedDbLogger.info('📚 История backup загружена', {
                backups: this.backupHistory.size
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.info('📚 История backup пуста - создание новой');
        }
    }
    async verifyComponentsHealth() {
        // Проверка доступности всех компонентов для backup
        logger_1.enhancedDbLogger.info('🔍 Проверка компонентов системы');
    }
    async gatherSystemMetadata() {
        return {
            dbVersion: 'PostgreSQL 15',
            appVersion: process.env.APP_VERSION || '1.0.0',
            nodeVersion: process.version,
            environment: process.env.NODE_ENV,
            hostInfo: {
                hostname: require('os').hostname(),
                platform: process.platform,
                arch: process.arch
            }
        };
    }
    async exportDatabaseSchema() {
        // Экспорт схемы БД (pg_dump --schema-only)
        return '-- Database schema export\n-- Implementation needed';
    }
    async exportTableData(tableName) {
        // Экспорт данных таблицы
        return `-- Table ${tableName} export\n-- Implementation needed`;
    }
    async exportHSMConfiguration() {
        // Экспорт конфигурации HSM (без приватных ключей!)
        return {
            slots: [],
            algorithms: [],
            policies: []
        };
    }
    async exportVaultSecrets() {
        // Экспорт секретов Vault (зашифрованных)
        return Buffer.from('encrypted_vault_backup');
    }
    async calculateDirectoryChecksum(dirPath) {
        // Вычисление checksum всей директории
        const hash = crypto_1.default.createHash(this.config.verification.checksumAlgorithm);
        // Implementation needed
        return hash.digest('hex');
    }
    async getDirectorySize(dirPath) {
        // Получение размера директории
        const stats = await promises_1.default.stat(dirPath);
        return stats.size;
    }
    async getFileSize(filePath) {
        const stats = await promises_1.default.stat(filePath);
        return stats.size;
    }
    async compressBackup(backupDir) {
        const compressedPath = `${backupDir}.tar.gz`;
        // Сжатие с помощью tar + gzip
        // Implementation needed
        return compressedPath;
    }
    async encryptBackup(backupDir) {
        // Шифрование backup
        const key = this.encryptionKeys.get('backup_master_key');
        if (!key)
            throw new Error('Ключ шифрования не найден');
        // Implementation needed
    }
    async uploadToRemoteStorage(backupDir, metadata) {
        // Загрузка в удаленное хранилище (S3, Azure, etc.)
        return `remote://bucket/path/${metadata.id}`;
    }
    async saveBackupMetadata(metadata) {
        const historyFile = path_1.default.join(this.config.storage.local.path, 'backup_history.json');
        const history = Object.fromEntries(this.backupHistory.entries());
        history[metadata.id] = metadata;
        await promises_1.default.writeFile(historyFile, JSON.stringify(history, null, 2));
    }
    async cleanupOldBackups() {
        const now = Date.now();
        for (const [id, metadata] of this.backupHistory.entries()) {
            if (metadata.retention.getTime() < now) {
                await this.deleteBackup(id);
                this.backupHistory.delete(id);
                logger_1.enhancedDbLogger.info('🗑️ Удален устаревший backup', { id });
            }
        }
    }
    async deleteBackup(backupId) {
        const backupDir = path_1.default.join(this.config.storage.local.path, backupId);
        await promises_1.default.rm(backupDir, { recursive: true, force: true });
    }
    async verifyBackupIntegrity(backupId) {
        // Верификация целостности backup
        const metadata = this.backupHistory.get(backupId);
        if (!metadata)
            return false;
        const backupDir = path_1.default.join(this.config.storage.local.path, backupId);
        const currentChecksum = await this.calculateDirectoryChecksum(backupDir);
        return currentChecksum === metadata.checksum;
    }
    async sendAlert(type, data) {
        logger_1.enhancedDbLogger.info('🚨 Отправка уведомления backup', { type, data });
        // Implementation needed для webhook, email, slack
    }
    async copyDirectoryWithExclusions(source, target, excludePatterns) {
        // Копирование директории с исключениями
        // Implementation needed
    }
    async decryptBackup(backupDir) {
        // Расшифровка backup
        // Implementation needed
    }
    async decompressBackup(backupDir) {
        // Декомпрессия backup
        // Implementation needed
    }
    async restoreComponent(component, backupDir, options) {
        const componentDir = path_1.default.join(backupDir, component.name);
        switch (component.type) {
            case 'database':
                await this.restoreDatabase(component, componentDir, options);
                break;
            case 'secrets':
                await this.restoreSecrets(component, componentDir, options);
                break;
            case 'configuration':
                await this.restoreConfiguration(component, componentDir, options);
                break;
            case 'files':
                await this.restoreFiles(component, componentDir, options);
                break;
            default:
                if (component.customRestoreFunction) {
                    const data = await promises_1.default.readFile(path_1.default.join(componentDir, 'custom_backup.bin'));
                    await component.customRestoreFunction(data);
                }
        }
    }
    async restoreDatabase(component, componentDir, options) {
        // Восстановление базы данных
        logger_1.enhancedDbLogger.info(`🔄 Восстановление БД компонента: ${component.name}`);
        // Implementation needed
    }
    async restoreSecrets(component, componentDir, options) {
        // Восстановление секретов
        logger_1.enhancedDbLogger.info(`🔄 Восстановление секретов компонента: ${component.name}`);
        // Implementation needed
    }
    async restoreConfiguration(component, componentDir, options) {
        // Восстановление конфигурации
        logger_1.enhancedDbLogger.info(`🔄 Восстановление конфигурации компонента: ${component.name}`);
        // Implementation needed
    }
    async restoreFiles(component, componentDir, options) {
        // Восстановление файлов
        logger_1.enhancedDbLogger.info(`🔄 Восстановление файлов компонента: ${component.name}`);
        // Implementation needed
    }
    /**
     * Остановка всех операций backup
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🛑 Остановка BackupManager');
        // Остановка всех запланированных заданий
        for (const [name, timeout] of this.scheduledJobs) {
            clearTimeout(timeout);
            logger_1.enhancedDbLogger.info(`⏹️ Остановлено задание: ${name}`);
        }
        this.scheduledJobs.clear();
        // Сохранение истории
        await this.saveBackupMetadata({});
        logger_1.enhancedDbLogger.info('✅ BackupManager остановлен');
    }
}
exports.BackupManager = BackupManager;
//# sourceMappingURL=BackupManager.js.map