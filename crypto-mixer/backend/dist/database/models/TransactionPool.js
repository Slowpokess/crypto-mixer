"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionPool = void 0;
exports.initTransactionPool = initTransactionPool;
const sequelize_1 = require("sequelize");
/**
 * Модель пула транзакций
 * Управление пулами для коллективного микширования
 */
class TransactionPool extends sequelize_1.Model {
    // Методы экземпляра
    /**
     * Проверка готовности к микшированию
     */
    isReadyForMixing() {
        return this.participantsCount >= this.minParticipants &&
            this.currentAmount >= this.targetAmount &&
            this.isActive && !this.isLocked;
    }
    /**
     * Проверка возможности добавления участника
     */
    canAddParticipant(amount) {
        if (!this.isActive || this.isLocked)
            return false;
        if (this.participantsCount >= this.maxParticipants)
            return false;
        if (amount < this.minAmount || amount > this.maxAmount)
            return false;
        if (this.currentAmount + amount > this.targetAmount * 1.1)
            return false;
        return true;
    }
    /**
     * Добавление участника в пул
     */
    async addParticipant(amount) {
        if (!this.canAddParticipant(amount)) {
            return false;
        }
        const updateData = {
            currentAmount: this.currentAmount + amount,
            participantsCount: this.participantsCount + 1,
            averageAmount: (this.currentAmount + amount) / (this.participantsCount + 1)
        };
        // Проверяем, достиг ли пул целевой суммы
        if (updateData.currentAmount >= this.targetAmount) {
            updateData.status = 'READY';
        }
        else if (this.status === 'WAITING') {
            updateData.status = 'FILLING';
        }
        await this.update(updateData);
        return true;
    }
    /**
     * Удаление участника из пула
     */
    async removeParticipant(amount) {
        if (this.isLocked || this.participantsCount === 0) {
            return false;
        }
        const newAmount = Math.max(0, this.currentAmount - amount);
        const newCount = Math.max(0, this.participantsCount - 1);
        const updateData = {
            currentAmount: newAmount,
            participantsCount: newCount,
            averageAmount: newCount > 0 ? newAmount / newCount : 0
        };
        // Обновляем статус в зависимости от нового состояния
        if (newCount === 0) {
            updateData.status = 'WAITING';
        }
        else if (newAmount < this.targetAmount) {
            updateData.status = 'FILLING';
        }
        await this.update(updateData);
        return true;
    }
    /**
     * Блокировка пула для микширования
     */
    async lockForMixing() {
        await this.update({
            isLocked: true,
            status: 'MIXING',
            lockedAt: new Date(),
            startedAt: this.startedAt || new Date()
        });
    }
    /**
     * Разблокировка пула
     */
    async unlock() {
        await this.update({
            isLocked: false,
            status: this.isReadyForMixing() ? 'READY' : 'FILLING'
        });
    }
    /**
     * Завершение микширования
     */
    async completeMixing(successful = true) {
        const updateData = {
            status: successful ? 'COMPLETED' : 'CANCELLED',
            completedAt: new Date(),
            isLocked: false,
            completedRounds: this.mixingRounds
        };
        if (successful) {
            updateData.totalMixed = this.totalMixed + this.currentAmount;
            // Обновляем статистику успешности
            const totalAttempts = this.totalMixed > 0 ?
                Math.ceil(this.totalMixed / this.targetAmount) + 1 : 1;
            updateData.successRate = ((totalAttempts - 1) * this.successRate + (successful ? 100 : 0)) / totalAttempts;
        }
        await this.update(updateData);
    }
    /**
     * Сброс пула для повторного использования
     */
    async reset() {
        await this.update({
            currentAmount: 0,
            participantsCount: 0,
            status: 'WAITING',
            isLocked: false,
            completedRounds: 0,
            startedAt: undefined,
            lockedAt: undefined,
            completedAt: undefined,
            averageAmount: 0
        });
    }
    /**
     * Получение статистики эффективности
     */
    getEfficiencyStats() {
        const utilizationRate = this.targetAmount > 0 ? (this.currentAmount / this.targetAmount) * 100 : 0;
        const fillRate = this.maxParticipants > 0 ? (this.participantsCount / this.maxParticipants) * 100 : 0;
        // Время до заполнения (приблизительное)
        const avgTimeToFill = this.startedAt ?
            (Date.now() - this.startedAt.getTime()) / (1000 * 60) : 0; // в минутах
        const mixingEfficiency = this.mixingRounds > 0 ?
            (this.completedRounds / this.mixingRounds) * 100 : 0;
        return {
            utilizationRate,
            fillRate,
            avgTimeToFill,
            mixingEfficiency
        };
    }
    /**
     * Проверка истечения срока
     */
    isExpired() {
        return this.expiresAt ? new Date() > this.expiresAt : false;
    }
    /**
     * Расчет общей комиссии пула
     */
    getTotalFee() {
        return this.currentAmount * this.feePercentage / 100;
    }
    // Статические методы
    /**
     * Поиск активных пулов
     */
    static async findActive(currency) {
        const where = {
            isActive: true,
            status: ['WAITING', 'FILLING', 'READY']
        };
        if (currency)
            where.currency = currency;
        return await this.findAll({
            where,
            order: [['priority', 'DESC'], ['createdAt', 'ASC']]
        });
    }
    /**
     * Поиск пулов готовых к микшированию
     */
    static async findReadyForMixing(currency) {
        const where = {
            isActive: true,
            isLocked: false,
            status: 'READY'
        };
        if (currency)
            where.currency = currency;
        return await this.findAll({
            where,
            order: [['priority', 'DESC'], ['currentAmount', 'DESC']]
        });
    }
    /**
     * Поиск подходящего пула для суммы
     */
    static async findSuitablePool(currency, amount) {
        return await this.findOne({
            where: {
                currency,
                isActive: true,
                isLocked: false,
                status: ['WAITING', 'FILLING'],
                minAmount: { [sequelize_1.Op.lte]: amount },
                maxAmount: { [sequelize_1.Op.gte]: amount },
                [sequelize_1.Op.and]: [
                    sequelize_1.Sequelize.literal(`participants_count < max_participants`),
                    sequelize_1.Sequelize.literal(`current_amount + ${amount} <= target_amount * 1.1`)
                ]
            },
            order: [
                ['priority', 'DESC'],
                ['current_amount', 'DESC'], // Предпочитаем более заполненные пулы
                ['created_at', 'ASC']
            ]
        });
    }
    /**
     * Статистика по пулам
     */
    static async getStatistics(currency) {
        const where = {};
        if (currency)
            where.currency = currency;
        const stats = await this.findAll({
            attributes: [
                'currency',
                'status',
                [sequelize_1.Sequelize.fn('COUNT', sequelize_1.Sequelize.col('id')), 'count'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('currentAmount')), 'totalAmount'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('participantsCount')), 'totalParticipants'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('averageAmount')), 'avgAmount'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('successRate')), 'avgSuccessRate']
            ],
            where,
            group: ['currency', 'status'],
            raw: true
        });
        const result = {};
        stats.forEach((stat) => {
            if (!result[stat.currency]) {
                result[stat.currency] = {};
            }
            result[stat.currency][stat.status] = {
                count: parseInt(stat.count),
                totalAmount: parseFloat(stat.totalAmount) || 0,
                totalParticipants: parseInt(stat.totalParticipants) || 0,
                avgAmount: parseFloat(stat.avgAmount) || 0,
                avgSuccessRate: parseFloat(stat.avgSuccessRate) || 0
            };
        });
        return result;
    }
    /**
     * Очистка завершенных пулов
     */
    static async cleanupCompleted(daysToKeep = 7) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        const result = await this.destroy({
            where: {
                status: ['COMPLETED', 'CANCELLED'],
                completedAt: {
                    [sequelize_1.Op.lt]: cutoffDate
                }
            }
        });
        return result;
    }
    /**
     * Автоматическое создание пулов для валют
     */
    static async createDefaultPools() {
        const currencies = ['BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'DASH', 'ZEC'];
        const pools = [];
        for (const currency of currencies) {
            // Проверяем, есть ли уже активные пулы для этой валюты
            const existingPools = await this.findActive(currency);
            if (existingPools.length === 0) {
                const poolConfig = this.getDefaultPoolConfig(currency);
                const pool = await this.create(poolConfig);
                pools.push(pool);
            }
        }
        return pools;
    }
    /**
     * Получение конфигурации пула по умолчанию
     */
    static getDefaultPoolConfig(currency) {
        const configs = {
            BTC: {
                minAmount: 0.001,
                maxAmount: 1.0,
                targetAmount: 5.0,
                maxParticipants: 20,
                minParticipants: 5,
                feePercentage: 0.5
            },
            ETH: {
                minAmount: 0.01,
                maxAmount: 10.0,
                targetAmount: 50.0,
                maxParticipants: 25,
                minParticipants: 5,
                feePercentage: 0.3
            },
            USDT: {
                minAmount: 10,
                maxAmount: 10000,
                targetAmount: 50000,
                maxParticipants: 30,
                minParticipants: 5,
                feePercentage: 0.2
            },
            SOL: {
                minAmount: 0.1,
                maxAmount: 100,
                targetAmount: 500,
                maxParticipants: 20,
                minParticipants: 5,
                feePercentage: 0.4
            },
            LTC: {
                minAmount: 0.01,
                maxAmount: 100,
                targetAmount: 300,
                maxParticipants: 20,
                minParticipants: 5,
                feePercentage: 0.3 // Низкая комиссия, как у ETH
            },
            DASH: {
                minAmount: 0.01,
                maxAmount: 100,
                targetAmount: 250,
                maxParticipants: 18,
                minParticipants: 4,
                feePercentage: 0.25 // Еще ниже благодаря InstantSend
            },
            ZEC: {
                minAmount: 0.001,
                maxAmount: 50,
                targetAmount: 150,
                maxParticipants: 15,
                minParticipants: 6, // Больше для лучшей анонимности с shielded транзакциями
                feePercentage: 0.6 // Выше из-за дополнительной обработки privacy features
            }
        };
        const config = configs[currency];
        return {
            currency,
            name: `${currency} Default Pool`,
            isActive: true,
            mixingRounds: 3,
            shuffleIterations: 5,
            anonymitySet: 10,
            priority: 1,
            ...config
        };
    }
}
exports.TransactionPool = TransactionPool;
/**
 * Инициализация модели TransactionPool
 */
function initTransactionPool(sequelize) {
    TransactionPool.init({
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'DASH', 'ZEC'),
            allowNull: false
        },
        name: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        minAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        maxAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        targetAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        feePercentage: {
            type: sequelize_1.DataTypes.DECIMAL(5, 2),
            allowNull: false,
            validate: {
                min: 0,
                max: 10
            }
        },
        currentAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        participantsCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        maxParticipants: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 1000
            }
        },
        minParticipants: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 100
            }
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
        status: {
            type: sequelize_1.DataTypes.ENUM('WAITING', 'FILLING', 'READY', 'MIXING', 'COMPLETED', 'CANCELLED'),
            allowNull: false,
            defaultValue: 'WAITING'
        },
        createdAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        },
        startedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        lockedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        completedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        expiresAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        mixingRounds: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3,
            validate: {
                min: 1,
                max: 10
            }
        },
        completedRounds: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        anonymitySet: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10,
            validate: {
                min: 3,
                max: 1000
            }
        },
        shuffleIterations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5,
            validate: {
                min: 1,
                max: 20
            }
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        priority: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1,
                max: 10
            }
        },
        tags: {
            type: sequelize_1.DataTypes.ARRAY(sequelize_1.DataTypes.STRING),
            allowNull: true,
            defaultValue: []
        },
        totalMixed: {
            type: sequelize_1.DataTypes.DECIMAL(30, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        averageAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        successRate: {
            type: sequelize_1.DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                max: 100
            }
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
        modelName: 'TransactionPool',
        tableName: 'transaction_pools',
        timestamps: true,
        paranoid: true,
        indexes: [
            {
                fields: ['currency']
            },
            {
                fields: ['status']
            },
            {
                fields: ['isActive']
            },
            {
                fields: ['isLocked']
            },
            {
                fields: ['priority']
            },
            {
                fields: ['currency', 'status']
            },
            {
                fields: ['currency', 'isActive', 'status']
            },
            {
                fields: ['minAmount', 'maxAmount']
            },
            {
                fields: ['currentAmount']
            },
            {
                fields: ['participantsCount']
            },
            {
                fields: ['expiresAt']
            }
        ],
        validate: {
            validAmountRange() {
                if (this.minAmount >= this.maxAmount) {
                    throw new Error('minAmount должен быть меньше maxAmount');
                }
                if (this.targetAmount < this.maxAmount) {
                    throw new Error('targetAmount должен быть больше или равен maxAmount');
                }
            },
            validParticipantsRange() {
                if (this.minParticipants >= this.maxParticipants) {
                    throw new Error('minParticipants должен быть меньше maxParticipants');
                }
            }
        }
    });
    return TransactionPool;
}
exports.default = TransactionPool;
//# sourceMappingURL=TransactionPool.js.map