"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const up = async (queryInterface, Sequelize) => {
    // Добавляем внешние ключи для output_transactions
    await queryInterface.addConstraint('output_transactions', {
        fields: ['mix_request_id'],
        type: 'foreign key',
        name: 'fk_output_transactions_mix_request',
        references: {
            table: 'mix_requests',
            field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
    });
    await queryInterface.addConstraint('output_transactions', {
        fields: ['blockchain_transaction_id'],
        type: 'foreign key',
        name: 'fk_output_transactions_blockchain_tx',
        references: {
            table: 'blockchain_transactions',
            field: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    });
    // Добавляем внешние ключи для blockchain_transactions
    await queryInterface.addConstraint('blockchain_transactions', {
        fields: ['mix_request_id'],
        type: 'foreign key',
        name: 'fk_blockchain_transactions_mix_request',
        references: {
            table: 'mix_requests',
            field: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    });
    // Добавляем внешние ключи для audit_logs
    await queryInterface.addConstraint('audit_logs', {
        fields: ['mix_request_id'],
        type: 'foreign key',
        name: 'fk_audit_logs_mix_request',
        references: {
            table: 'mix_requests',
            field: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    });
    // Добавляем составные индексы для производительности
    await queryInterface.addIndex('output_transactions', ['mix_request_id', 'output_index'], {
        name: 'idx_output_transactions_mix_request_index'
    });
    await queryInterface.addIndex('output_transactions', ['status', 'scheduled_at'], {
        name: 'idx_output_transactions_status_scheduled'
    });
    await queryInterface.addIndex('blockchain_transactions', ['currency', 'status'], {
        name: 'idx_blockchain_transactions_currency_status'
    });
    await queryInterface.addIndex('monitored_addresses', ['currency', 'address'], {
        name: 'idx_monitored_addresses_currency_address',
        unique: true
    });
    await queryInterface.addIndex('audit_logs', ['level', 'created_at'], {
        name: 'idx_audit_logs_level_created'
    });
    await queryInterface.addIndex('audit_logs', ['action', 'created_at'], {
        name: 'idx_audit_logs_action_created'
    });
    console.log('✅ Added foreign key constraints and performance indexes');
};
exports.up = up;
const down = async (queryInterface, Sequelize) => {
    // Удаляем ограничения
    await queryInterface.removeConstraint('output_transactions', 'fk_output_transactions_mix_request');
    await queryInterface.removeConstraint('output_transactions', 'fk_output_transactions_blockchain_tx');
    await queryInterface.removeConstraint('blockchain_transactions', 'fk_blockchain_transactions_mix_request');
    await queryInterface.removeConstraint('audit_logs', 'fk_audit_logs_mix_request');
    // Удаляем индексы
    await queryInterface.removeIndex('output_transactions', 'idx_output_transactions_mix_request_index');
    await queryInterface.removeIndex('output_transactions', 'idx_output_transactions_status_scheduled');
    await queryInterface.removeIndex('blockchain_transactions', 'idx_blockchain_transactions_currency_status');
    await queryInterface.removeIndex('monitored_addresses', 'idx_monitored_addresses_currency_address');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_level_created');
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_action_created');
    console.log('🗑️ Removed foreign key constraints and indexes');
};
exports.down = down;
//# sourceMappingURL=20250606000005-add-foreign-key-constraints.js.map