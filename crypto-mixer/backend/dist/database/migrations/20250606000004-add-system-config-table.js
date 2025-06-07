"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = exports.up = void 0;
const sequelize_1 = require("sequelize");
const up = async (queryInterface, Sequelize) => {
    // Создаём таблицу системных конфигураций
    await queryInterface.createTable('system_configs', {
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        key: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        value: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'),
            allowNull: false,
            defaultValue: 'STRING'
        },
        category: {
            type: sequelize_1.DataTypes.STRING(50),
            allowNull: false
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        is_encrypted: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        is_active: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        is_read_only: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        validation_rules: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true
        },
        default_value: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        last_modified_by: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        environment: {
            type: sequelize_1.DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
            allowNull: false,
            defaultValue: 'ALL'
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
    // Добавляем индексы для system_configs
    await queryInterface.addIndex('system_configs', ['key'], { unique: true });
    await queryInterface.addIndex('system_configs', ['category']);
    await queryInterface.addIndex('system_configs', ['type']);
    await queryInterface.addIndex('system_configs', ['is_active']);
    await queryInterface.addIndex('system_configs', ['environment']);
    await queryInterface.addIndex('system_configs', ['category', 'is_active']);
    await queryInterface.addIndex('system_configs', ['key', 'environment']);
    console.log('✅ Created system_configs table with indexes');
};
exports.up = up;
const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('system_configs');
    console.log('🗑️ Dropped system_configs table');
};
exports.down = down;
//# sourceMappingURL=20250606000004-add-system-config-table.js.map