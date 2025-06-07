"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MixRequestSecurity = exports.MixRequest = void 0;
exports.initMixRequest = initMixRequest;
const sequelize_1 = require("sequelize");
const EncryptedModelBase_1 = require("../utils/EncryptedModelBase");
const DataEncryption_1 = require("../utils/DataEncryption");
/**
 * Модель запроса на микширование с поддержкой шифрования чувствительных данных
 * Центральная таблица для отслеживания всех запросов на микширование
 */
class MixRequest extends EncryptedModelBase_1.EncryptedModelBase {
    // Методы экземпляра
    /**
     * Проверка истечения срока запроса
     */
    isExpired() {
        return new Date() > this.expiresAt;
    }
    /**
     * Проверка завершенности запроса
     */
    isCompleted() {
        return this.status === 'COMPLETED';
    }
    /**
     * Проверка возможности отмены
     */
    canBeCancelled() {
        return ['PENDING', 'PROCESSING'].includes(this.status);
    }
    /**
     * Получение общей суммы вывода
     */
    getTotalOutputAmount() {
        return this.outputAddresses.reduce((total, output) => {
            return total + (output.amount || (this.outputAmount * output.percentage / 100));
        }, 0);
    }
    /**
     * Расчет комиссии
     */
    calculateFee() {
        return this.inputAmount * this.feePercentage / 100;
    }
    /**
     * Обновление статуса
     */
    async updateStatus(newStatus, notes) {
        const updateData = {
            status: newStatus,
            notes: notes || this.notes
        };
        if (newStatus === 'COMPLETED') {
            updateData.completedAt = new Date();
        }
        await this.update(updateData);
    }
    /**
     * Добавление адреса вывода
     */
    addOutputAddress(address, percentage, delayMinutes) {
        const currentTotal = this.outputAddresses.reduce((sum, addr) => sum + addr.percentage, 0);
        if (currentTotal + percentage > 100) {
            throw new Error('Общий процент адресов вывода не может превышать 100%');
        }
        this.outputAddresses.push({
            address,
            percentage,
            delayMinutes
        });
    }
    /**
     * Валидация адресов вывода
     */
    validateOutputAddresses() {
        const errors = [];
        if (this.outputAddresses.length === 0) {
            errors.push('Необходим хотя бы один адрес вывода');
        }
        const totalPercentage = this.outputAddresses.reduce((sum, addr) => sum + addr.percentage, 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
            errors.push('Общий процент адресов вывода должен равняться 100%');
        }
        // Проверка уникальности адресов
        const addresses = this.outputAddresses.map(addr => addr.address);
        const uniqueAddresses = new Set(addresses);
        if (addresses.length !== uniqueAddresses.size) {
            errors.push('Адреса вывода должны быть уникальными');
        }
        // Проверка на совпадение с входным адресом
        if (addresses.includes(this.inputAddress)) {
            errors.push('Адрес вывода не может совпадать с входным адресом');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    // Статические методы
    /**
     * Поиск запросов по статусу
     */
    static async findByStatus(status) {
        return await this.findAll({
            where: { status },
            order: [['createdAt', 'DESC']]
        });
    }
    /**
     * Поиск активных запросов
     */
    static async findActive() {
        return await this.findAll({
            where: {
                status: ['PENDING', 'PROCESSING', 'MIXING']
            },
            order: [['createdAt', 'ASC']]
        });
    }
    /**
     * Поиск истекших запросов
     */
    static async findExpired() {
        return await this.findAll({
            where: {
                expiresAt: {
                    [sequelize_1.Op.lt]: new Date()
                },
                status: ['PENDING', 'PROCESSING']
            }
        });
    }
    /**
     * Статистика по валютам
     */
    static async getCurrencyStats() {
        const stats = await this.findAll({
            attributes: [
                'currency',
                [sequelize_1.Sequelize.fn('COUNT', sequelize_1.Sequelize.col('id')), 'count'],
                [sequelize_1.Sequelize.fn('SUM', sequelize_1.Sequelize.col('inputAmount')), 'totalVolume'],
                [sequelize_1.Sequelize.fn('AVG', sequelize_1.Sequelize.col('inputAmount')), 'averageAmount']
            ],
            group: ['currency'],
            raw: true
        });
        const result = {};
        stats.forEach((stat) => {
            // Расширенная типизация для безопасного индексирования
            const currency = stat.currency;
            result[currency] = {
                count: parseInt(stat.count),
                totalVolume: parseFloat(stat.totalVolume) || 0,
                averageAmount: parseFloat(stat.averageAmount) || 0
            };
        });
        return result;
    }
}
exports.MixRequest = MixRequest;
/**
 * Инициализация модели MixRequest с поддержкой шифрования
 */
function initMixRequest(sequelize) {
    // Настройка полей для шифрования чувствительных данных
    const encryptedFields = {
        ipAddress: {
            dataType: DataEncryption_1.SensitiveDataType.IP_ADDRESS,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
        userAgent: {
            dataType: DataEncryption_1.SensitiveDataType.USER_METADATA,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
        referrer: {
            dataType: DataEncryption_1.SensitiveDataType.USER_METADATA,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
        notes: {
            dataType: DataEncryption_1.SensitiveDataType.NOTES,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        }
    };
    // Определяем зашифрованные поля
    MixRequest.defineEncryptedFields(encryptedFields);
    // Создаем атрибуты для зашифрованных полей
    const encryptedAttributes = MixRequest.createEncryptedAttributes();
    MixRequest.init({
        ...encryptedAttributes, // Добавляем зашифрованные поля
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        sessionId: {
            type: sequelize_1.DataTypes.STRING(64),
            allowNull: false,
            validate: {
                notEmpty: true,
                len: [8, 64]
            }
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false
        },
        inputAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        outputAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                isDecimal: true
            }
        },
        feeAmount: {
            type: sequelize_1.DataTypes.DECIMAL(20, 8),
            allowNull: false,
            defaultValue: 0,
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
        status: {
            type: sequelize_1.DataTypes.ENUM('PENDING', 'PROCESSING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'),
            allowNull: false,
            defaultValue: 'PENDING'
        },
        inputAddress: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        outputAddresses: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: false,
            defaultValue: []
        },
        delayMinutes: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                max: 1440 // 24 часа
            }
        },
        expiresAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false
        },
        completedAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true
        },
        // БЕЗОПАСНОСТЬ: Чувствительные поля (ipAddress, userAgent, referrer, notes) 
        // автоматически создаются через encryptedAttributes с шифрованием AES-256-GCM
        transactionCount: {
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
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        riskScore: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                max: 100
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
        modelName: 'MixRequest',
        tableName: 'mix_requests',
        timestamps: true,
        paranoid: true, // Soft delete
        indexes: [
            {
                fields: ['sessionId']
            },
            {
                fields: ['currency']
            },
            {
                fields: ['status']
            },
            {
                fields: ['inputAddress']
            },
            {
                fields: ['createdAt']
            },
            {
                fields: ['expiresAt']
            },
            {
                fields: ['status', 'currency']
            },
            {
                fields: ['status', 'expiresAt']
            }
        ],
        hooks: {
            beforeCreate: (mixRequest) => {
                // Расчет суммы вывода и комиссии
                mixRequest.feeAmount = mixRequest.calculateFee();
                mixRequest.outputAmount = mixRequest.inputAmount - mixRequest.feeAmount;
            },
            beforeUpdate: (mixRequest) => {
                // Пересчет при изменении входящей суммы или процента комиссии
                if (mixRequest.changed('inputAmount') || mixRequest.changed('feePercentage')) {
                    mixRequest.feeAmount = mixRequest.calculateFee();
                    mixRequest.outputAmount = mixRequest.inputAmount - mixRequest.feeAmount;
                }
            }
        }
    });
    // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Настройка автоматического шифрования
    MixRequest.setupEncryptionHooks();
    // Инициализация системы шифрования
    MixRequest.initializeEncryption();
    console.log('🔒 MixRequest model initialized with AES-256-GCM encryption for sensitive data');
    return MixRequest;
}
/**
 * Расширенные методы для работы с зашифрованными данными
 */
var MixRequestSecurity;
(function (MixRequestSecurity) {
    /**
     * Массовое перешифровывание всех записей
     */
    async function reencryptAllRecords(newKeyVersion) {
        const records = await MixRequest.findAll();
        let reencryptedCount = 0;
        for (const record of records) {
            try {
                if (record.needsReencryption()) {
                    await record.reencryptAllFields(newKeyVersion);
                    reencryptedCount++;
                }
            }
            catch (error) {
                console.error(`❌ Failed to re-encrypt MixRequest ${record.id}:`, error);
            }
        }
        console.log(`🔄 Re-encrypted ${reencryptedCount} MixRequest records`);
        return reencryptedCount;
    }
    MixRequestSecurity.reencryptAllRecords = reencryptAllRecords;
    /**
     * Аудит шифрования для всех записей
     */
    async function auditEncryption() {
        const records = await MixRequest.findAll();
        const keyVersions = new Set();
        let encryptedCount = 0;
        let needsReencryptionCount = 0;
        for (const record of records) {
            const stats = record.getEncryptionStats();
            if (stats.encryptedFields > 0) {
                encryptedCount++;
                stats.keyVersions.forEach(v => keyVersions.add(v));
            }
            if (record.needsReencryption()) {
                needsReencryptionCount++;
            }
        }
        const auditResult = {
            total: records.length,
            encrypted: encryptedCount,
            needsReencryption: needsReencryptionCount,
            keyVersions: Array.from(keyVersions)
        };
        console.log('🔍 MixRequest encryption audit:', auditResult);
        return auditResult;
    }
    MixRequestSecurity.auditEncryption = auditEncryption;
    /**
     * Поиск записей по зашифрованным полям (требует расшифровки)
     */
    async function findByEncryptedField(fieldName, searchValue) {
        const allRecords = await MixRequest.findAll();
        const matchingRecords = [];
        for (const record of allRecords) {
            try {
                const decryptedValue = await record.getDecryptedFieldAsync(fieldName);
                if (decryptedValue && String(decryptedValue).includes(searchValue)) {
                    matchingRecords.push(record);
                }
            }
            catch (error) {
                console.error(`❌ Failed to decrypt ${fieldName} for record ${record.id}:`, error);
            }
        }
        return matchingRecords;
    }
    MixRequestSecurity.findByEncryptedField = findByEncryptedField;
    /**
     * Экспорт зашифрованных данных для резервного копирования
     */
    async function exportEncryptedData(recordId) {
        const record = await MixRequest.findByPk(recordId);
        if (!record) {
            throw new Error(`MixRequest ${recordId} not found`);
        }
        return {
            id: record.id,
            encryptedData: record.exportEncryptedData(),
            stats: record.getEncryptionStats()
        };
    }
    MixRequestSecurity.exportEncryptedData = exportEncryptedData;
})(MixRequestSecurity || (exports.MixRequestSecurity = MixRequestSecurity = {}));
exports.default = MixRequest;
//# sourceMappingURL=MixRequest.js.map