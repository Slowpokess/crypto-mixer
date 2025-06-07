#!/usr/bin/env npx ts-node
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
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const sequelize_1 = require("sequelize");
const DataEncryption_1 = require("../utils/DataEncryption");
const EncryptExistingData_1 = require("../utils/EncryptExistingData");
const dotenv = __importStar(require("dotenv"));
// Загружаем environment переменные
dotenv.config();
/**
 * CLI утилита для миграции чувствительных данных в зашифрованном виде
 */
class EncryptionMigrationCLI {
    async initialize() {
        console.log('🔧 Initializing encryption migration CLI...');
        try {
            // Инициализация Sequelize
            this.sequelize = new sequelize_1.Sequelize({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'crypto_mixer',
                username: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || '',
                dialect: 'postgres',
                logging: false, // Отключаем SQL логи для чистого вывода
                pool: {
                    max: 5,
                    min: 1,
                    acquire: 30000,
                    idle: 10000
                }
            });
            // Тестируем подключение
            await this.sequelize.authenticate();
            console.log('✅ Database connection established');
            // Инициализация менеджера шифрования
            this.encryptionManager = new DataEncryption_1.DataEncryptionManager({
                masterKey: process.env.DATA_ENCRYPTION_KEY,
                compressionEnabled: process.env.DATA_COMPRESSION === 'true',
                integrityCheckEnabled: true
            });
            console.log('✅ Encryption manager initialized');
        }
        catch (error) {
            console.error('❌ Initialization failed:', error);
            process.exit(1);
        }
    }
    async migrate(options) {
        console.log('🔒 Starting sensitive data encryption migration...');
        console.log('Options:', options);
        try {
            this.migrator = new EncryptExistingData_1.ExistingDataEncryptionMigrator(this.sequelize, this.encryptionManager, {
                dryRun: options.dryRun,
                batchSize: options.batchSize
            });
            const result = await this.migrator.migrateAllSensitiveData();
            console.log('\n📊 MIGRATION RESULTS:');
            console.log('='.repeat(50));
            console.log(`✅ Success: ${result.success}`);
            console.log(`📈 Total Records: ${result.totalRecords}`);
            console.log(`🔒 Migrated Records: ${result.migratedRecords}`);
            console.log(`❌ Errors: ${result.errors.length}`);
            if (result.errors.length > 0) {
                console.log('\n🚨 ERRORS:');
                result.errors.slice(0, 5).forEach((error, index) => {
                    console.log(`${index + 1}. ${JSON.stringify(error, null, 2)}`);
                });
                if (result.errors.length > 5) {
                    console.log(`... and ${result.errors.length - 5} more errors`);
                }
            }
            if (options.dryRun) {
                console.log('\n💡 This was a DRY RUN - no data was actually encrypted');
                console.log('Run without --dry-run to perform the actual migration');
            }
            else {
                console.log('\n✅ Migration completed successfully!');
                console.log('🔒 Sensitive data is now encrypted with AES-256-GCM');
            }
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        }
    }
    async status() {
        console.log('📊 Checking encryption migration status...');
        try {
            this.migrator = new EncryptExistingData_1.ExistingDataEncryptionMigrator(this.sequelize, this.encryptionManager);
            const status = await this.migrator.getMigrationStatus();
            console.log('\n📈 MIGRATION STATUS:');
            console.log('='.repeat(50));
            console.log(`🎯 Completed: ${status.completed ? 'YES' : 'NO'}`);
            console.log(`📋 Tables: ${status.summary.completedTables}/${status.summary.totalTables}`);
            console.log(`🔧 Fields: ${status.summary.completedFields}/${status.summary.totalFields}`);
            console.log(`📊 Records: ${status.summary.migratedRecords}/${status.summary.totalRecords}`);
            console.log('\n📋 DETAILED PROGRESS:');
            for (const [tableName, tableProgress] of Object.entries(status.progress)) {
                const table = tableProgress;
                console.log(`\n🗂️  ${tableName.toUpperCase()}:`);
                console.log(`   Status: ${table.completed ? '✅ Completed' : '⏳ In Progress'}`);
                console.log(`   Records: ${table.migratedRecords}/${table.totalRecords}`);
                for (const [fieldName, fieldProgress] of Object.entries(table.fields)) {
                    const field = fieldProgress;
                    const statusIcon = field.status === 'completed' ? '✅' :
                        field.status === 'in_progress' ? '⏳' :
                            field.status === 'failed' ? '❌' : '⏸️';
                    console.log(`     ${statusIcon} ${fieldName}: ${field.migrated}/${field.total}`);
                }
            }
        }
        catch (error) {
            console.error('❌ Status check failed:', error);
            process.exit(1);
        }
    }
    async rollback(options) {
        console.log('🔄 Starting encryption rollback...');
        console.log('Options:', options);
        try {
            this.migrator = new EncryptExistingData_1.ExistingDataEncryptionMigrator(this.sequelize, this.encryptionManager, { dryRun: options.dryRun });
            const result = await this.migrator.rollbackMigration(options.table);
            console.log('\n📊 ROLLBACK RESULTS:');
            console.log('='.repeat(50));
            console.log(`✅ Success: ${result.success}`);
            console.log(`📈 Restored Records: ${result.restoredRecords}`);
            console.log(`❌ Errors: ${result.errors.length}`);
            if (result.errors.length > 0) {
                console.log('\n🚨 ERRORS:');
                result.errors.slice(0, 5).forEach((error, index) => {
                    console.log(`${index + 1}. ${JSON.stringify(error, null, 2)}`);
                });
            }
            if (options.dryRun) {
                console.log('\n💡 This was a DRY RUN - no data was actually restored');
            }
            else {
                console.log('\n✅ Rollback completed successfully!');
                console.log('📖 Sensitive data has been restored to plain text');
            }
        }
        catch (error) {
            console.error('❌ Rollback failed:', error);
            process.exit(1);
        }
    }
    async testEncryption() {
        console.log('🧪 Testing encryption functionality...');
        try {
            const testData = {
                ipAddress: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                notes: 'Test sensitive data',
                details: { userId: 'test123', action: 'login' }
            };
            console.log('\n📝 Original data:', testData);
            // Тестируем шифрование
            const encrypted = await this.encryptionManager.encryptSensitiveData(testData, 'USER_METADATA');
            console.log('\n🔒 Encrypted data:');
            console.log(`   Algorithm: ${encrypted.algorithm}`);
            console.log(`   Key Version: ${encrypted.keyVersion}`);
            console.log(`   IV: ${encrypted.iv.substring(0, 16)}...`);
            console.log(`   Encrypted: ${encrypted.encryptedValue.substring(0, 32)}...`);
            console.log(`   Tag: ${encrypted.tag.substring(0, 16)}...`);
            // Тестируем расшифровку
            const decrypted = await this.encryptionManager.decryptSensitiveData(encrypted);
            console.log('\n🔓 Decrypted data:', decrypted);
            // Проверяем идентичность
            const isIdentical = JSON.stringify(testData) === JSON.stringify(decrypted);
            console.log(`\n✅ Encryption/Decryption test: ${isIdentical ? 'PASSED' : 'FAILED'}`);
            if (!isIdentical) {
                console.error('❌ Data integrity check failed!');
                process.exit(1);
            }
            // Показываем статистику
            const stats = this.encryptionManager.getEncryptionStats();
            console.log('\n📊 Encryption Manager Stats:', stats);
        }
        catch (error) {
            console.error('❌ Encryption test failed:', error);
            process.exit(1);
        }
    }
    async cleanup() {
        if (this.sequelize) {
            await this.sequelize.close();
            console.log('✅ Database connection closed');
        }
    }
}
// Настройка CLI команд
const program = new commander_1.Command();
const cli = new EncryptionMigrationCLI();
program
    .name('migrate-encryption')
    .description('CLI utility for migrating sensitive data to encrypted format')
    .version('1.0.0')
    .hook('preAction', async () => {
    await cli.initialize();
})
    .hook('postAction', async () => {
    await cli.cleanup();
});
program
    .command('migrate')
    .description('Migrate existing sensitive data to encrypted format')
    .option('--dry-run', 'Run without making actual changes', false)
    .option('--batch-size <size>', 'Number of records to process in each batch', '100')
    .option('--table <name>', 'Migrate only specific table (mix_requests, audit_logs)')
    .action(async (options) => {
    await cli.migrate({
        dryRun: options.dryRun,
        batchSize: parseInt(options.batchSize),
        table: options.table
    });
});
program
    .command('status')
    .description('Check migration status and progress')
    .action(async () => {
    await cli.status();
});
program
    .command('rollback')
    .description('Rollback encryption migration (restore plain text data)')
    .option('--dry-run', 'Run without making actual changes', false)
    .option('--table <name>', 'Rollback only specific table (mix_requests, audit_logs)')
    .action(async (options) => {
    await cli.rollback({
        dryRun: options.dryRun,
        table: options.table
    });
});
program
    .command('test')
    .description('Test encryption/decryption functionality')
    .action(async () => {
    await cli.testEncryption();
});
// Запуск CLI
if (require.main === module) {
    program.parseAsync(process.argv).catch((error) => {
        console.error('❌ CLI execution failed:', error);
        process.exit(1);
    });
}
exports.default = EncryptionMigrationCLI;
//# sourceMappingURL=migrate-encryption.js.map