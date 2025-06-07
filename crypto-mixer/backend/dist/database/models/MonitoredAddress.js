"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoredAddress = void 0;
exports.initMonitoredAddress = initMonitoredAddress;
const sequelize_1 = require("sequelize");
class MonitoredAddress extends sequelize_1.Model {
    needsCheck() {
        if (!this.isActive)
            return false;
        if (!this.lastCheckedAt)
            return true;
        const nextCheck = new Date(this.lastCheckedAt.getTime() + this.checkIntervalMinutes * 60 * 1000);
        return new Date() >= nextCheck;
    }
    async updateBalance(newBalance, transactionHash) {
        const balanceChange = Math.abs(newBalance - this.balance);
        await this.update({
            lastBalance: this.balance,
            balance: newBalance,
            lastCheckedAt: new Date(),
            ...(transactionHash && {
                lastTransactionAt: new Date(),
                lastTransactionHash: transactionHash
            })
        });
        // Отправляем уведомление если изменение превышает порог
        if (this.alertOnBalance && balanceChange >= this.balanceChangeThreshold) {
            await this.sendBalanceAlert(newBalance, this.balance);
        }
    }
    async sendBalanceAlert(newBalance, oldBalance) {
        // Логика отправки уведомлений
        const change = newBalance - oldBalance;
        const alert = {
            address: this.address,
            currency: this.currency,
            oldBalance,
            newBalance,
            change,
            timestamp: new Date()
        };
        // Здесь можно добавить отправку webhook или email
        console.log('Balance alert:', alert);
    }
    static async findForMonitoring() {
        // Расширенная логика мониторинга с правильной типизацией
        const whereCondition = {
            isActive: true,
            [sequelize_1.Op.or]: [
                { lastCheckedAt: { [sequelize_1.Op.is]: null } },
                sequelize_1.Sequelize.literal(`NOW() >= last_checked_at + INTERVAL '1 minute' * check_interval_minutes`)
            ]
        };
        return await this.findAll({
            where: whereCondition,
            order: [['lastCheckedAt', 'ASC']]
        });
    }
    static async findByType(type) {
        return await this.findAll({
            where: { type, isActive: true },
            order: [['createdAt', 'DESC']]
        });
    }
}
exports.MonitoredAddress = MonitoredAddress;
function initMonitoredAddress(sequelize) {
    MonitoredAddress.init({
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
        balance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0 }
        },
        lastBalance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0 }
        },
        balanceChangeThreshold: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0 }
        },
        isActive: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        lastCheckedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lastTransactionAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lastTransactionHash: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        checkIntervalMinutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5,
            validate: { min: 1, max: 1440 }
        },
        alertOnBalance: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        alertOnTransactions: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        webhookUrl: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        notificationEmail: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
            validate: { isEmail: true }
        },
        metadata: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true,
            defaultValue: {}
        },
        tags: {
            type: sequelize_1.DataTypes.ARRAY(sequelize_1.DataTypes.STRING),
            allowNull: true,
            defaultValue: []
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
        },
        deletedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'MonitoredAddress',
        tableName: 'monitored_addresses',
        timestamps: true,
        paranoid: true,
        indexes: [
            { unique: true, fields: ['currency', 'address'] },
            { fields: ['type'] },
            { fields: ['isActive'] },
            { fields: ['lastCheckedAt'] },
            { fields: ['currency', 'type'] },
            { fields: ['isActive', 'lastCheckedAt'] }
        ]
    });
    return MonitoredAddress;
}
exports.default = MonitoredAddress;
//# sourceMappingURL=MonitoredAddress.js.map