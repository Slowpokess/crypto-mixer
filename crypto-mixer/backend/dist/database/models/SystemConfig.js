"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemConfig = void 0;
exports.initSystemConfig = initSystemConfig;
const sequelize_1 = require("sequelize");
class SystemConfig extends sequelize_1.Model {
    getTypedValue() {
        switch (this.type) {
            case 'NUMBER':
                return parseFloat(this.value);
            case 'BOOLEAN':
                return this.value.toLowerCase() === 'true';
            case 'JSON':
                try {
                    return JSON.parse(this.value);
                }
                catch {
                    return null;
                }
            case 'STRING':
            case 'ENCRYPTED':
            default:
                return this.value;
        }
    }
    async updateValue(newValue, modifiedBy) {
        if (this.isReadOnly) {
            throw new Error('Нельзя изменить значение: параметр только для чтения');
        }
        let stringValue;
        switch (this.type) {
            case 'JSON':
                stringValue = JSON.stringify(newValue);
                break;
            case 'BOOLEAN':
                stringValue = Boolean(newValue).toString();
                break;
            case 'NUMBER':
                stringValue = Number(newValue).toString();
                break;
            default:
                stringValue = String(newValue);
        }
        await this.update({
            value: stringValue,
            lastModifiedBy: modifiedBy
        });
    }
    static async getValue(key, defaultValue) {
        const config = await this.findOne({
            where: {
                key,
                isActive: true,
                environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
            }
        });
        if (!config) {
            return defaultValue;
        }
        return config.getTypedValue();
    }
    static async setValue(key, value, type = 'STRING', category = 'GENERAL', modifiedBy) {
        const existingConfig = await this.findOne({ where: { key } });
        if (existingConfig) {
            await existingConfig.updateValue(value, modifiedBy);
            return existingConfig;
        }
        let stringValue;
        switch (type) {
            case 'JSON':
                stringValue = JSON.stringify(value);
                break;
            case 'BOOLEAN':
                stringValue = Boolean(value).toString();
                break;
            case 'NUMBER':
                stringValue = Number(value).toString();
                break;
            default:
                stringValue = String(value);
        }
        return await this.create({
            key,
            value: stringValue,
            type,
            category,
            lastModifiedBy: modifiedBy
        });
    }
    static async getByCategory(category) {
        return await this.findAll({
            where: {
                category,
                isActive: true,
                environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
            },
            order: [['key', 'ASC']]
        });
    }
    static async getAllSettings() {
        const configs = await this.findAll({
            where: {
                isActive: true,
                environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
            }
        });
        const settings = {};
        configs.forEach(config => {
            settings[config.key] = config.getTypedValue();
        });
        return settings;
    }
    static async initializeDefaults() {
        const defaults = [
            // Mixing Configuration
            { key: 'MIXING_MIN_AMOUNT', value: '0.001', type: 'NUMBER', category: 'MIXING' },
            { key: 'MIXING_MAX_AMOUNT', value: '100', type: 'NUMBER', category: 'MIXING' },
            { key: 'MIXING_FEE_PERCENTAGE', value: '0.5', type: 'NUMBER', category: 'MIXING' },
            { key: 'MIXING_ROUNDS_DEFAULT', value: '3', type: 'NUMBER', category: 'MIXING' },
            { key: 'MIXING_DELAY_MIN_MINUTES', value: '5', type: 'NUMBER', category: 'MIXING' },
            { key: 'MIXING_DELAY_MAX_MINUTES', value: '60', type: 'NUMBER', category: 'MIXING' },
            // Pool Configuration
            { key: 'POOL_MIN_PARTICIPANTS', value: '5', type: 'NUMBER', category: 'POOL' },
            { key: 'POOL_MAX_PARTICIPANTS', value: '50', type: 'NUMBER', category: 'POOL' },
            { key: 'POOL_TIMEOUT_HOURS', value: '24', type: 'NUMBER', category: 'POOL' },
            // Security Settings
            { key: 'MAX_RETRY_ATTEMPTS', value: '3', type: 'NUMBER', category: 'SECURITY' },
            { key: 'RATE_LIMIT_REQUESTS_PER_HOUR', value: '100', type: 'NUMBER', category: 'SECURITY' },
            { key: 'ENABLE_ANONYMITY_ANALYSIS', value: 'true', type: 'BOOLEAN', category: 'SECURITY' },
            // Network Settings
            { key: 'BTC_CONFIRMATIONS_REQUIRED', value: '3', type: 'NUMBER', category: 'NETWORK' },
            { key: 'ETH_CONFIRMATIONS_REQUIRED', value: '12', type: 'NUMBER', category: 'NETWORK' },
            { key: 'SOL_CONFIRMATIONS_REQUIRED', value: '32', type: 'NUMBER', category: 'NETWORK' },
            // System Settings
            { key: 'SYSTEM_MAINTENANCE_MODE', value: 'false', type: 'BOOLEAN', category: 'SYSTEM' },
            { key: 'LOG_LEVEL', value: 'INFO', type: 'STRING', category: 'SYSTEM' },
            { key: 'DATABASE_BACKUP_INTERVAL_HOURS', value: '6', type: 'NUMBER', category: 'SYSTEM' }
        ];
        for (const config of defaults) {
            const existing = await this.findOne({ where: { key: config.key } });
            if (!existing) {
                await this.create({
                    key: config.key,
                    value: config.value,
                    type: config.type,
                    category: config.category,
                    description: `Default ${config.key.toLowerCase().replace(/_/g, ' ')} setting`
                });
            }
        }
    }
}
exports.SystemConfig = SystemConfig;
function initSystemConfig(sequelize) {
    SystemConfig.init({
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        key: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true,
                isUppercase: true
            }
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
            allowNull: false,
            validate: {
                notEmpty: true,
                isUppercase: true
            }
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        isEncrypted: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        isActive: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        isReadOnly: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        validationRules: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true
        },
        defaultValue: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        lastModifiedBy: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        environment: {
            type: sequelize_1.DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
            allowNull: false,
            defaultValue: 'ALL'
        },
        createdAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        },
        updatedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'SystemConfig',
        tableName: 'system_configs',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['key'] },
            { fields: ['category'] },
            { fields: ['type'] },
            { fields: ['isActive'] },
            { fields: ['environment'] },
            { fields: ['category', 'isActive'] },
            { fields: ['key', 'environment'] }
        ]
    });
    return SystemConfig;
}
exports.default = SystemConfig;
//# sourceMappingURL=SystemConfig.js.map