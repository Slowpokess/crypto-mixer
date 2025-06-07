"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputTransaction = void 0;
exports.initOutputTransaction = initOutputTransaction;
const sequelize_1 = require("sequelize");
/**
 * Модель исходящей транзакции
 * Управление выводом средств после микширования
 */
class OutputTransaction extends sequelize_1.Model {
    // Методы экземпляра
    /**
     * Проверка готовности к обработке
     */
    isReadyForProcessing() {
        return new Date() >= this.scheduledAt &&
            this.status === 'PENDING' &&
            this.retryCount < this.maxRetries;
    }
    /**
     * Проверка подтверждения транзакции
     */
    isConfirmed() {
        return this.confirmations >= this.requiredConfirmations && this.status === 'CONFIRMED';
    }
    /**
     * Проверка возможности повтора
     */
    canRetry() {
        return this.retryCount < this.maxRetries &&
            ['FAILED', 'PENDING'].includes(this.status);
    }
    /**
     * Обновление статуса обработки
     */
    async updateProcessingStatus(status, txid, errorMessage) {
        const updateData = {
            status,
            processedAt: new Date()
        };
        if (txid) {
            updateData.txid = txid;
        }
        if (errorMessage) {
            updateData.errorMessage = errorMessage;
            updateData.retryCount = this.retryCount + 1;
        }
        await this.update(updateData);
    }
    /**
     * Обновление подтверждений
     */
    async updateConfirmations(confirmations, blockHeight) {
        const updateData = {
            confirmations
        };
        if (blockHeight) {
            updateData.blockHeight = blockHeight;
        }
        if (confirmations >= this.requiredConfirmations && this.status !== 'CONFIRMED') {
            updateData.status = 'CONFIRMED';
        }
        await this.update(updateData);
    }
    /**
     * Отметка неудачи с увеличением счетчика повторов
     */
    async markAsFailed(errorMessage) {
        await this.update({
            status: 'FAILED',
            errorMessage,
            retryCount: this.retryCount + 1
        });
    }
    /**
     * Повторная обработка
     */
    async retry(delayMinutes = 5) {
        if (!this.canRetry()) {
            throw new Error('Нельзя повторить обработку: достигнут лимит попыток');
        }
        const newScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        await this.update({
            status: 'PENDING',
            scheduledAt: newScheduledAt,
            errorMessage: undefined,
            retryCount: this.retryCount + 1
        });
    }
    /**
     * Расчет времени ожидания
     */
    getTimeUntilProcessing() {
        const now = Date.now();
        const scheduledTime = this.scheduledAt.getTime();
        return Math.max(0, scheduledTime - now);
    }
    /**
     * Получение процента завершения
     */
    getCompletionPercentage() {
        if (this.status === 'CONFIRMED')
            return 100;
        if (this.status === 'FAILED')
            return 0;
        if (this.confirmations === 0)
            return 10;
        return Math.min(90, 10 + (this.confirmations / this.requiredConfirmations) * 80);
    }
    /**
     * Проверка просроченности
     */
    isOverdue(maxDelayHours = 24) {
        const maxTime = this.scheduledAt.getTime() + maxDelayHours * 60 * 60 * 1000;
        return Date.now() > maxTime && !['CONFIRMED', 'FAILED'].includes(this.status);
    }
    /**
     * Получение эффективной комиссии
     */
    getEffectiveFeeRate() {
        return this.amount > 0 ? (this.fee / this.amount) * 100 : 0;
    }
    // Статические методы
    /**
     * Поиск транзакций готовых к обработке
     */
    static async findReadyForProcessing(limit = 50) {
        return await this.findAll({
            where: {
                status: 'PENDING',
                scheduledAt: {
                    [sequelize_1.Op.lte]: new Date()
                },
                retryCount: {
                    [sequelize_1.Op.lt]: sequelize_1.Sequelize.col('maxRetries')
                }
            },
            order: [
                ['priority', 'DESC'],
                ['scheduledAt', 'ASC']
            ],
            limit
        });
    }
    /**
     * Поиск по запросу микширования
     */
    static async findByMixRequest(mixRequestId) {
        return await this.findAll({
            where: { mixRequestId },
            order: [['outputIndex', 'ASC']]
        });
    }
    /**
     * Поиск неподтвержденных транзакций для мониторинга
     */
    static async findUnconfirmed(currency) {
        const where = {
            status: ['PENDING', 'BROADCASTING', 'MEMPOOL'],
            txid: {
                [sequelize_1.Op.ne]: null
            }
        };
        if (currency)
            where.currency = currency;
        return await this.findAll({
            where,
            order: [['processedAt', 'ASC']]
        });
    }
    /**
     * Поиск просроченных транзакций
     */
    static async findOverdue(maxDelayHours = 24) {
        const cutoffTime = new Date(Date.now() - maxDelayHours * 60 * 60 * 1000);
        return await this.findAll({
            where: {
                scheduledAt: {
                    [sequelize_1.Op.lt]: cutoffTime
                },
                status: ['PENDING', 'BROADCASTING']
            },
            order: [['scheduledAt', 'ASC']]
        });
    }
    /**
     * Поиск неудачных транзакций для повтора
     */
    static async findForRetry() {
        return await this.findAll({
            where: {
                status: 'FAILED',
                retryCount: {
                    [sequelize_1.Op.lt]: sequelize_1.Sequelize.col('maxRetries')
                }
            },
            order: [['retryCount', 'ASC'], ['updatedAt', 'ASC']]
        });
    }
    /**
     * Статистика по исходящим транзакциям
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
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('amount')), 'totalAmount'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('fee')), 'totalFee'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('delayMinutes')), 'avgDelay'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('retryCount')), 'avgRetries']
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
                totalFee: parseFloat(stat.totalFee) || 0,
                avgDelay: parseFloat(stat.avgDelay) || 0,
                avgRetries: parseFloat(stat.avgRetries) || 0
            };
        });
        return result;
    }
    /**
     * Групповое обновление статуса для запроса микширования
     */
    static async updateStatusForMixRequest(mixRequestId, status) {
        const [updatedCount] = await this.update({ status }, {
            where: { mixRequestId },
            returning: false
        });
        return updatedCount;
    }
    /**
     * Получение общей статистики успешности
     */
    static async getSuccessRate(timeFrame = 'day') {
        const hours = timeFrame === 'day' ? 24 : (timeFrame === 'week' ? 168 : 720);
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        const stats = await this.findAll({
            attributes: [
                'status',
                [sequelize_1.Sequelize.fn('COUNT', sequelize_1.Sequelize.col('id')), 'count']
            ],
            where: {
                processedAt: {
                    [sequelize_1.Op.gte]: cutoffTime
                },
                status: ['CONFIRMED', 'FAILED']
            },
            group: ['status'],
            raw: true
        });
        let successful = 0;
        let failed = 0;
        stats.forEach((stat) => {
            const count = parseInt(stat.count);
            if (stat.status === 'CONFIRMED') {
                successful = count;
            }
            else if (stat.status === 'FAILED') {
                failed = count;
            }
        });
        const totalProcessed = successful + failed;
        const successRate = totalProcessed > 0 ? (successful / totalProcessed) * 100 : 0;
        return {
            successRate,
            totalProcessed,
            successful,
            failed
        };
    }
    /**
     * Очистка старых записей
     */
    static async cleanupOld(daysToKeep = 30) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        const result = await this.destroy({
            where: {
                status: 'CONFIRMED',
                processedAt: {
                    [sequelize_1.Op.lt]: cutoffDate
                }
            }
        });
        return result;
    }
}
exports.OutputTransaction = OutputTransaction;
/**
 * Инициализация модели OutputTransaction
 */
function initOutputTransaction(sequelize) {
    OutputTransaction.init({
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        mixRequestId: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'mix_requests',
                key: 'id'
            }
        },
        blockchainTransactionId: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'blockchain_transactions',
                key: 'id'
            }
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        amount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        fee: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        fromAddress: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        toAddress: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        scheduledAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false
        },
        delayMinutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 0,
                max: 10080 // максимум неделя
            }
        },
        processedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        txid: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        blockHeight: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 0
            }
        },
        confirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        requiredConfirmations: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 100
            }
        },
        outputIndex: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        totalOutputs: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1
            }
        },
        percentage: {
            type: sequelize_1.DataTypes.DECIMAL(5, 2),
            allowNull: false,
            validate: {
                min: 0,
                max: 100
            }
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
        retryCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        maxRetries: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3,
            validate: {
                min: 0,
                max: 10
            }
        },
        errorMessage: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        isAnonymized: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        mixingRounds: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1,
                max: 10
            }
        },
        anonymitySet: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: 1,
                max: 1000
            }
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
        modelName: 'OutputTransaction',
        tableName: 'output_transactions',
        timestamps: true,
        paranoid: true,
        indexes: [
            {
                fields: ['mixRequestId']
            },
            {
                fields: ['blockchainTransactionId']
            },
            {
                fields: ['currency']
            },
            {
                fields: ['status']
            },
            {
                fields: ['txid']
            },
            {
                fields: ['fromAddress']
            },
            {
                fields: ['toAddress']
            },
            {
                fields: ['scheduledAt']
            },
            {
                fields: ['processedAt']
            },
            {
                fields: ['status', 'scheduledAt']
            },
            {
                fields: ['currency', 'status']
            },
            {
                fields: ['mixRequestId', 'outputIndex']
            },
            {
                fields: ['priority', 'scheduledAt']
            },
            {
                fields: ['retryCount', 'maxRetries']
            }
        ],
        hooks: {
            beforeCreate: (outputTransaction) => {
                // Устанавливаем время обработки с учетом задержки
                const scheduledTime = new Date(outputTransaction.createdAt);
                scheduledTime.setMinutes(scheduledTime.getMinutes() + outputTransaction.delayMinutes);
                outputTransaction.scheduledAt = scheduledTime;
            }
        }
    });
    return OutputTransaction;
}
exports.default = OutputTransaction;
//# sourceMappingURL=OutputTransaction.js.map