import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  // Создаём таблицу запросов микширования
  await queryInterface.createTable('mix_requests', {
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
    amount: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    output_addresses: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    output_percentages: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    delay_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    anonymity_level: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
      allowNull: false,
      defaultValue: 'MEDIUM'
    },
    mixing_rounds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    total_fee: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: true
    },
    deposit_txid: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    deposit_block_height: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    deposit_confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    client_ip: {
      type: DataTypes.INET,
      allowNull: true
    },
    tor_session: {
      type: DataTypes.STRING(100),
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

  // Создаём таблицу кошельков
  await queryInterface.createTable('wallets', {
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
      allowNull: false,
      unique: true
    },
    type: {
      type: DataTypes.ENUM('HOT', 'COLD', 'MULTISIG', 'POOL'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'COMPROMISED'),
      allowNull: false,
      defaultValue: 'ACTIVE'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    balance: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0
    },
    encrypted_private_key: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    public_key: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    derivation_path: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    last_balance_check: {
      type: DataTypes.DATE,
      allowNull: true
    },
    transaction_count: {
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

  // Создаём таблицу адресов депозитов
  await queryInterface.createTable('deposit_addresses', {
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
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
      allowNull: false
    },
    address: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    private_key: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    derivation_path: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    used: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    expired_at: {
      type: DataTypes.DATE,
      allowNull: false
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

  console.log('✅ Created initial tables: mix_requests, wallets, deposit_addresses');
};

export const down = async (queryInterface: QueryInterface, Sequelize: any): Promise<void> => {
  await queryInterface.dropTable('deposit_addresses');
  await queryInterface.dropTable('wallets');
  await queryInterface.dropTable('mix_requests');
  console.log('🗑️ Dropped initial tables');
};