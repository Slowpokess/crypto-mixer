import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Создаём таблицу блокчейн транзакций
  await queryInterface.createTable('blockchain_transactions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    mix_request_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'mix_requests',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
      allowNull: false
    },
    txid: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('INPUT', 'OUTPUT', 'INTERNAL'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    fee: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    from_address: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    to_address: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    required_confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    block_height: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    block_hash: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    raw_transaction: {
      type: DataTypes.JSONB,
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

  // Создаём таблицу пулов транзакций
  await queryInterface.createTable('transaction_pools', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'FULL', 'PROCESSING'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    min_amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    max_amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    target_amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    current_amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    fee_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0.5
    },
    max_participants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100
    },
    min_participants: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    current_participants: {
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

  // Создаём таблицу выходных транзакций
  await queryInterface.createTable('output_transactions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    blockchain_transaction_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'blockchain_transactions',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
      allowNull: false
    },
    output_index: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    fee: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    from_address: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    to_address: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    txid: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    delay_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    required_confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    block_height: {
      type: DataTypes.INTEGER,
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

  // Создаём таблицу отслеживаемых адресов
  await queryInterface.createTable('monitored_addresses', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
      allowNull: false
    },
    address: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('DEPOSIT', 'WALLET', 'EXTERNAL', 'POOL'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    balance: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    last_balance: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    balance_change_threshold: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0.001
    },
    check_interval_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    alert_on_balance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    alert_on_transactions: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
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

  // Создаём таблицу аудита
  await queryInterface.createTable('audit_logs', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    mix_request_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'mix_requests',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    level: {
      type: DataTypes.ENUM('ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
      allowNull: false,
      defaultValue: 'INFO'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    session_id: {
      type: DataTypes.STRING(100),
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
    old_values: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    new_values: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  console.log('✅ Created additional tables: blockchain_transactions, transaction_pools, output_transactions, monitored_addresses, audit_logs');
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  await queryInterface.dropTable('audit_logs');
  await queryInterface.dropTable('monitored_addresses');
  await queryInterface.dropTable('output_transactions');
  await queryInterface.dropTable('transaction_pools');
  await queryInterface.dropTable('blockchain_transactions');
  console.log('🗑️ Dropped additional tables');
};