/**
 * Миграция: Создание недостающих таблиц
 * Добавляет таблицы для мониторинга, аудита и системной конфигурации
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // MonitoredAddress - адреса для мониторинга
    await queryInterface.createTable('MonitoredAddresses', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      wallet_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'Wallets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'XMR', 'LTC', 'BCH'),
        allowNull: false
      },
      purpose: {
        type: DataTypes.ENUM('deposit', 'withdrawal', 'mixing', 'change'),
        allowNull: false
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      last_checked: {
        type: DataTypes.DATE,
        allowNull: true
      },
      balance: {
        type: DataTypes.DECIMAL(18, 8),
        defaultValue: 0
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // AuditLog - журнал аудита всех операций
    await queryInterface.createTable('AuditLogs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      entity_type: {
        type: DataTypes.ENUM('mix_request', 'wallet', 'transaction', 'user_action', 'system_event'),
        allowNull: false
      },
      entity_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      old_values: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      new_values: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      user_id: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      ip_address: {
        type: DataTypes.INET,
        allowNull: true
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      severity: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'medium'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // SystemConfig - системная конфигурация
    await queryInterface.createTable('SystemConfigs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      config_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      config_value: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      value_type: {
        type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
        defaultValue: 'string'
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      is_encrypted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      category: {
        type: DataTypes.STRING(50),
        defaultValue: 'general'
      },
      is_editable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Добавление индексов для новых таблиц
    await queryInterface.addIndex('MonitoredAddresses', ['address']);
    await queryInterface.addIndex('MonitoredAddresses', ['currency']);
    await queryInterface.addIndex('MonitoredAddresses', ['wallet_id']);
    await queryInterface.addIndex('MonitoredAddresses', ['is_active']);

    await queryInterface.addIndex('AuditLogs', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('AuditLogs', ['action']);
    await queryInterface.addIndex('AuditLogs', ['created_at']);
    await queryInterface.addIndex('AuditLogs', ['severity']);
    await queryInterface.addIndex('AuditLogs', ['user_id']);

    await queryInterface.addIndex('SystemConfigs', ['config_key']);
    await queryInterface.addIndex('SystemConfigs', ['category']);
    await queryInterface.addIndex('SystemConfigs', ['is_editable']);

    console.log('✅ Missing tables created successfully');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('SystemConfigs');
    await queryInterface.dropTable('AuditLogs');
    await queryInterface.dropTable('MonitoredAddresses');
    
    console.log('✅ Missing tables dropped successfully');
  }
};