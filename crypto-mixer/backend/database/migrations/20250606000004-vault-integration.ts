import { QueryInterface, Sequelize, DataTypes } from 'sequelize';

/**
 * Миграция для интеграции с Vault/HSM системой
 * 
 * Изменения:
 * 1. Удаление encryptedPrivateKey из таблиц wallets и deposit_addresses
 * 2. Добавление vault_key_id, key_algorithm, is_hsm_key
 * 3. Создание таблицы для аудита ключей
 * 4. Добавление индексов для производительности
 */

export const up = async (queryInterface: QueryInterface, Sequelize: any) => {
  console.log('🔐 Начало миграции для интеграции с Vault/HSM...');

  // 1. Создаем таблицу для аудита операций с ключами
  await queryInterface.createTable('key_audit_logs', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    vault_key_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: 'ID ключа в Vault/HSM'
    },
    operation: {
      type: DataTypes.ENUM('generate', 'access', 'rotate', 'delete', 'sign'),
      allowNull: false,
      comment: 'Тип операции с ключом'
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent клиента'
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true,
      comment: 'IP адрес клиента'
    },
    request_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'ID запроса для трассировки'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'pending'),
      allowNull: false,
      defaultValue: 'pending'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Сообщение об ошибке если операция неуспешна'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Дополнительные метаданные операции'
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

  console.log('✅ Создана таблица key_audit_logs');

  // 2. Резервное копирование существующих зашифрованных ключей
  console.log('📦 Создание резервной копии существующих ключей...');
  
  await queryInterface.createTable('legacy_encrypted_keys_backup', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    original_table: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    original_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    encrypted_private_key: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    address: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    backed_up_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Резервное копирование ключей из wallets
  await queryInterface.sequelize.query(`
    INSERT INTO legacy_encrypted_keys_backup 
      (original_table, original_id, encrypted_private_key, currency, address)
    SELECT 
      'wallets' as original_table,
      id as original_id,
      encrypted_private_key,
      currency,
      address
    FROM wallets 
    WHERE encrypted_private_key IS NOT NULL
  `);

  // Резервное копирование ключей из deposit_addresses
  await queryInterface.sequelize.query(`
    INSERT INTO legacy_encrypted_keys_backup 
      (original_table, original_id, encrypted_private_key, currency, address)
    SELECT 
      'deposit_addresses' as original_table,
      id as original_id,
      private_key_encrypted as encrypted_private_key,
      currency,
      address
    FROM deposit_addresses 
    WHERE private_key_encrypted IS NOT NULL
  `);

  console.log('✅ Резервная копия ключей создана');

  // 3. Обновляем таблицу wallets
  console.log('🔄 Обновление таблицы wallets...');

  // Добавляем новые колонки
  await queryInterface.addColumn('wallets', 'vault_key_id', {
    type: DataTypes.STRING(128),
    allowNull: true,
    comment: 'ID ключа в Vault/HSM системе'
  });

  await queryInterface.addColumn('wallets', 'key_algorithm', {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: 'secp256k1',
    comment: 'Алгоритм криптографического ключа'
  });

  await queryInterface.addColumn('wallets', 'is_hsm_key', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Флаг использования HSM для данного ключа'
  });

  await queryInterface.addColumn('wallets', 'key_created_at', {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время создания ключа в Vault/HSM'
  });

  await queryInterface.addColumn('wallets', 'last_key_rotation', {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Время последней ротации ключа'
  });

  // Удаляем старую колонку (после резервного копирования)
  await queryInterface.removeColumn('wallets', 'encrypted_private_key');

  console.log('✅ Таблица wallets обновлена');

  // 4. Обновляем таблицу deposit_addresses
  console.log('🔄 Обновление таблицы deposit_addresses...');

  await queryInterface.addColumn('deposit_addresses', 'vault_key_id', {
    type: DataTypes.STRING(128),
    allowNull: true,
    comment: 'ID ключа в Vault/HSM системе'
  });

  await queryInterface.addColumn('deposit_addresses', 'key_algorithm', {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: 'secp256k1',
    comment: 'Алгоритм криптографического ключа'
  });

  await queryInterface.addColumn('deposit_addresses', 'is_hsm_key', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Флаг использования HSM для данного ключа'
  });

  // Удаляем старую колонку
  await queryInterface.removeColumn('deposit_addresses', 'private_key_encrypted');

  console.log('✅ Таблица deposit_addresses обновлена');

  // 5. Создаем индексы для производительности
  console.log('📊 Создание индексов...');

  // Индексы для key_audit_logs
  await queryInterface.addIndex('key_audit_logs', ['vault_key_id'], {
    name: 'idx_key_audit_vault_key_id'
  });

  await queryInterface.addIndex('key_audit_logs', ['operation', 'status'], {
    name: 'idx_key_audit_operation_status'
  });

  await queryInterface.addIndex('key_audit_logs', ['created_at'], {
    name: 'idx_key_audit_created_at'
  });

  // Индексы для wallets
  await queryInterface.addIndex('wallets', ['vault_key_id'], {
    name: 'idx_wallets_vault_key_id',
    unique: true,
    where: {
      vault_key_id: {
        [Sequelize.Op.ne]: null
      }
    }
  });

  await queryInterface.addIndex('wallets', ['is_hsm_key', 'currency'], {
    name: 'idx_wallets_hsm_currency'
  });

  // Индексы для deposit_addresses
  await queryInterface.addIndex('deposit_addresses', ['vault_key_id'], {
    name: 'idx_deposit_addresses_vault_key_id',
    unique: true,
    where: {
      vault_key_id: {
        [Sequelize.Op.ne]: null
      }
    }
  });

  console.log('✅ Индексы созданы');

  // 6. Создаем функцию для автоматического аудита
  console.log('🔧 Создание функций аудита...');

  await queryInterface.sequelize.query(`
    CREATE OR REPLACE FUNCTION log_key_operation() RETURNS TRIGGER AS $$
    BEGIN
      -- Логируем изменения vault_key_id
      IF TG_OP = 'UPDATE' AND OLD.vault_key_id IS DISTINCT FROM NEW.vault_key_id THEN
        INSERT INTO key_audit_logs (vault_key_id, operation, currency, status, metadata)
        VALUES (
          COALESCE(NEW.vault_key_id, OLD.vault_key_id),
          'rotate',
          NEW.currency,
          'success',
          jsonb_build_object(
            'old_key_id', OLD.vault_key_id,
            'new_key_id', NEW.vault_key_id,
            'table', TG_TABLE_NAME
          )
        );
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Создаем триггеры для автоматического аудита
  await queryInterface.sequelize.query(`
    CREATE TRIGGER wallets_key_audit_trigger
      AFTER UPDATE ON wallets
      FOR EACH ROW
      EXECUTE FUNCTION log_key_operation();
  `);

  await queryInterface.sequelize.query(`
    CREATE TRIGGER deposit_addresses_key_audit_trigger
      AFTER UPDATE ON deposit_addresses
      FOR EACH ROW
      EXECUTE FUNCTION log_key_operation();
  `);

  console.log('✅ Триггеры аудита созданы');

  // 7. Создаем view для удобного мониторинга ключей
  await queryInterface.sequelize.query(`
    CREATE VIEW key_management_summary AS
    SELECT 
      'wallets' as source_table,
      currency,
      COUNT(*) as total_keys,
      COUNT(vault_key_id) as vault_keys,
      COUNT(CASE WHEN is_hsm_key THEN 1 END) as hsm_keys,
      COUNT(CASE WHEN NOT is_hsm_key AND vault_key_id IS NOT NULL THEN 1 END) as software_keys
    FROM wallets
    GROUP BY currency
    
    UNION ALL
    
    SELECT 
      'deposit_addresses' as source_table,
      currency,
      COUNT(*) as total_keys,
      COUNT(vault_key_id) as vault_keys,
      COUNT(CASE WHEN is_hsm_key THEN 1 END) as hsm_keys,
      COUNT(CASE WHEN NOT is_hsm_key AND vault_key_id IS NOT NULL THEN 1 END) as software_keys
    FROM deposit_addresses
    GROUP BY currency;
  `);

  console.log('✅ View для мониторинга создан');

  console.log('🎉 Миграция для интеграции с Vault/HSM завершена успешно!');
  console.log('');
  console.log('📋 Следующие шаги:');
  console.log('1. Настройте подключение к Vault в конфигурации');
  console.log('2. Запустите скрипт миграции существующих ключей в Vault');
  console.log('3. Обновите код приложения для использования новых полей');
  console.log('4. Протестируйте создание и использование ключей');
};

export const down = async (queryInterface: QueryInterface, Sequelize: any) => {
  console.log('🔄 Откат миграции Vault/HSM интеграции...');

  // Удаляем view
  await queryInterface.sequelize.query('DROP VIEW IF EXISTS key_management_summary;');

  // Удаляем триггеры
  await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS wallets_key_audit_trigger ON wallets;');
  await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS deposit_addresses_key_audit_trigger ON deposit_addresses;');

  // Удаляем функцию
  await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS log_key_operation();');

  // Удаляем индексы
  await queryInterface.removeIndex('key_audit_logs', 'idx_key_audit_vault_key_id');
  await queryInterface.removeIndex('key_audit_logs', 'idx_key_audit_operation_status');
  await queryInterface.removeIndex('key_audit_logs', 'idx_key_audit_created_at');
  await queryInterface.removeIndex('wallets', 'idx_wallets_vault_key_id');
  await queryInterface.removeIndex('wallets', 'idx_wallets_hsm_currency');
  await queryInterface.removeIndex('deposit_addresses', 'idx_deposit_addresses_vault_key_id');

  // Восстанавливаем старые колонки в wallets
  await queryInterface.addColumn('wallets', 'encrypted_private_key', {
    type: DataTypes.TEXT,
    allowNull: true
  });

  // Восстанавливаем данные из резервной копии
  await queryInterface.sequelize.query(`
    UPDATE wallets SET encrypted_private_key = backup.encrypted_private_key
    FROM legacy_encrypted_keys_backup backup
    WHERE backup.original_table = 'wallets' 
      AND backup.original_id = wallets.id
  `);

  // Удаляем новые колонки из wallets
  await queryInterface.removeColumn('wallets', 'vault_key_id');
  await queryInterface.removeColumn('wallets', 'key_algorithm');
  await queryInterface.removeColumn('wallets', 'is_hsm_key');
  await queryInterface.removeColumn('wallets', 'key_created_at');
  await queryInterface.removeColumn('wallets', 'last_key_rotation');

  // Восстанавливаем deposit_addresses
  await queryInterface.addColumn('deposit_addresses', 'private_key_encrypted', {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true
    },
    comment: 'Зашифрованный приватный ключ адреса'
  });

  await queryInterface.sequelize.query(`
    UPDATE deposit_addresses SET private_key_encrypted = backup.encrypted_private_key
    FROM legacy_encrypted_keys_backup backup
    WHERE backup.original_table = 'deposit_addresses' 
      AND backup.original_id = deposit_addresses.id
  `);

  await queryInterface.removeColumn('deposit_addresses', 'vault_key_id');
  await queryInterface.removeColumn('deposit_addresses', 'key_algorithm');
  await queryInterface.removeColumn('deposit_addresses', 'is_hsm_key');

  // Удаляем таблицы
  await queryInterface.dropTable('key_audit_logs');
  await queryInterface.dropTable('legacy_encrypted_keys_backup');

  console.log('✅ Откат миграции завершен');
};