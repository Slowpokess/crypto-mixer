"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainTransaction = void 0;
exports.initBlockchainTransaction = initBlockchainTransaction;
const sequelize_1 = require("sequelize");
/**
 * Модель блокчейн транзакции
 * Отслеживание всех транзакций в блокчейне для микширования
 */
class BlockchainTransaction extends sequelize_1.Model {
    // Методы экземпляра
    /**
     * Проверка подтверждения транзакции
     */
    isConfirmed() {
        return this.confirmations >= this.requiredConfirmations;
    }
    /**
     * Проверка нахождения в мемпуле
     */
    isInMempool() {
        return this.status === 'MEMPOOL' || (this.status === 'BROADCASTING' && !this.blockHeight);
    }
    /**
     * Получение процента подтверждений
     */
    getConfirmationProgress() {
        if (this.requiredConfirmations === 0)
            return 100;
        return Math.min((this.confirmations / this.requiredConfirmations) * 100, 100);
    }
    /**
     * Обновление количества подтверждений
     */
    async updateConfirmations(confirmations, blockHeight, blockHash) {
        const updateData = {
            confirmations,
            lastCheckedAt: new Date(),
            checkCount: this.checkCount + 1
        };
        if (blockHeight) {
            updateData.blockHeight = blockHeight;
        }
        if (blockHash) {
            updateData.blockHash = blockHash;
        }
        // Обновляем статус в зависимости от подтверждений
        if (confirmations >= this.requiredConfirmations && this.status !== 'CONFIRMED') {
            updateData.status = 'CONFIRMED';
            updateData.confirmedAt = new Date();
        }
        else if (confirmations > 0 && this.status === 'MEMPOOL') {
            updateData.status = 'PENDING';
        }
        await this.update(updateData);
    }
    /**
     * Отметка об ошибке
     */
    async markAsFailed(errorMessage) {
        await this.update({
            status: 'FAILED',
            errorMessage,
            retryCount: this.retryCount + 1,
            lastCheckedAt: new Date()
        });
    }
    /**
     * Отметка о трансляции
     */
    async markAsBroadcasted() {
        await this.update({
            status: 'BROADCASTING',
            broadcastedAt: new Date()
        });
    }
    /**
     * Получение эффективности комиссии
     */
    getFeeEfficiency() {
        if (!this.feeRate || this.size === 0)
            return 0;
        return this.fee / this.size; // сатоши за байт или wei за газ
    }
    /**
     * Расчет времени до подтверждения
     */
    getEstimatedConfirmationTime() {
        if (this.isConfirmed())
            return null;
        const avgBlockTime = this.getAverageBlockTime();
        const remainingConfirmations = this.requiredConfirmations - this.confirmations;
        const estimatedMs = remainingConfirmations * avgBlockTime * 1000;
        return new Date(Date.now() + estimatedMs);
    }
    /**
     * Получение среднего времени блока для валюты
     */
    getAverageBlockTime() {
        const blockTimes = {
            'BTC': 600, // 10 минут
            'ETH': 13, // 13 секунд
            'USDT': 13, // На Ethereum
            'SOL': 0.4, // 400ms
            'LTC': 150, // 2.5 минуты
            'DASH': 157, // ~2.6 минуты
            'ZEC': 150 // 2.5 минуты
        };
        return blockTimes[this.currency] || 600;
    }
    /**
     * Получение всех адресов транзакции
     */
    getAllAddresses() {
        const addresses = new Set();
        this.inputs.forEach(input => {
            if (input.address)
                addresses.add(input.address);
        });
        this.outputs.forEach(output => {
            if (output.address)
                addresses.add(output.address);
        });
        return Array.from(addresses);
    }
    /**
     * Проверка принадлежности адреса к транзакции
     */
    containsAddress(address) {
        return this.getAllAddresses().includes(address);
    }
    /**
     * Получение суммы для конкретного адреса
     */
    getAmountForAddress(address) {
        let received = 0;
        let sent = 0;
        this.outputs.forEach(output => {
            if (output.address === address) {
                received += output.amount;
            }
        });
        this.inputs.forEach(input => {
            if (input.address === address) {
                sent += input.amount;
            }
        });
        return { received, sent };
    }
    // Статические методы
    /**
     * Поиск по txid
     */
    static async findByTxid(txid) {
        return await this.findOne({ where: { txid } });
    }
    /**
     * Поиск неподтвержденных транзакций
     */
    static async findUnconfirmed(currency) {
        const where = {
            [sequelize_1.Op.or]: [
                { status: 'PENDING' },
                { status: 'MEMPOOL' },
                { status: 'BROADCASTING' }
            ]
        };
        if (currency)
            where.currency = currency;
        return await this.findAll({
            where,
            order: [['createdAt', 'ASC']]
        });
    }
    /**
     * Поиск транзакций для мониторинга
     */
    static async findForMonitoring(limit = 100) {
        const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 минут назад
        // Расширенная логика мониторинга с правильной типизацией
        const whereCondition = {
            status: {
                [sequelize_1.Op.in]: ['PENDING', 'MEMPOOL', 'BROADCASTING']
            },
            [sequelize_1.Op.or]: [
                { lastCheckedAt: { [sequelize_1.Op.is]: null } },
                { lastCheckedAt: { [sequelize_1.Op.lt]: cutoffTime } }
            ]
        };
        return await this.findAll({
            where: whereCondition,
            order: [['lastCheckedAt', 'ASC']],
            limit,
            // Дополнительная логика для оптимизации запроса
            attributes: {
                include: [
                    // Добавляем вычисляемое поле времени ожидания
                    [
                        sequelize_1.Sequelize.literal(`EXTRACT(EPOCH FROM (NOW() - "lastCheckedAt"))`),
                        'waitingTime'
                    ]
                ]
            }
        });
    }
    /**
     * Поиск по адресу
     */
    static async findByAddress(address, currency) {
        const where = {};
        if (currency)
            where.currency = currency;
        return await this.findAll({
            where: {
                ...where,
                [sequelize_1.Op.or]: [
                    { fromAddress: address },
                    { toAddress: address },
                    {
                        [sequelize_1.Op.or]: [
                            sequelize_1.Sequelize.literal(`inputs @> '[{"address": "${address}"}]'`),
                            sequelize_1.Sequelize.literal(`outputs @> '[{"address": "${address}"}]'`)
                        ]
                    }
                ]
            },
            order: [['createdAt', 'DESC']]
        });
    }
    /**
     * Статистика по транзакциям
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
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('confirmations')), 'avgConfirmations']
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
                avgConfirmations: parseFloat(stat.avgConfirmations) || 0
            };
        });
        return result;
    }
    /**
     * Очистка старых транзакций
     */
    static async cleanupOld(daysToKeep = 30) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        const result = await this.destroy({
            where: {
                status: 'CONFIRMED',
                confirmedAt: {
                    [sequelize_1.Op.lt]: cutoffDate
                }
            }
        });
        return result;
    }
}
exports.BlockchainTransaction = BlockchainTransaction;
/**
 * Инициализация модели BlockchainTransaction
 */
function initBlockchainTransaction(sequelize) {
    BlockchainTransaction.init({
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        mixRequestId: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'mix_requests',
                key: 'id'
            }
        },
        txid: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('INPUT', 'OUTPUT', 'INTERNAL'),
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
        feeRate: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: true
        },
        blockHeight: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 0
            }
        },
        blockHash: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
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
        inputs: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
        },
        outputs: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
        },
        inputsCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        outputsCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        fromAddress: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        toAddress: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        broadcastedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        confirmedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        estimatedConfirmationTime: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        rawTransaction: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        hexData: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        size: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        vsize: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        weight: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        nonce: {
            type: sequelize_1.DataTypes.BIGINT,
            allowNull: true
        },
        gasPrice: {
            type: sequelize_1.DataTypes.DECIMAL(30, 0),
            allowNull: true
        },
        gasLimit: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        gasUsed: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true
        },
        lastCheckedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        checkCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        errorMessage: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true
        },
        retryCount: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
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
        modelName: 'BlockchainTransaction',
        tableName: 'blockchain_transactions',
        timestamps: true,
        paranoid: true,
        indexes: [
            {
                unique: true,
                fields: ['txid', 'currency']
            },
            {
                fields: ['mixRequestId']
            },
            {
                fields: ['currency']
            },
            {
                fields: ['status']
            },
            {
                fields: ['type']
            },
            {
                fields: ['blockHeight']
            },
            {
                fields: ['confirmations']
            },
            {
                fields: ['fromAddress']
            },
            {
                fields: ['toAddress']
            },
            {
                fields: ['lastCheckedAt']
            },
            {
                fields: ['currency', 'status']
            },
            {
                fields: ['status', 'lastCheckedAt']
            },
            {
                using: 'gin',
                fields: ['inputs']
            },
            {
                using: 'gin',
                fields: ['outputs']
            }
        ],
        hooks: {
            beforeCreate: (transaction) => {
                transaction.inputsCount = transaction.inputs.length;
                transaction.outputsCount = transaction.outputs.length;
            },
            beforeUpdate: (transaction) => {
                if (transaction.changed('inputs')) {
                    transaction.inputsCount = transaction.inputs.length;
                }
                if (transaction.changed('outputs')) {
                    transaction.outputsCount = transaction.outputs.length;
                }
            }
        }
    });
    return BlockchainTransaction;
}
exports.default = BlockchainTransaction;
//# sourceMappingURL=BlockchainTransaction.js.map