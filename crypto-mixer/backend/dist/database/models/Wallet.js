"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
exports.initWallet = initWallet;
const sequelize_1 = require("sequelize");
/**
 * Модель кошелька
 * Управление всеми кошельками в системе микширования
 */
class Wallet extends sequelize_1.Model {
    // Методы экземпляра
    /**
     * Проверка доступности кошелька
     */
    isAvailable() {
        return this.status === 'ACTIVE' && !this.isCompromised;
    }
    /**
     * Проверка достаточности баланса
     */
    hasSufficientBalance(amount) {
        return this.availableBalance >= amount;
    }
    /**
     * Резервирование средств
     */
    async reserveBalance(amount) {
        if (!this.hasSufficientBalance(amount)) {
            return false;
        }
        await this.update({
            reservedBalance: this.reservedBalance + amount,
            availableBalance: this.availableBalance - amount
        });
        return true;
    }
    /**
     * Освобождение резерва
     */
    async releaseReserve(amount) {
        const releaseAmount = Math.min(amount, this.reservedBalance);
        await this.update({
            reservedBalance: this.reservedBalance - releaseAmount,
            availableBalance: this.availableBalance + releaseAmount
        });
    }
    /**
     * Обновление баланса
     */
    async updateBalance(newBalance, updateReserved = false) {
        const balanceChange = newBalance - this.balance;
        const updateData = {
            balance: newBalance,
            lastBalanceCheck: new Date()
        };
        if (!updateReserved) {
            updateData.availableBalance = newBalance - this.reservedBalance;
        }
        else {
            updateData.availableBalance = newBalance;
            updateData.reservedBalance = 0;
        }
        // Обновляем статистику
        if (balanceChange > 0) {
            updateData.totalReceived = this.totalReceived + balanceChange;
        }
        else if (balanceChange < 0) {
            updateData.totalSent = this.totalSent + Math.abs(balanceChange);
        }
        await this.update(updateData);
    }
    /**
     * Отметка об использовании
     */
    async markAsUsed(transactionHash) {
        await this.update({
            lastUsedAt: new Date(),
            lastTransactionHash: transactionHash,
            transactionCount: this.transactionCount + 1
        });
    }
    /**
     * Отметка как скомпрометированный
     */
    async markAsCompromised(reason) {
        await this.update({
            isCompromised: true,
            compromisedAt: new Date(),
            compromisedReason: reason,
            status: 'INACTIVE'
        });
    }
    /**
     * Проверка лимитов баланса
     */
    checkBalanceLimits() {
        const belowMin = this.balance < this.minBalance;
        const aboveMax = this.maxBalance > 0 && this.balance > this.maxBalance;
        return {
            withinLimits: !belowMin && !aboveMax,
            belowMin,
            aboveMax
        };
    }
    /**
     * Получение статистики использования
     */
    getUsageStats() {
        const totalVolume = this.totalReceived + this.totalSent;
        const netBalance = this.totalReceived - this.totalSent;
        const utilizationRate = this.maxBalance > 0 ? (this.balance / this.maxBalance) * 100 : 0;
        const avgTransactionSize = this.transactionCount > 0 ? totalVolume / this.transactionCount : 0;
        return {
            totalVolume,
            netBalance,
            utilizationRate,
            avgTransactionSize
        };
    }
    // Статические методы
    /**
     * Поиск доступных кошельков
     */
    static async findAvailable(currency, type) {
        const where = {
            status: 'ACTIVE',
            isCompromised: false
        };
        if (currency)
            where.currency = currency;
        if (type)
            where.type = type;
        return await this.findAll({
            where,
            order: [['balance', 'DESC']]
        });
    }
    /**
     * Поиск кошелька с достаточным балансом
     */
    static async findWithSufficientBalance(currency, amount, type) {
        const where = {
            currency,
            status: 'ACTIVE',
            isCompromised: false,
            availableBalance: {
                [sequelize_1.Op.gte]: amount
            }
        };
        if (type)
            where.type = type;
        return await this.findOne({
            where,
            order: [['availableBalance', 'DESC']]
        });
    }
    /**
     * Получение общего баланса по валюте
     */
    static async getTotalBalance(currency) {
        const wallets = await this.findAll({
            where: {
                currency,
                status: 'ACTIVE',
                isCompromised: false
            }
        });
        const result = {
            total: 0,
            available: 0,
            reserved: 0,
            byType: {}
        };
        wallets.forEach(wallet => {
            result.total += wallet.balance;
            result.available += wallet.availableBalance;
            result.reserved += wallet.reservedBalance;
            if (!result.byType[wallet.type]) {
                result.byType[wallet.type] = 0;
            }
            result.byType[wallet.type] += wallet.balance;
        });
        return result;
    }
    /**
     * Поиск неиспользуемых кошельков
     */
    static async findUnused(hours = 24) {
        const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
        return await this.findAll({
            where: {
                status: 'ACTIVE',
                isCompromised: false,
                [sequelize_1.Op.or]: [
                    sequelize_1.Sequelize.where(sequelize_1.Sequelize.col('lastUsedAt'), 'IS', null),
                    { lastUsedAt: { [sequelize_1.Op.lt]: cutoffDate } }
                ]
            },
            order: [['lastUsedAt', 'ASC']]
        });
    }
    /**
     * Статистика по кошелькам
     */
    static async getStatistics() {
        const stats = await this.findAll({
            attributes: [
                'currency',
                'type',
                'status',
                [sequelize_1.Sequelize.fn('COUNT', sequelize_1.Sequelize.col('id')), 'count'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('balance')), 'totalBalance'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('availableBalance')), 'availableBalance'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('balance')), 'averageBalance']
            ],
            group: ['currency', 'type', 'status'],
            raw: true
        });
        const result = {};
        stats.forEach((stat) => {
            const currency = stat.currency;
            const type = stat.type;
            const status = stat.status;
            if (!result[currency]) {
                result[currency] = {};
            }
            if (!result[currency][type]) {
                result[currency][type] = {};
            }
            result[currency][type][status] = {
                count: parseInt(stat.count),
                totalBalance: parseFloat(stat.totalBalance) || 0,
                availableBalance: parseFloat(stat.availableBalance) || 0,
                averageBalance: parseFloat(stat.averageBalance) || 0
            };
        });
        return result;
    }
}
exports.Wallet = Wallet;
/**
 * Инициализация модели Wallet
 */
function initWallet(sequelize) {
    Wallet.init({
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
        type: {
            type: sequelize_1.DataTypes.ENUM('HOT', 'COLD', 'MULTISIG', 'POOL'),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'COMPROMISED'),
            allowNull: false,
            defaultValue: 'ACTIVE'
        },
        address: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        publicKey: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        // УДАЛЕНО: encryptedPrivateKey больше не хранится в БД
        // Теперь используется keyId для ссылки на ключ в Vault
        vaultKeyId: {
            type: sequelize_1.DataTypes.STRING(128),
            allowNull: true,
            comment: 'ID ключа в Vault/HSM системе'
        },
        keyAlgorithm: {
            type: sequelize_1.DataTypes.STRING(32),
            allowNull: true,
            defaultValue: 'secp256k1',
            comment: 'Алгоритм криптографического ключа'
        },
        isHSMKey: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Флаг использования HSM для данного ключа'
        },
        derivationPath: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        balance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        reservedBalance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        availableBalance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        totalReceived: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        totalSent: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        transactionCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        minBalance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        maxBalance: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        isMultisig: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        requiredSignatures: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 1,
                max: 15
            }
        },
        label: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        tags: {
            type: sequelize_1.DataTypes.ARRAY(sequelize_1.DataTypes.STRING),
            allowNull: true,
            defaultValue: []
        },
        lastUsedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lastBalanceCheck: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lastBalanceUpdate: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lastTransactionHash: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        usageCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0 }
        },
        isActive: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        isLocked: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        isCompromised: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        compromisedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        compromisedReason: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
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
        modelName: 'Wallet',
        tableName: 'wallets',
        timestamps: true,
        paranoid: true, // Soft delete
        indexes: [
            {
                unique: true,
                fields: ['address']
            },
            {
                fields: ['currency']
            },
            {
                fields: ['type']
            },
            {
                fields: ['status']
            },
            {
                fields: ['currency', 'type']
            },
            {
                fields: ['currency', 'status']
            },
            {
                fields: ['availableBalance']
            },
            {
                fields: ['lastUsedAt']
            },
            {
                fields: ['isCompromised']
            },
            {
                fields: ['currency', 'type', 'status']
            }
        ],
        hooks: {
            beforeCreate: (wallet) => {
                // Инициализируем availableBalance как balance при создании
                wallet.availableBalance = wallet.balance;
            },
            beforeUpdate: (wallet) => {
                // Обновляем availableBalance при изменении balance или reservedBalance
                if (wallet.changed('balance') || wallet.changed('reservedBalance')) {
                    wallet.availableBalance = wallet.balance - wallet.reservedBalance;
                }
            }
        }
    });
    return Wallet;
}
exports.default = Wallet;
//# sourceMappingURL=Wallet.js.map