#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationManager = exports.MigrationRunner = void 0;
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const MigrationManager_1 = require("./migrations/MigrationManager");
Object.defineProperty(exports, "MigrationManager", { enumerable: true, get: function () { return MigrationManager_1.MigrationManager; } });
// Загружаем переменные окружения
dotenv_1.default.config();
/**
 * Главный скрипт для управления миграциями
 */
class MigrationRunner {
    constructor() {
        // Инициализируем подключение к базе данных
        this.sequelize = new sequelize_1.Sequelize({
            database: process.env.DB_NAME || 'crypto_mixer',
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            dialect: 'postgres',
            logging: process.env.NODE_ENV === 'development' ? console.log : false,
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        });
        this.migrationManager = new MigrationManager_1.MigrationManager(this.sequelize, path_1.default.join(__dirname, 'migrations'));
    }
    /**
     * Подключение к базе данных
     */
    async connect() {
        try {
            await this.sequelize.authenticate();
            console.log('✅ Database connection established successfully');
        }
        catch (error) {
            console.error('❌ Unable to connect to the database:', error);
            throw error;
        }
    }
    /**
     * Закрытие подключения
     */
    async disconnect() {
        await this.sequelize.close();
        console.log('🔌 Database connection closed');
    }
    /**
     * Публичный доступ к менеджеру миграций
     * Расширяет функционал для внешнего управления
     */
    getMigrationManager() {
        return this.migrationManager;
    }
    /**
     * Выполнение миграций
     */
    async runMigrations(target) {
        try {
            await this.connect();
            await this.migrationManager.up(target);
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
            throw error;
        }
        finally {
            await this.disconnect();
        }
    }
    /**
     * Откат миграций
     */
    async rollbackMigrations(target) {
        try {
            await this.connect();
            await this.migrationManager.down(target);
        }
        catch (error) {
            console.error('❌ Migration rollback failed:', error);
            throw error;
        }
        finally {
            await this.disconnect();
        }
    }
    /**
     * Статус миграций
     */
    async getStatus() {
        try {
            await this.connect();
            const status = await this.migrationManager.status();
            console.log('\n📊 Migration Status:');
            console.log(`📈 Total migrations: ${status.total}`);
            console.log(`✅ Executed: ${status.executed.length}`);
            console.log(`⏳ Pending: ${status.pending.length}`);
            if (status.executed.length > 0) {
                console.log('\n✅ Executed migrations:');
                status.executed.forEach(migration => {
                    console.log(`  - ${migration.filename} (${migration.executed_at})`);
                });
            }
            if (status.pending.length > 0) {
                console.log('\n⏳ Pending migrations:');
                status.pending.forEach(migration => {
                    console.log(`  - ${migration.filename}`);
                });
            }
        }
        catch (error) {
            console.error('❌ Failed to get migration status:', error);
            throw error;
        }
        finally {
            await this.disconnect();
        }
    }
    /**
     * Создание новой миграции
     */
    async createMigration(name, template = 'custom') {
        try {
            const filepath = await this.migrationManager.create(name, template);
            console.log(`✅ Migration created: ${filepath}`);
        }
        catch (error) {
            console.error('❌ Failed to create migration:', error);
            throw error;
        }
    }
    /**
     * Валидация миграций
     */
    async validateMigrations() {
        try {
            await this.connect();
            const validation = await this.migrationManager.validate();
            if (validation.isValid) {
                console.log('✅ All migrations are valid');
            }
            else {
                console.log('❌ Migration validation failed:');
                validation.issues.forEach(issue => {
                    console.log(`  - ${issue}`);
                });
                process.exit(1);
            }
        }
        catch (error) {
            console.error('❌ Migration validation failed:', error);
            throw error;
        }
        finally {
            await this.disconnect();
        }
    }
}
exports.MigrationRunner = MigrationRunner;
/**
 * Обработка аргументов командной строки
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const runner = new MigrationRunner();
    try {
        switch (command) {
            case 'up':
                const target = args[1];
                await runner.runMigrations(target);
                break;
            case 'down':
                const rollbackTarget = args[1];
                await runner.rollbackMigrations(rollbackTarget);
                break;
            case 'status':
                await runner.getStatus();
                break;
            case 'create':
                const migrationName = args[1];
                const template = args[2] || 'custom';
                if (!migrationName) {
                    console.error('❌ Migration name is required');
                    console.log('Usage: ts-node migrate.ts create <name> [table|index|custom]');
                    process.exit(1);
                }
                await runner.createMigration(migrationName, template);
                break;
            case 'validate':
                await runner.validateMigrations();
                break;
            case 'reset':
                console.log('⚠️  This will rollback ALL migrations. Are you sure? (y/N)');
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                readline.question('', async (answer) => {
                    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                        await runner.connect();
                        const status = await runner.getMigrationManager().status();
                        for (const migration of status.executed.reverse()) {
                            await runner.getMigrationManager().down(migration.id);
                        }
                        await runner.disconnect();
                        console.log('✅ All migrations rolled back');
                    }
                    else {
                        console.log('❌ Operation cancelled');
                    }
                    readline.close();
                });
                break;
            default:
                console.log('🔧 Database Migration Manager');
                console.log('');
                console.log('Usage:');
                console.log('  ts-node migrate.ts <command> [options]');
                console.log('');
                console.log('Commands:');
                console.log('  up [target]           Run pending migrations (optionally up to target)');
                console.log('  down [target]         Rollback last migration (or down to target)');
                console.log('  status               Show migration status');
                console.log('  create <name> [type] Create new migration (type: table|index|custom)');
                console.log('  validate             Validate migration integrity');
                console.log('  reset                Rollback all migrations');
                console.log('');
                console.log('Examples:');
                console.log('  ts-node migrate.ts up');
                console.log('  ts-node migrate.ts down');
                console.log('  ts-node migrate.ts create add-user-table table');
                console.log('  ts-node migrate.ts status');
                break;
        }
    }
    catch (error) {
        console.error('❌ Command failed:', error);
        process.exit(1);
    }
}
// Запуск только если файл выполняется напрямую
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
}
exports.default = MigrationRunner;
//# sourceMappingURL=migrate.js.map