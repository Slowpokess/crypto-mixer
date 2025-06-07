"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const sequelize_1 = require("sequelize");
const up = async (queryInterface, Sequelize) => {
    // Создаём таблицу блокчейн транзакций
    await queryInterface.createTable('blockchain_transactions', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        mix_request_id: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'mix_requests',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        txid: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('INPUT', 'OUTPUT', 'INTERNAL'),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        fee: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        from_address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        to_address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        confirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        required_confirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3
        },
        block_height: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        block_hash: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        raw_transaction: {
            type: sequelize_1.DataTypes.JSONB,
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
    // Создаём таблицу пулов транзакций
    await queryInterface.createTable('transaction_pools', {
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
        name: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('ACTIVE', 'INACTIVE', 'FULL', 'PROCESSING'),
            allowNull: false,
            defaultValue: 'ACTIVE'
        },
        min_amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        max_amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        target_amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        current_amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        fee_percentage: {
            type: sequelize_1.DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0.5
        },
        max_participants: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 100
        },
        min_participants: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3
        },
        current_participants: {
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
    // Создаём таблицу выходных транзакций
    await queryInterface.createTable('output_transactions', {
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
        blockchain_transaction_id: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'blockchain_transactions',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        output_index: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false
        },
        amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false
        },
        fee: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        from_address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        to_address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        txid: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        delay_minutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        scheduled_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        sent_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        confirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        required_confirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3
        },
        block_height: {
            type: sequelize_1.DataTypes.INTEGER,
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
    // Создаём таблицу отслеживаемых адресов
    await queryInterface.createTable('monitored_addresses', {
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
            allowNull: false
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('DEPOSIT', 'WALLET', 'EXTERNAL', 'POOL'),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
            allowNull: false,
            defaultValue: 'ACTIVE'
        },
        balance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        last_balance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0
        },
        balance_change_threshold: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0.001
        },
        check_interval_minutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        last_checked_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        alert_on_balance: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        alert_on_transactions: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
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
    // Создаём таблицу аудита
    await queryInterface.createTable('audit_logs', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        mix_request_id: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'mix_requests',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        level: {
            type: sequelize_1.DataTypes.ENUM('ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
            allowNull: false,
            defaultValue: 'INFO'
        },
        action: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        message: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false
        },
        user_id: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        session_id: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        ip_address: {
            type: sequelize_1.DataTypes.INET,
            allowNull: true
        },
        user_agent: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        old_values: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true
        },
        new_values: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true
        },
        details: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true
        },
        created_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    });
    console.log('✅ Created additional tables: blockchain_transactions, transaction_pools, output_transactions, monitored_addresses, audit_logs');
};
exports.up = up;
const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('monitored_addresses');
    await queryInterface.dropTable('output_transactions');
    await queryInterface.dropTable('transaction_pools');
    await queryInterface.dropTable('blockchain_transactions');
    console.log('🗑️ Dropped additional tables');
};
exports.down = down;
//# sourceMappingURL=20250606000003-add-missing-tables.js.map