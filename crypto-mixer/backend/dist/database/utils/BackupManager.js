"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupManager = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cron = __importStar(require("node-cron"));
/**
 * Менеджер резервных копий PostgreSQL
 * Автоматическое создание, шифрование и ротация бэкапов
 */
class BackupManager {
    constructor(sequelize, config = {}) {
        this.scheduledJobs = new Map();
        this.sequelize = sequelize;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'crypto_mixer',
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            backupDir: process.env.BACKUP_DIR || './backups',
            retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
            compressionEnabled: process.env.BACKUP_COMPRESSION === 'true',
            encryptionEnabled: process.env.BACKUP_ENCRYPTION === 'true',
            encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
            ...config
        };
        this.ensureBackupDirectory();
    }
    /**
     * Создание директории для бэкапов
     */
    ensureBackupDirectory() {
        if (!fs_1.default.existsSync(this.config.backupDir)) {
            fs_1.default.mkdirSync(this.config.backupDir, { recursive: true });
            console.log(`📁 Created backup directory: ${this.config.backupDir}`);
        }
    }
    /**
     * Создание полного бэкапа базы данных
     */
    async createFullBackup(description) {
        try {
            console.log('🔄 Starting full database backup...');
            const timestamp = new Date();
            const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-').split('T')[0];
            const filename = `${this.config.database}_full_${timestampStr}.sql`;
            const filepath = path_1.default.join(this.config.backupDir, filename);
            // БЕЗОПАСНОСТЬ: Валидация путей
            this.validateFilePath(filepath);
            // Создаем бэкап с помощью pg_dump с безопасными аргументами
            const dumpArgs = [
                '-h', this.validateStringParam(this.config.host),
                '-p', this.validateStringParam(this.config.port.toString()),
                '-U', this.validateStringParam(this.config.username),
                '-d', this.validateStringParam(this.config.database),
                '--verbose',
                '--clean',
                '--if-exists',
                '--create',
                '--format=custom',
                '--no-password',
                '-f', filepath
            ];
            // Устанавливаем переменную окружения для пароля
            const env = { ...process.env, PGPASSWORD: this.config.password };
            await this.executeCommand('pg_dump', dumpArgs, { env });
            let finalFilepath = filepath;
            let compressed = false;
            let encrypted = false;
            // Сжатие (если включено)
            if (this.config.compressionEnabled) {
                finalFilepath = await this.compressFile(filepath);
                compressed = true;
                fs_1.default.unlinkSync(filepath); // Удаляем несжатый файл
            }
            // Шифрование (если включено)
            if (this.config.encryptionEnabled && this.config.encryptionKey) {
                finalFilepath = await this.encryptFile(finalFilepath);
                encrypted = true;
                fs_1.default.unlinkSync(compressed ? finalFilepath.replace('.enc', '') : filepath);
            }
            // Получаем информацию о файле
            const stats = fs_1.default.statSync(finalFilepath);
            const checksum = await this.calculateChecksum(finalFilepath);
            const backupInfo = {
                filename: path_1.default.basename(finalFilepath),
                filepath: finalFilepath,
                size: stats.size,
                timestamp,
                compressed,
                encrypted,
                checksum
            };
            // Сохраняем метаданные
            await this.saveBackupMetadata(backupInfo, description);
            console.log(`✅ Full backup completed: ${backupInfo.filename} (${this.formatBytes(backupInfo.size)})`);
            return backupInfo;
        }
        catch (error) {
            console.error('❌ Full backup failed:', error);
            throw error;
        }
    }
    /**
     * Создание инкрементального бэкапа
     */
    async createIncrementalBackup(baseBackup) {
        try {
            console.log('🔄 Starting incremental backup...');
            const timestamp = new Date();
            const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
            const filename = `${this.config.database}_incr_${timestampStr}.sql`;
            const filepath = path_1.default.join(this.config.backupDir, filename);
            // Определяем начальную точку для инкрементального бэкапа
            const sinceTime = baseBackup ?
                await this.getBackupTimestamp(baseBackup) :
                new Date(Date.now() - 24 * 60 * 60 * 1000); // последние 24 часа
            // Создаем запросы для инкрементального бэкапа
            const incrementalSQL = await this.generateIncrementalQueries(sinceTime);
            fs_1.default.writeFileSync(filepath, incrementalSQL);
            let finalFilepath = filepath;
            let compressed = false;
            let encrypted = false;
            // Применяем сжатие и шифрование аналогично полному бэкапу
            if (this.config.compressionEnabled) {
                finalFilepath = await this.compressFile(filepath);
                compressed = true;
                fs_1.default.unlinkSync(filepath);
            }
            if (this.config.encryptionEnabled && this.config.encryptionKey) {
                finalFilepath = await this.encryptFile(finalFilepath);
                encrypted = true;
                fs_1.default.unlinkSync(compressed ? finalFilepath.replace('.enc', '') : filepath);
            }
            const stats = fs_1.default.statSync(finalFilepath);
            const checksum = await this.calculateChecksum(finalFilepath);
            const backupInfo = {
                filename: path_1.default.basename(finalFilepath),
                filepath: finalFilepath,
                size: stats.size,
                timestamp,
                compressed,
                encrypted,
                checksum
            };
            await this.saveBackupMetadata(backupInfo, `Incremental backup since ${sinceTime.toISOString()}`);
            console.log(`✅ Incremental backup completed: ${backupInfo.filename}`);
            return backupInfo;
        }
        catch (error) {
            console.error('❌ Incremental backup failed:', error);
            throw error;
        }
    }
    /**
     * Восстановление из бэкапа
     */
    async restoreFromBackup(backupFilepath, targetDatabase) {
        try {
            console.log(`🔄 Starting database restore from: ${backupFilepath}`);
            let restoreFilepath = backupFilepath;
            // Расшифровка (если необходимо)
            if (backupFilepath.endsWith('.enc')) {
                if (!this.config.encryptionKey) {
                    throw new Error('Encryption key required for encrypted backup');
                }
                restoreFilepath = await this.decryptFile(backupFilepath);
            }
            // Распаковка (если необходимо)
            if (restoreFilepath.endsWith('.gz')) {
                restoreFilepath = await this.decompressFile(restoreFilepath);
            }
            const database = targetDatabase || this.config.database;
            // БЕЗОПАСНОСТЬ: Валидация путей
            this.validateFilePath(restoreFilepath);
            // Восстановление с помощью pg_restore с безопасными аргументами
            const restoreArgs = [
                '-h', this.validateStringParam(this.config.host),
                '-p', this.validateStringParam(this.config.port.toString()),
                '-U', this.validateStringParam(this.config.username),
                '-d', this.validateStringParam(database),
                '--verbose',
                '--clean',
                '--if-exists',
                '--no-password',
                restoreFilepath
            ];
            const env = { ...process.env, PGPASSWORD: this.config.password };
            await this.executeCommand('pg_restore', restoreArgs, { env });
            // Очищаем временные файлы
            if (restoreFilepath !== backupFilepath) {
                fs_1.default.unlinkSync(restoreFilepath);
            }
            console.log('✅ Database restore completed successfully');
        }
        catch (error) {
            console.error('❌ Database restore failed:', error);
            throw error;
        }
    }
    /**
     * Проверка целостности бэкапа
     */
    async verifyBackup(backupFilepath) {
        try {
            console.log(`🔍 Verifying backup: ${backupFilepath}`);
            // Проверяем существование файла
            if (!fs_1.default.existsSync(backupFilepath)) {
                throw new Error(`Backup file not found: ${backupFilepath}`);
            }
            // Проверяем контрольную сумму
            const metadata = await this.getBackupMetadata(backupFilepath);
            if (metadata) {
                const currentChecksum = await this.calculateChecksum(backupFilepath);
                if (currentChecksum !== metadata.checksum) {
                    throw new Error('Backup checksum verification failed');
                }
            }
            // Проверяем структуру файла (попытка частичного восстановления в тестовую БД)
            const testDbName = `${this.config.database}_verify_${Date.now()}`;
            try {
                // Создаем тестовую БД
                await this.createTestDatabase(testDbName);
                // Пытаемся восстановить
                await this.restoreFromBackup(backupFilepath, testDbName);
                // Проверяем основные таблицы
                const tablesValid = await this.validateRestoredTables(testDbName);
                return tablesValid;
            }
            finally {
                // Удаляем тестовую БД
                await this.dropTestDatabase(testDbName);
            }
        }
        catch (error) {
            console.error(`❌ Backup verification failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    /**
     * Настройка автоматических бэкапов
     */
    scheduleBackups(schedule) {
        // Полные бэкапы (например, ежедневно в 2:00)
        if (schedule.full) {
            const fullBackupJob = cron.schedule(schedule.full, async () => {
                try {
                    await this.createFullBackup('Scheduled full backup');
                    await this.cleanupOldBackups();
                }
                catch (error) {
                    console.error('❌ Scheduled full backup failed:', error);
                }
            });
            this.scheduledJobs.set('full', fullBackupJob);
            fullBackupJob.start();
            console.log(`📅 Full backup scheduled: ${schedule.full}`);
        }
        // Инкрементальные бэкапы (например, каждые 6 часов)
        if (schedule.incremental) {
            const incrBackupJob = cron.schedule(schedule.incremental, async () => {
                try {
                    await this.createIncrementalBackup();
                }
                catch (error) {
                    console.error('❌ Scheduled incremental backup failed:', error);
                }
            });
            this.scheduledJobs.set('incremental', incrBackupJob);
            incrBackupJob.start();
            console.log(`📅 Incremental backup scheduled: ${schedule.incremental}`);
        }
    }
    /**
     * Остановка запланированных задач
     */
    stopScheduledBackups() {
        for (const [name, job] of this.scheduledJobs) {
            job.stop();
            job.destroy();
            console.log(`⏹️ Stopped scheduled backup: ${name}`);
        }
        this.scheduledJobs.clear();
    }
    /**
     * Очистка старых бэкапов
     */
    async cleanupOldBackups() {
        try {
            const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
            const backupFiles = this.listBackupFiles();
            let deletedCount = 0;
            for (const file of backupFiles) {
                const stats = fs_1.default.statSync(file);
                if (stats.mtime < cutoffDate) {
                    fs_1.default.unlinkSync(file);
                    // Удаляем также файл метаданных
                    const metadataFile = file + '.meta';
                    if (fs_1.default.existsSync(metadataFile)) {
                        fs_1.default.unlinkSync(metadataFile);
                    }
                    deletedCount++;
                    console.log(`🗑️ Deleted old backup: ${path_1.default.basename(file)}`);
                }
            }
            if (deletedCount > 0) {
                console.log(`✅ Cleaned up ${deletedCount} old backup(s)`);
            }
            return deletedCount;
        }
        catch (error) {
            console.error('❌ Backup cleanup failed:', error);
            throw error;
        }
    }
    /**
     * Получение списка доступных бэкапов
     */
    listBackups() {
        const backupFiles = this.listBackupFiles();
        const backups = [];
        for (const filepath of backupFiles) {
            try {
                const stats = fs_1.default.statSync(filepath);
                const metadata = this.getBackupMetadataSync(filepath);
                backups.push({
                    filename: path_1.default.basename(filepath),
                    filepath,
                    size: stats.size,
                    timestamp: metadata?.timestamp || stats.mtime,
                    compressed: filepath.includes('.gz'),
                    encrypted: filepath.includes('.enc'),
                    checksum: metadata?.checksum || ''
                });
            }
            catch (error) {
                console.warn(`⚠️ Could not read backup metadata: ${filepath}`);
            }
        }
        return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    // === Приватные методы ===
    /**
     * Безопасное выполнение команд с валидацией
     */
    async executeCommand(command, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Валидация команды
                this.validateCommand(command);
                // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Валидация аргументов
                const validatedArgs = this.validateCommandArgs(args);
                // Используем spawn вместо execSync для безопасности
                const child = (0, child_process_1.spawn)(command, validatedArgs, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    encoding: 'utf8',
                    maxBuffer: 1024 * 1024 * 100, // 100MB buffer
                    timeout: 300000, // 5 минут максимум
                    ...options
                });
                let stdout = '';
                let stderr = '';
                child.stdout?.on('data', (data) => {
                    stdout += data;
                });
                child.stderr?.on('data', (data) => {
                    stderr += data;
                });
                child.on('close', (code) => {
                    if (code === 0) {
                        resolve(stdout);
                    }
                    else {
                        reject(new Error(`Command failed with code ${code}: ${stderr}`));
                    }
                });
                child.on('error', (error) => {
                    reject(error);
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Валидация команды для предотвращения command injection
     */
    validateCommand(command) {
        if (!command || typeof command !== 'string') {
            throw new Error('Command must be a non-empty string');
        }
        // Список разрешенных команд
        const allowedCommands = [
            'pg_dump', 'pg_restore', 'createdb', 'dropdb', 'psql',
            'gzip', 'gunzip', 'openssl', 'sha256sum'
        ];
        if (!allowedCommands.includes(command)) {
            throw new Error(`Command not allowed: ${command}`);
        }
        // Проверяем на опасные символы
        if (/[;&|`$(){}[\]*?~<>^!]/.test(command)) {
            throw new Error(`Command contains dangerous characters: ${command}`);
        }
    }
    /**
     * Валидация аргументов команды
     */
    validateCommandArgs(args) {
        if (!Array.isArray(args)) {
            throw new Error('Command arguments must be an array');
        }
        return args.map(arg => {
            if (typeof arg !== 'string') {
                throw new Error('All command arguments must be strings');
            }
            // Проверяем на command injection паттерны
            if (/[;&|`$(){}[\]*?~<>^!]/.test(arg)) {
                throw new Error(`Argument contains dangerous characters: ${arg}`);
            }
            // Проверяем максимальную длину
            if (arg.length > 1000) {
                throw new Error(`Argument too long: ${arg.substring(0, 50)}...`);
            }
            return arg;
        });
    }
    async compressFile(filepath) {
        this.validateFilePath(filepath);
        const compressedPath = filepath + '.gz';
        await this.executeCommand('gzip', ['-c', filepath], {
            stdio: ['pipe', fs_1.default.openSync(compressedPath, 'w'), 'pipe']
        });
        return compressedPath;
    }
    async decompressFile(filepath) {
        this.validateFilePath(filepath);
        const decompressedPath = filepath.replace('.gz', '');
        await this.executeCommand('gunzip', ['-c', filepath], {
            stdio: ['pipe', fs_1.default.openSync(decompressedPath, 'w'), 'pipe']
        });
        return decompressedPath;
    }
    async encryptFile(filepath) {
        if (!this.config.encryptionKey) {
            throw new Error('Encryption key not provided');
        }
        this.validateFilePath(filepath);
        this.validateEncryptionKey(this.config.encryptionKey);
        const encryptedPath = filepath + '.enc';
        await this.executeCommand('openssl', [
            'enc', '-aes-256-cbc', '-salt',
            '-in', filepath,
            '-out', encryptedPath,
            '-k', this.config.encryptionKey
        ]);
        return encryptedPath;
    }
    async decryptFile(filepath) {
        if (!this.config.encryptionKey) {
            throw new Error('Encryption key not provided');
        }
        this.validateFilePath(filepath);
        this.validateEncryptionKey(this.config.encryptionKey);
        const decryptedPath = filepath.replace('.enc', '');
        await this.executeCommand('openssl', [
            'enc', '-aes-256-cbc', '-d',
            '-in', filepath,
            '-out', decryptedPath,
            '-k', this.config.encryptionKey
        ]);
        return decryptedPath;
    }
    async calculateChecksum(filepath) {
        this.validateFilePath(filepath);
        const result = await this.executeCommand('sha256sum', [filepath]);
        return result.split(' ')[0];
    }
    async saveBackupMetadata(backupInfo, description) {
        const metadata = {
            ...backupInfo,
            description: description || '',
            createdBy: 'BackupManager',
            version: '1.0'
        };
        const metadataPath = backupInfo.filepath + '.meta';
        fs_1.default.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    }
    async getBackupMetadata(filepath) {
        const metadataPath = filepath + '.meta';
        if (fs_1.default.existsSync(metadataPath)) {
            return JSON.parse(fs_1.default.readFileSync(metadataPath, 'utf8'));
        }
        return null;
    }
    getBackupMetadataSync(filepath) {
        const metadataPath = filepath + '.meta';
        if (fs_1.default.existsSync(metadataPath)) {
            return JSON.parse(fs_1.default.readFileSync(metadataPath, 'utf8'));
        }
        return null;
    }
    async getBackupTimestamp(backupFilename) {
        const filepath = path_1.default.join(this.config.backupDir, backupFilename);
        const metadata = await this.getBackupMetadata(filepath);
        return metadata ? new Date(metadata.timestamp) : new Date();
    }
    async generateIncrementalQueries(sinceTime) {
        // Генерируем SQL запросы для инкрементального бэкапа
        // В реальной реализации здесь будет логика извлечения изменений
        return `-- Incremental backup since ${sinceTime.toISOString()}\n-- Generated by BackupManager\n`;
    }
    listBackupFiles() {
        return fs_1.default.readdirSync(this.config.backupDir)
            .filter(file => file.includes(this.config.database) && !file.endsWith('.meta'))
            .map(file => path_1.default.join(this.config.backupDir, file));
    }
    async createTestDatabase(dbName) {
        this.validateStringParam(dbName);
        await this.executeCommand('createdb', [
            '-h', this.validateStringParam(this.config.host),
            '-p', this.validateStringParam(this.config.port.toString()),
            '-U', this.validateStringParam(this.config.username),
            dbName
        ], { env: { ...process.env, PGPASSWORD: this.config.password } });
    }
    async dropTestDatabase(dbName) {
        this.validateStringParam(dbName);
        await this.executeCommand('dropdb', [
            '-h', this.validateStringParam(this.config.host),
            '-p', this.validateStringParam(this.config.port.toString()),
            '-U', this.validateStringParam(this.config.username),
            dbName
        ], { env: { ...process.env, PGPASSWORD: this.config.password } });
    }
    async validateRestoredTables(dbName) {
        try {
            this.validateStringParam(dbName);
            // Проверяем наличие основных таблиц
            const expectedTables = [
                'mix_requests', 'wallets', 'transaction_pools',
                'output_transactions', 'blockchain_transactions'
            ];
            for (const table of expectedTables) {
                // БЕЗОПАСНОСТЬ: Валидация имени таблицы
                this.validateTableName(table);
                const result = await this.executeCommand('psql', [
                    '-h', this.validateStringParam(this.config.host),
                    '-p', this.validateStringParam(this.config.port.toString()),
                    '-U', this.validateStringParam(this.config.username),
                    '-d', dbName,
                    '-c', `SELECT 1 FROM ${table} LIMIT 1;`
                ], { env: { ...process.env, PGPASSWORD: this.config.password } });
                if (!result.includes('1 row') && !result.includes('0 rows')) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Валидация путей файлов для предотвращения path traversal
     */
    validateFilePath(filepath) {
        if (!filepath || typeof filepath !== 'string') {
            throw new Error('File path must be a non-empty string');
        }
        // Проверяем на path traversal атаки
        const normalizedPath = path_1.default.normalize(filepath);
        if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
            throw new Error(`Potentially dangerous file path: ${filepath}`);
        }
        // Проверяем что путь находится в разрешенных директориях
        const allowedPaths = [
            path_1.default.normalize(this.config.backupDir),
            '/tmp',
            '/var/tmp'
        ];
        const isAllowed = allowedPaths.some(allowedPath => normalizedPath.startsWith(allowedPath));
        if (!isAllowed) {
            throw new Error(`File path outside allowed directories: ${filepath}`);
        }
        // Проверяем на опасные символы
        if (/[;&|`$(){}[\]*?~<>^!]/.test(filepath)) {
            throw new Error(`File path contains dangerous characters: ${filepath}`);
        }
        // Проверяем максимальную длину
        if (filepath.length > 500) {
            throw new Error(`File path too long: ${filepath.substring(0, 50)}...`);
        }
    }
    /**
     * Валидация строковых параметров
     */
    validateStringParam(param) {
        if (!param || typeof param !== 'string') {
            throw new Error('Parameter must be a non-empty string');
        }
        // Проверяем на command injection символы
        if (/[;&|`$(){}[\]*?~<>^!]/.test(param)) {
            throw new Error(`Parameter contains dangerous characters: ${param}`);
        }
        // Проверяем максимальную длину
        if (param.length > 100) {
            throw new Error(`Parameter too long: ${param.substring(0, 20)}...`);
        }
        return param;
    }
    /**
     * Валидация ключа шифрования
     */
    validateEncryptionKey(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('Encryption key must be a non-empty string');
        }
        // Минимальная длина для безопасности
        if (key.length < 16) {
            throw new Error('Encryption key too short (minimum 16 characters)');
        }
        // Максимальная длина
        if (key.length > 256) {
            throw new Error('Encryption key too long (maximum 256 characters)');
        }
        // Проверяем на опасные символы
        if (/[;&|`$(){}[\]*?~<>^!"]/.test(key)) {
            throw new Error('Encryption key contains dangerous characters');
        }
    }
    /**
     * Валидация имени таблицы
     */
    validateTableName(tableName) {
        if (!tableName || typeof tableName !== 'string') {
            throw new Error('Table name must be a non-empty string');
        }
        // Проверяем формат имени таблицы
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw new Error(`Invalid table name format: ${tableName}`);
        }
        // Проверяем максимальную длину
        if (tableName.length > 64) {
            throw new Error(`Table name too long: ${tableName}`);
        }
        // Проверяем на зарезервированные SQL слова
        const reservedWords = [
            'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
            'truncate', 'union', 'where', 'order', 'group', 'having', 'join'
        ];
        if (reservedWords.includes(tableName.toLowerCase())) {
            throw new Error(`Table name cannot be a reserved SQL word: ${tableName}`);
        }
    }
    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0)
            return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}
exports.BackupManager = BackupManager;
exports.default = BackupManager;
//# sourceMappingURL=BackupManager.js.map