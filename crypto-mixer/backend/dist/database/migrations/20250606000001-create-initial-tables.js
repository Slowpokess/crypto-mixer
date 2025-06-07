"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const sequelize_1 = require("sequelize");
const up = async (queryInterface, Sequelize) => {
    // Создаём таблицу запросов микширования
    await queryInterface.createTable('mix_requests', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        output_addresses: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: false
        },
        output_percentages: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: false
        },
        delay_minutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        anonymity_level: {
            type: sequelize_1.DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
            allowNull: false,
            defaultValue: 'MEDIUM'
        },
        mixing_rounds: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3
        },
        total_fee: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: true
        },
        deposit_txid: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        deposit_block_height: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        deposit_confirmed_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        completed_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        error_message: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        client_ip: {
            type: sequelize_1.DataTypes.INET,
            allowNull: true
        },
        tor_session: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        created_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        },
        updated_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    });
    // Создаём таблицу кошельков
    await queryInterface.createTable('wallets', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('HOT', 'COLD', 'MULTISIG', 'POOL'),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'COMPROMISED'),
            allowNull: false,
            defaultValue: 'ACTIVE'
        },
        name: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        balance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        encrypted_private_key: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        public_key: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        derivation_path: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        last_balance_check: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        transaction_count: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        created_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        },
        updated_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    });
    // Создаём таблицу адресов депозитов
    await queryInterface.createTable('deposit_addresses', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        mix_request_id: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'mix_requests',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        private_key: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false
        },
        derivation_path: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        used: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        expired_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false
        },
        created_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        },
        updated_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    });
    console.log('✅ Created initial tables: mix_requests, wallets, deposit_addresses');
};
exports.up = up;
const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('deposit_addresses');
    await queryInterface.dropTable('wallets');
    await queryInterface.dropTable('mix_requests');
    console.log('🗑️ Dropped initial tables');
};
exports.down = down;
//# sourceMappingURL=20250606000001-create-initial-tables.js.map