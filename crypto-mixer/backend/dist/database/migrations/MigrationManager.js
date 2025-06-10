"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationManager = void 0;
const sequelize_1 = require("sequelize");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Менеджер миграций базы данных
 * Управляет версионированием схемы БД
 */
class MigrationManager {
    constructor(sequelize, migrationsPath) {
        this.migrationTableName = 'sequelize_migrations';
        this.sequelize = sequelize;
        this.migrationsPath = migrationsPath || path_1.default.join(__dirname, './');
    }
    /**
     * Создание таблицы миграций
     */
    async createMigrationsTable() {
        const queryInterface = this.sequelize.getQueryInterface();
        const tableExists = await queryInterface.showAllTables();
        if (tableExists.includes(this.migrationTableName)) {
            return;
        }
        await queryInterface.createTable(this.migrationTableName, {
            id: {
                type: sequelize_1.DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            filename: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false
            },
            executed_at: {
                type: sequelize_1.DataTypes.DATE,
                allowNull: false,
                defaultValue: sequelize_1.DataTypes.NOW
            },
            execution_time_ms: {
                type: sequelize_1.DataTypes.INTEGER,
                allowNull: false
            },
            checksum: {
                type: sequelize_1.DataTypes.STRING,
                allowNull: false
            }
        });
        console.log('✅ Migration table created successfully');
    }
    /**
     * Получение выполненных миграций с защитой от SQL injection
     */
    async getExecutedMigrations() {
        await this.createMigrationsTable();
        // БЕЗОПАСНОСТЬ: Валидация имени таблицы
        this.validateTableName(this.migrationTableName);
        const results = await this.sequelize.query('SELECT * FROM ?? ORDER BY executed_at ASC', {
            replacements: [this.migrationTableName],
            type: sequelize_1.QueryTypes.SELECT
        });
        return results;
    }
    /**
     * Валидация имени таблицы для предотвращения SQL injection
     */
    validateTableName(tableName) {
        if (!tableName || typeof tableName !== 'string') {
            throw new Error('Table name must be a non-empty string');
        }
        // Проверяем формат имени таблицы (только буквы, цифры, подчеркивания)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw new Error(`Invalid table name format: ${tableName}. Only alphanumeric characters and underscores allowed`);
        }
        // Проверяем максимальную длину
        if (tableName.length > 64) {
            throw new Error(`Table name too long: ${tableName} (max 64 characters)`);
        }
        // Проверяем на зарезервированные SQL слова
        const reservedWords = [
            'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
            'truncate', 'union', 'where', 'order', 'group', 'having', 'join',
            'index', 'table', 'database', 'schema', 'view', 'procedure', 'function'
        ];
        if (reservedWords.includes(tableName.toLowerCase())) {
            throw new Error(`Table name cannot be a reserved SQL word: ${tableName}`);
        }
    }
    /**
     * Сканирование файлов миграций с защитой от path traversal
     */
    async scanMigrationFiles() {
        // БЕЗОПАСНОСТЬ: Валидация пути к миграциям
        this.validateMigrationsPath(this.migrationsPath);
        const files = fs_1.default.readdirSync(this.migrationsPath)
            .filter(file => {
            // БЕЗОПАСНОСТЬ: Дополнительная валидация имен файлов
            return this.isValidMigrationFilename(file);
        })
            .sort();
        const migrations = [];
        for (const filename of files) {
            try {
                // БЕЗОПАСНОСТЬ: Валидация полного пути файла
                const filepath = this.validateAndBuildFilePath(filename);
                // БЕЗОПАСНОСТЬ: Безопасная загрузка модуля
                const migration = this.safeRequire(filepath);
                const id = filename.replace(/\.(js|ts)$/, '');
                const timestamp = this.parseTimestampFromFilename(filename);
                // БЕЗОПАСНОСТЬ: Валидация структуры миграции
                this.validateMigrationStructure(migration, filename);
                migrations.push({
                    id,
                    filename,
                    timestamp,
                    up: migration.up,
                    down: migration.down
                });
            }
            catch (error) {
                console.error(`❌ Error loading migration ${filename}:`, error);
                throw error;
            }
        }
        return migrations;
    }
    /**
     * Парсинг временной метки из имени файла
     */
    parseTimestampFromFilename(filename) {
        const timestampStr = filename.substring(0, 14);
        const year = parseInt(timestampStr.substring(0, 4));
        const month = parseInt(timestampStr.substring(4, 6)) - 1;
        const day = parseInt(timestampStr.substring(6, 8));
        const hour = parseInt(timestampStr.substring(8, 10));
        const minute = parseInt(timestampStr.substring(10, 12));
        const second = parseInt(timestampStr.substring(12, 14));
        return new Date(year, month, day, hour, minute, second);
    }
    /**
     * Вычисление контрольной суммы миграции
     */
    calculateChecksum(migration) {
        const crypto = require('crypto');
        const content = migration.up.toString() + migration.down.toString();
        return crypto.createHash('md5').update(content).digest('hex');
    }
    /**
     * Запись выполненной миграции с защитой от SQL injection
     */
    async recordMigration(migration, executionTime) {
        const checksum = this.calculateChecksum(migration);
        // БЕЗОПАСНОСТЬ: Валидация имени таблицы
        this.validateTableName(this.migrationTableName);
        // БЕЗОПАСНОСТЬ: Валидация входных данных
        this.validateMigrationData(migration, executionTime, checksum);
        await this.sequelize.query('INSERT INTO ?? (id, filename, executed_at, execution_time_ms, checksum) VALUES (?, ?, ?, ?, ?)', {
            replacements: [
                this.migrationTableName,
                migration.id,
                migration.filename,
                new Date(),
                executionTime,
                checksum
            ]
        });
    }
    /**
     * Удаление записи о миграции с защитой от SQL injection
     */
    async unrecordMigration(migrationId) {
        // БЕЗОПАСНОСТЬ: Валидация имени таблицы
        this.validateTableName(this.migrationTableName);
        // БЕЗОПАСНОСТЬ: Валидация ID миграции
        this.validateMigrationId(migrationId);
        await this.sequelize.query('DELETE FROM ?? WHERE id = ?', {
            replacements: [this.migrationTableName, migrationId]
        });
    }
    /**
     * Выполнение миграций вверх
     */
    async up(targetMigration) {
        try {
            console.log('🔄 Starting database migration...');
            const allMigrations = await this.scanMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            const executedIds = new Set(executedMigrations.map(m => m.id));
            // Фильтруем неисполненные миграции
            let pendingMigrations = allMigrations.filter(m => !executedIds.has(m.id));
            // Если указана целевая миграция, ограничиваем до неё
            if (targetMigration) {
                const targetIndex = pendingMigrations.findIndex(m => m.id === targetMigration);
                if (targetIndex === -1) {
                    throw new Error(`Target migration ${targetMigration} not found`);
                }
                pendingMigrations = pendingMigrations.slice(0, targetIndex + 1);
            }
            if (pendingMigrations.length === 0) {
                console.log('✅ No pending migrations to run');
                return;
            }
            console.log(`📝 Found ${pendingMigrations.length} pending migrations`);
            // Выполняем миграции в транзакции
            await this.sequelize.transaction(async (transaction) => {
                for (const migration of pendingMigrations) {
                    console.log(`🔄 Running migration: ${migration.filename}`);
                    const startTime = Date.now();
                    const queryInterface = this.sequelize.getQueryInterface();
                    try {
                        await migration.up(queryInterface, sequelize_1.Sequelize);
                        const executionTime = Date.now() - startTime;
                        await this.recordMigration(migration, executionTime);
                        console.log(`✅ Migration ${migration.filename} completed in ${executionTime}ms`);
                    }
                    catch (error) {
                        console.error(`❌ Migration ${migration.filename} failed:`, error);
                        throw error;
                    }
                }
            });
            console.log('✅ All migrations completed successfully');
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }
    /**
     * Откат миграций вниз
     */
    async down(targetMigration) {
        try {
            console.log('🔄 Starting migration rollback...');
            const allMigrations = await this.scanMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            if (executedMigrations.length === 0) {
                console.log('✅ No migrations to rollback');
                return;
            }
            // Определяем миграции для отката
            let migrationsToRollback = executedMigrations
                .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime());
            if (targetMigration) {
                const targetIndex = migrationsToRollback.findIndex(m => m.id === targetMigration);
                if (targetIndex === -1) {
                    throw new Error(`Target migration ${targetMigration} not found in executed migrations`);
                }
                migrationsToRollback = migrationsToRollback.slice(0, targetIndex + 1);
            }
            else {
                // Откатываем только последнюю миграцию
                migrationsToRollback = [migrationsToRollback[0]];
            }
            console.log(`📝 Rolling back ${migrationsToRollback.length} migrations`);
            // Выполняем откат в транзакции
            await this.sequelize.transaction(async (transaction) => {
                for (const executedMigration of migrationsToRollback) {
                    const migration = allMigrations.find(m => m.id === executedMigration.id);
                    if (!migration) {
                        console.warn(`⚠️ Migration file not found for ${executedMigration.filename}, skipping...`);
                        continue;
                    }
                    console.log(`🔄 Rolling back migration: ${migration.filename}`);
                    const queryInterface = this.sequelize.getQueryInterface();
                    try {
                        await migration.down(queryInterface, sequelize_1.Sequelize);
                        await this.unrecordMigration(migration.id);
                        console.log(`✅ Migration ${migration.filename} rolled back successfully`);
                    }
                    catch (error) {
                        console.error(`❌ Rollback of ${migration.filename} failed:`, error);
                        throw error;
                    }
                }
            });
            console.log('✅ Migration rollback completed successfully');
        }
        catch (error) {
            console.error('❌ Migration rollback failed:', error);
            throw error;
        }
    }
    /**
     * Проверка статуса миграций
     */
    async status() {
        const allMigrations = await this.scanMigrationFiles();
        const executedMigrations = await this.getExecutedMigrations();
        const executedIds = new Set(executedMigrations.map(m => m.id));
        const pendingMigrations = allMigrations.filter(m => !executedIds.has(m.id));
        return {
            executed: executedMigrations,
            pending: pendingMigrations,
            total: allMigrations.length
        };
    }
    /**
     * Создание новой миграции
     */
    async create(name, template = 'custom') {
        const timestamp = new Date().toISOString()
            .replace(/[-:T]/g, '')
            .replace(/\.\d{3}Z/, '');
        const filename = `${timestamp}-${name.toLowerCase().replace(/\s+/g, '-')}.ts`;
        const filepath = path_1.default.join(this.migrationsPath, filename);
        let content = '';
        switch (template) {
            case 'table':
                content = this.generateTableTemplate(name);
                break;
            case 'index':
                content = this.generateIndexTemplate(name);
                break;
            default:
                content = this.generateCustomTemplate(name);
                break;
        }
        fs_1.default.writeFileSync(filepath, content);
        console.log(`✅ Migration created: ${filename}`);
        return filepath;
    }
    /**
     * Шаблон для создания таблицы
     */
    generateTableTemplate(name) {
        const tableName = name.toLowerCase().replace(/[-\s]+/g, '_');
        return `import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  await queryInterface.createTable('${tableName}', {
    id: {
      allowNull: false,
      primaryKey: true,
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4
    },
    // Add your columns here
    created_at: {
      allowNull: false,
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      allowNull: false,
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  });
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  await queryInterface.dropTable('${tableName}');
};
`;
    }
    /**
     * Шаблон для создания индексов
     */
    generateIndexTemplate(name) {
        return `import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Add indexes here
  // await queryInterface.addIndex('table_name', ['column_name']);
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Remove indexes here
  // await queryInterface.removeIndex('table_name', ['column_name']);
};
`;
    }
    /**
     * Пользовательский шаблон
     */
    generateCustomTemplate(name) {
        return `import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Add migration logic here
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Add rollback logic here
};
`;
    }
    /**
     * Валидация целостности миграций
     */
    async validate() {
        const issues = [];
        try {
            const allMigrations = await this.scanMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            // Проверяем контрольные суммы
            for (const executed of executedMigrations) {
                const migration = allMigrations.find(m => m.id === executed.id);
                if (!migration) {
                    issues.push(`Migration file missing for executed migration: ${executed.filename}`);
                    continue;
                }
                const currentChecksum = this.calculateChecksum(migration);
                if (currentChecksum !== executed.checksum) {
                    issues.push(`Checksum mismatch for migration: ${migration.filename}`);
                }
            }
            // Проверяем последовательность миграций
            const sortedMigrations = allMigrations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            const executedIds = new Set(executedMigrations.map(m => m.id));
            let foundGap = false;
            for (const migration of sortedMigrations) {
                if (!executedIds.has(migration.id)) {
                    foundGap = true;
                }
                else if (foundGap) {
                    issues.push(`Gap in migration sequence: ${migration.filename} is executed but earlier migrations are pending`);
                }
            }
        }
        catch (error) {
            // Расширенная обработка ошибок с дополнительной диагностикой
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
            issues.push(`Validation error: ${errorMessage}`);
            console.warn('🔍 Migration validation details:', { errorMessage, errorStack });
        }
        return {
            isValid: issues.length === 0,
            issues
        };
    }
    /**
     * Валидация данных миграции для предотвращения injection атак
     */
    validateMigrationData(migration, executionTime, checksum) {
        // Валидация ID миграции
        this.validateMigrationId(migration.id);
        // Валидация имени файла
        if (!migration.filename || typeof migration.filename !== 'string') {
            throw new Error('Migration filename must be a non-empty string');
        }
        if (!/^[\w\-\.]+\.(js|ts)$/.test(migration.filename)) {
            throw new Error(`Invalid migration filename format: ${migration.filename}`);
        }
        if (migration.filename.length > 255) {
            throw new Error(`Migration filename too long: ${migration.filename} (max 255 characters)`);
        }
        // Валидация времени выполнения
        if (typeof executionTime !== 'number' || !Number.isFinite(executionTime) || executionTime < 0) {
            throw new Error('Execution time must be a non-negative finite number');
        }
        if (executionTime > 1000000) { // 1000 секунд максимум
            throw new Error('Execution time too large (max 1000 seconds)');
        }
        // Валидация контрольной суммы
        if (!checksum || typeof checksum !== 'string') {
            throw new Error('Checksum must be a non-empty string');
        }
        if (!/^[a-f0-9]{32}$/.test(checksum)) {
            throw new Error('Invalid checksum format (must be 32-character hex string)');
        }
    }
    /**
     * Валидация ID миграции
     */
    validateMigrationId(migrationId) {
        if (!migrationId || typeof migrationId !== 'string') {
            throw new Error('Migration ID must be a non-empty string');
        }
        // Проверяем формат ID (timestamp-название)
        if (!/^\d{14}-[\w\-]+$/.test(migrationId)) {
            throw new Error(`Invalid migration ID format: ${migrationId}. Expected format: YYYYMMDDHHMMSS-name`);
        }
        if (migrationId.length > 100) {
            throw new Error(`Migration ID too long: ${migrationId} (max 100 characters)`);
        }
        // Проверяем на потенциально опасные символы
        if (/['";<>\\\/]/.test(migrationId)) {
            throw new Error(`Migration ID contains dangerous characters: ${migrationId}`);
        }
    }
    /**
     * Валидация пути к директории миграций
     */
    validateMigrationsPath(migrationsPath) {
        if (!migrationsPath || typeof migrationsPath !== 'string') {
            throw new Error('Migrations path must be a non-empty string');
        }
        // Проверяем на path traversal атаки
        const normalizedPath = path_1.default.normalize(migrationsPath);
        if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
            throw new Error(`Potentially dangerous migrations path: ${migrationsPath}`);
        }
        // Проверяем существование директории
        if (!fs_1.default.existsSync(migrationsPath)) {
            throw new Error(`Migrations directory does not exist: ${migrationsPath}`);
        }
        // Проверяем что это директория
        const stat = fs_1.default.statSync(migrationsPath);
        if (!stat.isDirectory()) {
            throw new Error(`Migrations path is not a directory: ${migrationsPath}`);
        }
    }
    /**
     * Валидация имени файла миграции
     */
    isValidMigrationFilename(filename) {
        // Базовая проверка расширения и формата
        if (!(filename.endsWith('.ts') || filename.endsWith('.js'))) {
            return false;
        }
        // Проверка формата timestamp
        if (!filename.match(/^\d{14}-/)) {
            return false;
        }
        // Проверка на потенциально опасные символы
        if (/['";<>\\\/\x00-\x1f]/.test(filename)) {
            return false;
        }
        // Проверка разумной длины
        if (filename.length > 255) {
            return false;
        }
        return true;
    }
    /**
     * Валидация и построение полного пути к файлу
     */
    validateAndBuildFilePath(filename) {
        // Дополнительная проверка filename
        if (!this.isValidMigrationFilename(filename)) {
            throw new Error(`Invalid migration filename: ${filename}`);
        }
        const filepath = path_1.default.join(this.migrationsPath, filename);
        const normalizedPath = path_1.default.normalize(filepath);
        // Проверяем что файл находится в директории миграций
        if (!normalizedPath.startsWith(path_1.default.normalize(this.migrationsPath))) {
            throw new Error(`File path outside migrations directory: ${filepath}`);
        }
        // Проверяем существование файла
        if (!fs_1.default.existsSync(normalizedPath)) {
            throw new Error(`Migration file does not exist: ${normalizedPath}`);
        }
        return normalizedPath;
    }
    /**
     * Безопасная загрузка модуля миграции
     */
    safeRequire(filepath) {
        try {
            // Очищаем require cache для повторных загрузок
            delete require.cache[require.resolve(filepath)];
            const migration = require(filepath);
            if (!migration || typeof migration !== 'object') {
                throw new Error('Migration module must export an object');
            }
            return migration;
        }
        catch (error) {
            throw new Error(`Failed to load migration module: ${filepath}. Error: ${error}`);
        }
    }
    /**
     * Валидация структуры миграции
     */
    validateMigrationStructure(migration, filename) {
        if (!migration.up || typeof migration.up !== 'function') {
            throw new Error(`Migration ${filename} must export an 'up' function`);
        }
        if (!migration.down || typeof migration.down !== 'function') {
            throw new Error(`Migration ${filename} must export a 'down' function`);
        }
        // Проверяем сигнатуру функций (должны принимать 2 параметра)
        if (migration.up.length !== 2) {
            throw new Error(`Migration ${filename} 'up' function must accept exactly 2 parameters (queryInterface, Sequelize)`);
        }
        if (migration.down.length !== 2) {
            throw new Error(`Migration ${filename} 'down' function must accept exactly 2 parameters (queryInterface, Sequelize)`);
        }
    }
}
exports.MigrationManager = MigrationManager;
exports.default = MigrationManager;
//# sourceMappingURL=MigrationManager.js.map