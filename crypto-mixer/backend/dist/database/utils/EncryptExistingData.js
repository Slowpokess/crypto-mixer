"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExistingDataEncryptionMigrator = void 0;
const sequelize_1 = require("sequelize");
const DataEncryption_1 = require("./DataEncryption");
/**
 * Утилита для миграции существующих чувствительных данных в зашифрованном виде
 * Переносит открытые данные в зашифрованные поля с возможностью отката
 */
class ExistingDataEncryptionMigrator {
    constructor(sequelize, encryptionManager, options = {}) {
        this.batchSize = 100;
        this.sequelize = sequelize;
        this.encryptionManager = encryptionManager || new DataEncryption_1.DataEncryptionManager();
        this.batchSize = options.batchSize || 100;
        this.dryRun = options.dryRun || false;
    }
    /**
     * Полная миграция всех чувствительных данных
     */
    async migrateAllSensitiveData() {
        console.log('🔒 Starting full sensitive data migration...');
        console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);
        const results = {
            success: true,
            totalRecords: 0,
            migratedRecords: 0,
            errors: []
        };
        try {
            // Миграция таблицы mix_requests
            const mixRequestsResult = await this.migrateMixRequestsData();
            results.totalRecords += mixRequestsResult.totalRecords;
            results.migratedRecords += mixRequestsResult.migratedRecords;
            results.errors.push(...mixRequestsResult.errors);
            // Миграция таблицы audit_logs
            const auditLogsResult = await this.migrateAuditLogsData();
            results.totalRecords += auditLogsResult.totalRecords;
            results.migratedRecords += auditLogsResult.migratedRecords;
            results.errors.push(...auditLogsResult.errors);
            if (results.errors.length > 0) {
                results.success = false;
                console.log(`⚠️ Migration completed with ${results.errors.length} errors`);
            }
            else {
                console.log('✅ All sensitive data migration completed successfully');
            }
            // Обновляем метаданные миграции
            if (!this.dryRun) {
                await this.updateMigrationMetadata();
            }
            return results;
        }
        catch (error) {
            console.error('❌ Migration failed:', error);
            results.success = false;
            results.errors.push(error);
            return results;
        }
    }
    /**
     * Миграция данных таблицы mix_requests
     */
    async migrateMixRequestsData() {
        console.log('📝 Migrating mix_requests sensitive data...');
        const fieldsToMigrate = [
            { source: 'ipAddress', target: 'ipAddress_encrypted', type: DataEncryption_1.SensitiveDataType.IP_ADDRESS },
            { source: 'userAgent', target: 'userAgent_encrypted', type: DataEncryption_1.SensitiveDataType.USER_METADATA },
            { source: 'referrer', target: 'referrer_encrypted', type: DataEncryption_1.SensitiveDataType.USER_METADATA },
            { source: 'notes', target: 'notes_encrypted', type: DataEncryption_1.SensitiveDataType.NOTES }
        ];
        return await this.migrateTableData('mix_requests', fieldsToMigrate);
    }
    /**
     * Миграция данных таблицы audit_logs
     */
    async migrateAuditLogsData() {
        console.log('📝 Migrating audit_logs sensitive data...');
        const fieldsToMigrate = [
            { source: 'details', target: 'details_encrypted', type: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS },
            { source: 'oldValues', target: 'oldValues_encrypted', type: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS },
            { source: 'newValues', target: 'newValues_encrypted', type: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS },
            { source: 'ipAddress', target: 'ipAddress_encrypted', type: DataEncryption_1.SensitiveDataType.IP_ADDRESS },
            { source: 'userAgent', target: 'userAgent_encrypted', type: DataEncryption_1.SensitiveDataType.USER_METADATA }
        ];
        return await this.migrateTableData('audit_logs', fieldsToMigrate);
    }
    /**
     * Миграция данных для конкретной таблицы
     */
    async migrateTableData(tableName, fieldsToMigrate) {
        const result = {
            totalRecords: 0,
            migratedRecords: 0,
            errors: []
        };
        try {
            // Получаем общее количество записей
            const [countResult] = await this.sequelize.query(`SELECT COUNT(*) as count FROM ${tableName}`, { type: sequelize_1.QueryTypes.SELECT });
            result.totalRecords = countResult.count;
            console.log(`📊 Found ${result.totalRecords} records in ${tableName}`);
            if (result.totalRecords === 0) {
                return result;
            }
            // Обрабатываем записи batch-ами
            let offset = 0;
            while (offset < result.totalRecords) {
                try {
                    const batchResult = await this.migrateBatch(tableName, fieldsToMigrate, offset);
                    result.migratedRecords += batchResult.migratedRecords;
                    result.errors.push(...batchResult.errors);
                    offset += this.batchSize;
                    // Показываем прогресс
                    const progress = Math.min(100, (offset / result.totalRecords) * 100);
                    console.log(`📈 ${tableName} migration progress: ${progress.toFixed(1)}% (${Math.min(offset, result.totalRecords)}/${result.totalRecords})`);
                }
                catch (error) {
                    console.error(`❌ Batch migration failed for ${tableName} at offset ${offset}:`, error);
                    result.errors.push({
                        table: tableName,
                        offset,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    offset += this.batchSize; // Пропускаем проблемный batch
                }
            }
            console.log(`✅ ${tableName} migration completed: ${result.migratedRecords}/${result.totalRecords} records`);
        }
        catch (error) {
            console.error(`❌ Table migration failed for ${tableName}:`, error);
            result.errors.push({
                table: tableName,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return result;
    }
    /**
     * Миграция одного batch-а записей
     */
    async migrateBatch(tableName, fieldsToMigrate, offset) {
        const result = {
            migratedRecords: 0,
            errors: []
        };
        // Получаем записи для обработки
        const sourceFields = fieldsToMigrate.map(f => f.source).join(', ');
        const records = await this.sequelize.query(`SELECT id, ${sourceFields} FROM ${tableName} ORDER BY id LIMIT ${this.batchSize} OFFSET ${offset}`, { type: sequelize_1.QueryTypes.SELECT });
        if (records.length === 0) {
            return result;
        }
        // Обрабатываем каждую запись
        for (const record of records) {
            try {
                const updateSets = [];
                const replacements = { recordId: record.id };
                // Обрабатываем каждое поле для шифрования
                for (const field of fieldsToMigrate) {
                    const sourceValue = record[field.source];
                    if (sourceValue !== null && sourceValue !== undefined) {
                        // Шифруем значение
                        const encryptedData = await this.encryptionManager.encryptSensitiveData(sourceValue, field.type);
                        updateSets.push(`${field.target} = :${field.target}`);
                        replacements[field.target] = JSON.stringify(encryptedData);
                    }
                }
                // Выполняем обновление, если есть данные для шифрования
                if (updateSets.length > 0 && !this.dryRun) {
                    await this.sequelize.query(`UPDATE ${tableName} SET ${updateSets.join(', ')} WHERE id = :recordId`, { replacements });
                }
                result.migratedRecords++;
            }
            catch (error) {
                console.error(`❌ Failed to encrypt record ${record.id} in ${tableName}:`, error);
                result.errors.push({
                    table: tableName,
                    recordId: record.id,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        return result;
    }
    /**
     * Обновление метаданных миграции
     */
    async updateMigrationMetadata() {
        console.log('📝 Updating migration metadata...');
        try {
            // Получаем статистику по каждой таблице и полю
            const metadataUpdates = [
                // mix_requests
                { table: 'mix_requests', field: 'ipAddress_encrypted' },
                { table: 'mix_requests', field: 'userAgent_encrypted' },
                { table: 'mix_requests', field: 'referrer_encrypted' },
                { table: 'mix_requests', field: 'notes_encrypted' },
                // audit_logs
                { table: 'audit_logs', field: 'details_encrypted' },
                { table: 'audit_logs', field: 'oldValues_encrypted' },
                { table: 'audit_logs', field: 'newValues_encrypted' },
                { table: 'audit_logs', field: 'ipAddress_encrypted' },
                { table: 'audit_logs', field: 'userAgent_encrypted' }
            ];
            for (const metadata of metadataUpdates) {
                try {
                    // Подсчитываем мигрированные записи
                    const [migratedCount] = await this.sequelize.query(`SELECT COUNT(*) as count FROM ${metadata.table} WHERE ${metadata.field} IS NOT NULL`, { type: sequelize_1.QueryTypes.SELECT });
                    const migratedRecords = migratedCount.count || 0;
                    // Обновляем метаданные
                    await this.sequelize.query(`UPDATE encryption_metadata 
             SET migration_status = 'completed',
                 records_migrated = :migratedRecords,
                 migrated_at = NOW(),
                 updated_at = NOW()
             WHERE table_name = :tableName AND field_name = :fieldName`, {
                        replacements: {
                            migratedRecords,
                            tableName: metadata.table,
                            fieldName: metadata.field
                        }
                    });
                }
                catch (error) {
                    console.error(`❌ Failed to update metadata for ${metadata.table}.${metadata.field}:`, error);
                }
            }
            console.log('✅ Migration metadata updated successfully');
        }
        catch (error) {
            console.error('❌ Failed to update migration metadata:', error);
        }
    }
    /**
     * Проверка статуса миграции
     */
    async getMigrationStatus() {
        console.log('📊 Checking migration status...');
        try {
            const metadata = await this.sequelize.query(`SELECT table_name, field_name, migration_status, records_total, records_migrated, migrated_at
         FROM encryption_metadata
         ORDER BY table_name, field_name`, { type: sequelize_1.QueryTypes.SELECT });
            const progress = {};
            const summary = {
                totalTables: 0,
                completedTables: 0,
                totalFields: metadata.length,
                completedFields: 0,
                totalRecords: 0,
                migratedRecords: 0
            };
            const tables = new Set();
            for (const record of metadata) {
                const tableName = record.table_name;
                tables.add(tableName);
                if (!progress[tableName]) {
                    progress[tableName] = {
                        fields: {},
                        totalRecords: 0,
                        migratedRecords: 0,
                        completed: true
                    };
                }
                progress[tableName].fields[record.field_name] = {
                    status: record.migration_status,
                    total: record.records_total,
                    migrated: record.records_migrated,
                    migratedAt: record.migrated_at
                };
                progress[tableName].totalRecords += record.records_total;
                progress[tableName].migratedRecords += record.records_migrated;
                if (record.migration_status !== 'completed') {
                    progress[tableName].completed = false;
                }
                else {
                    summary.completedFields++;
                }
                summary.totalRecords += record.records_total;
                summary.migratedRecords += record.records_migrated;
            }
            summary.totalTables = tables.size;
            summary.completedTables = Object.values(progress).filter((table) => table.completed).length;
            const completed = summary.completedFields === summary.totalFields;
            console.log('📈 Migration Status:', {
                completed,
                'Fields Progress': `${summary.completedFields}/${summary.totalFields}`,
                'Records Progress': `${summary.migratedRecords}/${summary.totalRecords}`,
                'Tables Progress': `${summary.completedTables}/${summary.totalTables}`
            });
            return {
                completed,
                progress,
                summary
            };
        }
        catch (error) {
            console.error('❌ Failed to get migration status:', error);
            throw error;
        }
    }
    /**
     * Откат миграции (расшифровка и восстановление исходных данных)
     */
    async rollbackMigration(tableName) {
        console.log(`🔄 Rolling back encryption migration${tableName ? ` for ${tableName}` : ''}...`);
        console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE ROLLBACK'}`);
        const result = {
            success: true,
            restoredRecords: 0,
            errors: []
        };
        try {
            const tables = tableName ? [tableName] : ['mix_requests', 'audit_logs'];
            for (const table of tables) {
                const tableResult = await this.rollbackTableData(table);
                result.restoredRecords += tableResult.restoredRecords;
                result.errors.push(...tableResult.errors);
            }
            if (result.errors.length > 0) {
                result.success = false;
                console.log(`⚠️ Rollback completed with ${result.errors.length} errors`);
            }
            else {
                console.log('✅ Encryption rollback completed successfully');
            }
            return result;
        }
        catch (error) {
            console.error('❌ Rollback failed:', error);
            result.success = false;
            result.errors.push(error);
            return result;
        }
    }
    /**
     * Откат данных для конкретной таблицы
     */
    async rollbackTableData(tableName) {
        const result = {
            restoredRecords: 0,
            errors: []
        };
        try {
            const fieldsMap = tableName === 'mix_requests' ? {
                'ipAddress_encrypted': 'ipAddress',
                'userAgent_encrypted': 'userAgent',
                'referrer_encrypted': 'referrer',
                'notes_encrypted': 'notes'
            } : {
                'details_encrypted': 'details',
                'oldValues_encrypted': 'oldValues',
                'newValues_encrypted': 'newValues',
                'ipAddress_encrypted': 'ipAddress',
                'userAgent_encrypted': 'userAgent'
            };
            // Получаем записи с зашифрованными данными
            const encryptedFields = Object.keys(fieldsMap).join(', ');
            const records = await this.sequelize.query(`SELECT id, ${encryptedFields} FROM ${tableName} WHERE ${Object.keys(fieldsMap).map(f => `${f} IS NOT NULL`).join(' OR ')}`, { type: sequelize_1.QueryTypes.SELECT });
            console.log(`📊 Found ${records.length} records to restore in ${tableName}`);
            for (const record of records) {
                try {
                    const updateSets = [];
                    const replacements = { recordId: record.id };
                    for (const [encryptedField, originalField] of Object.entries(fieldsMap)) {
                        const encryptedValue = record[encryptedField];
                        if (encryptedValue) {
                            try {
                                // Расшифровываем данные
                                const decryptedValue = await this.encryptionManager.decryptSensitiveData(encryptedValue);
                                updateSets.push(`${originalField} = :${originalField}`);
                                replacements[originalField] = decryptedValue;
                                // Очищаем зашифрованное поле
                                updateSets.push(`${encryptedField} = NULL`);
                            }
                            catch (decryptError) {
                                console.error(`❌ Failed to decrypt ${encryptedField} for record ${record.id}:`, decryptError);
                            }
                        }
                    }
                    // Выполняем обновление
                    if (updateSets.length > 0 && !this.dryRun) {
                        await this.sequelize.query(`UPDATE ${tableName} SET ${updateSets.join(', ')} WHERE id = :recordId`, { replacements });
                    }
                    result.restoredRecords++;
                }
                catch (error) {
                    console.error(`❌ Failed to restore record ${record.id} in ${tableName}:`, error);
                    result.errors.push({
                        table: tableName,
                        recordId: record.id,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            console.log(`✅ ${tableName} rollback completed: ${result.restoredRecords} records restored`);
        }
        catch (error) {
            console.error(`❌ Table rollback failed for ${tableName}:`, error);
            result.errors.push({
                table: tableName,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return result;
    }
}
exports.ExistingDataEncryptionMigrator = ExistingDataEncryptionMigrator;
exports.default = ExistingDataEncryptionMigrator;
//# sourceMappingURL=EncryptExistingData.js.map