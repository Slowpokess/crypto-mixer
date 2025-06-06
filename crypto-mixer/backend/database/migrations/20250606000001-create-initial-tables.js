/**
 * Миграция: Создание базовых таблиц системы микширования
 * Создана: 2025-06-06T00:00:01.000Z
 */

module.exports = {
  /**
   * Применение миграции - создание всех основных таблиц
   */
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1. Создание ENUM типов
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        -- Создание типов валют
        CREATE TYPE currency_type AS ENUM ('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        -- Создание типов статусов микширования
        CREATE TYPE mix_status AS ENUM (
          'PENDING_DEPOSIT', 'DEPOSIT_RECEIVED', 'PROCESSING', 
          'MIXING', 'SENDING', 'COMPLETED', 'FAILED', 'EXPIRED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        -- Создание типов кошельков
        CREATE TYPE wallet_type AS ENUM ('HOT', 'COLD', 'BUFFER');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Создание таблицы mix_requests
    await queryInterface.createTable('mix_requests', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      session_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false
      },
      fee: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.5
      },
      total_amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false
      },
      deposit_address: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      output_addresses: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      delay_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.ENUM(
          'PENDING_DEPOSIT', 'DEPOSIT_RECEIVED', 'PROCESSING',
          'MIXING', 'SENDING', 'COMPLETED', 'FAILED', 'EXPIRED'
        ),
        allowNull: false,
        defaultValue: 'PENDING_DEPOSIT'
      },
      confirmations: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      deposit_tx_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true
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

    // 3. Создание таблицы deposit_addresses
    await queryInterface.createTable('deposit_addresses', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      mix_request_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'mix_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      address: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
      },
      private_key_encrypted: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      encryption_iv: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      first_used_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      derivation_path: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      address_index: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // 4. Создание таблицы output_transactions
    await queryInterface.createTable('output_transactions', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      mix_request_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'mix_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      output_address: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      scheduled_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      tx_hash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true
      },
      confirmations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: DataTypes.ENUM(
          'PENDING', 'SCHEDULED', 'BROADCASTING', 'SENT', 
          'CONFIRMED', 'FAILED', 'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_error: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      network_fee: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true
      },
      priority: {
        type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
        allowNull: false,
        defaultValue: 'MEDIUM'
      },
      block_number: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      block_hash: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      transaction_index: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      transaction_data: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // 5. Создание таблицы wallets
    await queryInterface.createTable('wallets', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      address: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
      },
      private_key_encrypted: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      encryption_iv: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      wallet_type: {
        type: DataTypes.ENUM('HOT', 'COLD', 'BUFFER'),
        allowNull: false
      },
      balance: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false,
        defaultValue: 0
      },
      reserved_balance: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false,
        defaultValue: 0
      },
      last_used: {
        type: DataTypes.DATE,
        allowNull: true
      },
      balance_updated_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100
      },
      max_balance: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true
      },
      min_balance: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true
      },
      derivation_path: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      public_key: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      security_settings: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          multi_sig: false,
          requires_confirmation: false,
          max_daily_amount: null,
          whitelist_only: false
        }
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

    // 6. Создание таблицы monitored_addresses
    await queryInterface.createTable('monitored_addresses', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      address: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      mix_request_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'mix_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      detected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      detected_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      last_checked_block: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      last_checked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      check_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      check_interval: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 30
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      min_amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true,
        defaultValue: 0
      },
      detected_transactions: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      total_detected_amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false,
        defaultValue: 0
      },
      monitoring_stats: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          total_checks: 0,
          successful_checks: 0,
          failed_checks: 0,
          last_error: null,
          average_response_time: 0
        }
      },
      notification_settings: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          webhook_url: null,
          email_notifications: false,
          telegram_notifications: false
        }
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

    // 7. Создание таблицы transaction_pool
    await queryInterface.createTable('transaction_pool', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false
      },
      source_mix_request_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'mix_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      added_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100
      },
      chunk_size: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true
      },
      pool_type: {
        type: DataTypes.ENUM('STANDARD', 'HIGH_VOLUME', 'PREMIUM', 'EXPRESS'),
        allowNull: false,
        defaultValue: 'STANDARD'
      },
      max_wait_time: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      mixing_group_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      mixing_metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          algorithm: 'coinjoin',
          mixing_rounds: 1,
          min_participants: 3,
          anonymity_set_size: 0
        }
      },
      usage_stats: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {
          times_mixed: 0,
          last_mixed_at: null,
          total_mixed_amount: 0,
          mixing_efficiency: 0
        }
      },
      output_transactions: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      distribution_strategy: {
        type: DataTypes.ENUM('EQUAL', 'WEIGHTED', 'RANDOM', 'OPTIMIZED'),
        allowNull: false,
        defaultValue: 'OPTIMIZED'
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

    // 8. Создание таблицы blockchain_transactions (партиционированная)
    await queryInterface.createTable('blockchain_transactions', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
        allowNull: false
      },
      tx_hash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
      },
      from_address: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      to_address: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: false
      },
      fee: {
        type: DataTypes.DECIMAL(30, 18),
        allowNull: true
      },
      confirmations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      block_number: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      block_hash: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'DROPPED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      transaction_index: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      nonce: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      gas_price: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      gas_limit: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      gas_used: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      input_data: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      logs: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      related_addresses: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      transaction_type: {
        type: DataTypes.ENUM('DEPOSIT', 'WITHDRAWAL', 'INTERNAL', 'FEE', 'CONTRACT'),
        allowNull: false,
        defaultValue: 'INTERNAL'
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      status_updated_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      processing_attempts: {
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

    // 9. Создание таблицы system_config
    await queryInterface.createTable('system_config', {
      key: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      category: {
        type: DataTypes.ENUM(
          'MIXING', 'SECURITY', 'BLOCKCHAIN', 'FEES', 'LIMITS',
          'NOTIFICATIONS', 'MONITORING', 'PERFORMANCE', 'MAINTENANCE', 'SYSTEM'
        ),
        allowNull: false,
        defaultValue: 'SYSTEM'
      },
      value_type: {
        type: DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY'),
        allowNull: false,
        defaultValue: 'STRING'
      },
      is_critical: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      requires_restart: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      read_only: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      encrypted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      validation_rules: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      default_value: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      last_modified_by: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      tags: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      environment: {
        type: DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
        allowNull: false,
        defaultValue: 'ALL'
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

    // 10. Создание таблицы audit_log
    await queryInterface.createTable('audit_log', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      event_type: {
        type: DataTypes.ENUM(
          'MIX_REQUEST_CREATED', 'MIX_REQUEST_UPDATED', 'MIX_REQUEST_COMPLETED', 'MIX_REQUEST_FAILED',
          'DEPOSIT_RECEIVED', 'TRANSACTION_SENT', 'WALLET_CREATED', 'WALLET_ACCESSED',
          'CONFIG_CHANGED', 'SECURITY_ALERT', 'SYSTEM_STARTUP', 'SYSTEM_SHUTDOWN',
          'LOGIN_ATTEMPT', 'API_ACCESS', 'DATABASE_OPERATION', 'BLOCKCHAIN_EVENT',
          'MIXING_POOL_EVENT', 'MONITORING_EVENT', 'ERROR_EVENT', 'ADMIN_ACTION'
        ),
        allowNull: false
      },
      event_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      ip_address: {
        type: DataTypes.INET,
        allowNull: true
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      session_id: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      user_id: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      service_name: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      severity: {
        type: DataTypes.ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'),
        allowNull: false,
        defaultValue: 'INFO'
      },
      operation_status: {
        type: DataTypes.ENUM('SUCCESS', 'FAILURE', 'PENDING', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'SUCCESS'
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      operation_context: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      previous_state: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      new_state: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      error_stack: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      related_objects: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      tags: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: []
      },
      integrity_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
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

    console.log('✅ Все основные таблицы созданы');
  },

  /**
   * Откат миграции - удаление всех таблиц
   */
  async down(queryInterface, Sequelize) {
    // Удаление таблиц в обратном порядке (с учетом внешних ключей)
    await queryInterface.dropTable('audit_log');
    await queryInterface.dropTable('system_config');
    await queryInterface.dropTable('blockchain_transactions');
    await queryInterface.dropTable('transaction_pool');
    await queryInterface.dropTable('monitored_addresses');
    await queryInterface.dropTable('output_transactions');
    await queryInterface.dropTable('deposit_addresses');
    await queryInterface.dropTable('wallets');
    await queryInterface.dropTable('mix_requests');

    // Удаление ENUM типов
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS currency_type CASCADE');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS mix_status CASCADE');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS wallet_type CASCADE');

    console.log('✅ Все таблицы удалены');
  }
};