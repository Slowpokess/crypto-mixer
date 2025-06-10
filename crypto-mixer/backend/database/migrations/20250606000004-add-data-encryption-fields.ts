import { QueryInterface, DataTypes, QueryTypes } from 'sequelize';

/**
 * Миграция для добавления полей шифрования чувствительных данных
 * Добавляет зашифрованные версии существующих полей с чувствительной информацией
 */
export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  console.log('🔒 Starting data encryption migration...');

  try {
    // === MIX_REQUESTS: Добавление зашифрованных полей ===
    console.log('📝 Adding encrypted fields to mix_requests table...');
    
    await queryInterface.addColumn('mix_requests', 'ipAddress_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted IP address data using AES-256-GCM'
    });

    await queryInterface.addColumn('mix_requests', 'userAgent_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted user agent data using AES-256-GCM'
    });

    await queryInterface.addColumn('mix_requests', 'referrer_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted referrer data using AES-256-GCM'
    });

    await queryInterface.addColumn('mix_requests', 'notes_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted notes data using AES-256-GCM'
    });

    // === AUDIT_LOGS: Добавление зашифрованных полей ===
    console.log('📝 Adding encrypted fields to audit_logs table...');

    await queryInterface.addColumn('audit_logs', 'details_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted audit details using AES-256-GCM'
    });

    await queryInterface.addColumn('audit_logs', 'oldValues_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted old values using AES-256-GCM'
    });

    await queryInterface.addColumn('audit_logs', 'newValues_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted new values using AES-256-GCM'
    });

    await queryInterface.addColumn('audit_logs', 'ipAddress_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted IP address data using AES-256-GCM'
    });

    await queryInterface.addColumn('audit_logs', 'userAgent_encrypted', {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Encrypted user agent data using AES-256-GCM'
    });

    // === DEPOSIT_ADDRESSES: Добавление зашифрованных полей (если есть чувствительные данные) ===
    console.log('📝 Adding encrypted fields to deposit_addresses table...');

    // Проверяем существование таблицы deposit_addresses
    const tableExists = await queryInterface.tableExists('deposit_addresses');
    if (tableExists) {
      await queryInterface.addColumn('deposit_addresses', 'metadata_encrypted', {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Encrypted metadata using AES-256-GCM'
      });
    }

    // === OUTPUT_TRANSACTIONS: Добавление зашифрованных полей ===
    console.log('📝 Adding encrypted fields to output_transactions table...');

    const outputTxTableExists = await queryInterface.tableExists('output_transactions');
    if (outputTxTableExists) {
      await queryInterface.addColumn('output_transactions', 'metadata_encrypted', {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Encrypted transaction metadata using AES-256-GCM'
      });
    }

    // === WALLETS: Добавление зашифрованных полей ===
    console.log('📝 Adding encrypted fields to wallets table...');

    const walletsTableExists = await queryInterface.tableExists('wallets');
    if (walletsTableExists) {
      await queryInterface.addColumn('wallets', 'notes_encrypted', {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Encrypted notes using AES-256-GCM'
      });
    }

    // === Создание индексов для оптимизации ===
    console.log('📝 Creating indexes for encrypted fields...');

    // Индексы для эффективного поиска зашифрованных данных
    await queryInterface.addIndex('mix_requests', ['ipAddress_encrypted'], {
      name: 'idx_mix_requests_ip_encrypted',
      using: 'gin'
    });

    await queryInterface.addIndex('audit_logs', ['details_encrypted'], {
      name: 'idx_audit_logs_details_encrypted',
      using: 'gin'
    });

    // === Создание функции для миграции данных ===
    console.log('📝 Creating data migration helper function...');

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION migrate_sensitive_data_to_encrypted()
      RETURNS INTEGER AS $$
      DECLARE
        migrated_count INTEGER := 0;
      BEGIN
        -- Функция-заглушка для миграции данных
        -- Реальная миграция данных будет выполнена через приложение
        -- для обеспечения правильного шифрования
        
        RAISE NOTICE 'Data migration function created. Run application migration script to encrypt existing data.';
        RETURN migrated_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // === Добавление метаданных шифрования ===
    console.log('📝 Creating encryption metadata table...');

    await queryInterface.createTable('encryption_metadata', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      table_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      field_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      encryption_algorithm: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'aes-256-gcm'
      },
      key_version: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      migrated_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      migration_status: {
        type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      records_migrated: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      records_total: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Добавляем индексы для metadata
    await queryInterface.addIndex('encryption_metadata', ['table_name', 'field_name'], {
      unique: true,
      name: 'idx_encryption_metadata_table_field'
    });

    await queryInterface.addIndex('encryption_metadata', ['migration_status']);
    await queryInterface.addIndex('encryption_metadata', ['key_version']);

    // === Инициализация метаданных шифрования ===
    console.log('📝 Initializing encryption metadata...');

    const encryptionFields = [
      // MixRequest fields
      { table: 'mix_requests', field: 'ipAddress_encrypted', data_type: 'IP_ADDRESS' },
      { table: 'mix_requests', field: 'userAgent_encrypted', data_type: 'USER_METADATA' },
      { table: 'mix_requests', field: 'referrer_encrypted', data_type: 'USER_METADATA' },
      { table: 'mix_requests', field: 'notes_encrypted', data_type: 'NOTES' },
      
      // AuditLog fields
      { table: 'audit_logs', field: 'details_encrypted', data_type: 'AUDIT_DETAILS' },
      { table: 'audit_logs', field: 'oldValues_encrypted', data_type: 'AUDIT_DETAILS' },
      { table: 'audit_logs', field: 'newValues_encrypted', data_type: 'AUDIT_DETAILS' },
      { table: 'audit_logs', field: 'ipAddress_encrypted', data_type: 'IP_ADDRESS' },
      { table: 'audit_logs', field: 'userAgent_encrypted', data_type: 'USER_METADATA' }
    ];

    for (const field of encryptionFields) {
      // Получаем количество записей для миграции
      const countResults = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count FROM ${field.table}`,
        { type: QueryTypes.SELECT }
      );
      
      const totalRecords = (countResults[0] as any)?.count || 0;

      await queryInterface.bulkInsert('encryption_metadata', [{
        id: `${field.table}_${field.field}_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        table_name: field.table,
        field_name: field.field,
        encryption_algorithm: 'aes-256-gcm',
        key_version: 'initial_v1',
        migration_status: 'pending',
        records_total: totalRecords,
        records_migrated: 0,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }

    // === Создание триггеров для автоматического обновления timestamps ===
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_encryption_metadata_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_encryption_metadata_timestamp ON encryption_metadata;
      
      CREATE TRIGGER trigger_update_encryption_metadata_timestamp
        BEFORE UPDATE ON encryption_metadata
        FOR EACH ROW
        EXECUTE FUNCTION update_encryption_metadata_timestamp();
    `);

    console.log('✅ Data encryption migration completed successfully!');
    console.log('');
    console.log('🔒 NEXT STEPS:');
    console.log('1. Run application data migration script to encrypt existing sensitive data');
    console.log('2. Set DATA_ENCRYPTION_KEY environment variable');
    console.log('3. Test encryption/decryption functionality');
    console.log('4. Monitor encryption_metadata table for migration progress');

  } catch (error) {
    console.error('❌ Data encryption migration failed:', error);
    throw error;
  }
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  console.log('🔄 Rolling back data encryption migration...');

  try {
    // Удаляем функции и триггеры
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trigger_update_encryption_metadata_timestamp ON encryption_metadata;
      DROP FUNCTION IF EXISTS update_encryption_metadata_timestamp();
      DROP FUNCTION IF EXISTS migrate_sensitive_data_to_encrypted();
    `);

    // Удаляем таблицу метаданных
    await queryInterface.dropTable('encryption_metadata');

    // Удаляем зашифрованные поля из mix_requests
    const mixRequestsColumns = ['ipAddress_encrypted', 'userAgent_encrypted', 'referrer_encrypted', 'notes_encrypted'];
    for (const column of mixRequestsColumns) {
      try {
        await queryInterface.removeColumn('mix_requests', column);
      } catch (error) {
        console.warn(`⚠️ Column ${column} might not exist in mix_requests:`, error);
      }
    }

    // Удаляем зашифрованные поля из audit_logs
    const auditLogColumns = ['details_encrypted', 'oldValues_encrypted', 'newValues_encrypted', 'ipAddress_encrypted', 'userAgent_encrypted'];
    for (const column of auditLogColumns) {
      try {
        await queryInterface.removeColumn('audit_logs', column);
      } catch (error) {
        console.warn(`⚠️ Column ${column} might not exist in audit_logs:`, error);
      }
    }

    // Удаляем зашифрованные поля из других таблиц (если существуют)
    const tablesAndColumns = [
      { table: 'deposit_addresses', columns: ['metadata_encrypted'] },
      { table: 'output_transactions', columns: ['metadata_encrypted'] },
      { table: 'wallets', columns: ['notes_encrypted'] }
    ];

    for (const { table, columns } of tablesAndColumns) {
      const tableExists = await queryInterface.tableExists(table);
      if (tableExists) {
        for (const column of columns) {
          try {
            await queryInterface.removeColumn(table, column);
          } catch (error) {
            console.warn(`⚠️ Column ${column} might not exist in ${table}:`, error);
          }
        }
      }
    }

    // Удаляем индексы
    const indexesToDrop = [
      { table: 'mix_requests', index: 'idx_mix_requests_ip_encrypted' },
      { table: 'audit_logs', index: 'idx_audit_logs_details_encrypted' }
    ];

    for (const { table, index } of indexesToDrop) {
      try {
        await queryInterface.removeIndex(table, index);
      } catch (error) {
        console.warn(`⚠️ Index ${index} might not exist:`, error);
      }
    }

    console.log('✅ Data encryption migration rollback completed!');
    console.log('⚠️  WARNING: Original sensitive data is still in plain text columns');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};