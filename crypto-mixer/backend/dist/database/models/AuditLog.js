"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
exports.initAuditLog = initAuditLog;
const sequelize_1 = require("sequelize");
const EncryptedModelBase_1 = require("../utils/EncryptedModelBase");
const DataEncryption_1 = require("../utils/DataEncryption");
class AuditLog extends EncryptedModelBase_1.EncryptedModelBase {
    static async logAction(data) {
        return await this.create({
            success: true,
            ...data
        });
    }
    static async findByUser(userId, limit = 100) {
        return await this.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit
        });
    }
    static async findBySession(sessionId) {
        return await this.findAll({
            where: { sessionId },
            order: [['createdAt', 'ASC']]
        });
    }
    static async findByMixRequest(mixRequestId) {
        return await this.findAll({
            where: { mixRequestId },
            order: [['createdAt', 'ASC']]
        });
    }
    static async findErrors(timeFrame = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
        return await this.findAll({
            where: {
                level: 'ERROR',
                createdAt: { [sequelize_1.Op.gte]: timeFrame }
            },
            order: [['createdAt', 'DESC']]
        });
    }
    static async getStatistics(timeFrame) {
        const stats = await this.findAll({
            attributes: [
                'level',
                'action',
                'success',
                [sequelize_1.Sequelize.fn('COUNT', sequelize_1.Sequelize.col('id')), 'count']
            ],
            where: {
                createdAt: { [sequelize_1.Op.gte]: timeFrame }
            },
            group: ['level', 'action', 'success'],
            raw: true
        });
        const result = {};
        stats.forEach((stat) => {
            const key = `${stat.level}_${stat.action}_${stat.success ? 'success' : 'failure'}`;
            result[key] = parseInt(stat.count);
        });
        return result;
    }
}
exports.AuditLog = AuditLog;
function initAuditLog(sequelize) {
    // Настройка полей для шифрования чувствительных данных аудита
    const encryptedFields = {
        details: {
            dataType: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
        oldValues: {
            dataType: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
        newValues: {
            dataType: DataEncryption_1.SensitiveDataType.AUDIT_DETAILS,
            autoEncrypt: true,
            autoDecrypt: true,
            nullable: true
        },
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
        }
    };
    // Определяем зашифрованные поля
    AuditLog.defineEncryptedFields(encryptedFields);
    // Создаем атрибуты для зашифрованных полей
    const encryptedAttributes = AuditLog.createEncryptedAttributes();
    AuditLog.init({
        ...encryptedAttributes, // Добавляем зашифрованные поля
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            allowNull: false
        },
        level: {
            type: sequelize_1.DataTypes.ENUM('ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
            allowNull: false
        },
        action: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        userId: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        sessionId: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        mixRequestId: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: true,
            references: { model: 'mix_requests', key: 'id' }
        },
        resourceType: {
            type: sequelize_1.DataTypes.STRING(50),
            allowNull: true
        },
        resourceId: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true
        },
        message: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false
        },
        // БЕЗОПАСНОСТЬ: Чувствительные поля (details, oldValues, newValues, ipAddress, userAgent) 
        // автоматически создаются через encryptedAttributes с шифрованием AES-256-GCM
        success: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        duration: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            validate: { min: 0 }
        },
        errorCode: {
            type: sequelize_1.DataTypes.STRING(50),
            allowNull: true
        },
        createdAt: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'AuditLog',
        tableName: 'audit_logs',
        timestamps: false,
        indexes: [
            { fields: ['level'] },
            { fields: ['action'] },
            { fields: ['userId'] },
            { fields: ['sessionId'] },
            { fields: ['mixRequestId'] },
            { fields: ['resourceType', 'resourceId'] },
            { fields: ['createdAt'] },
            { fields: ['level', 'createdAt'] },
            { fields: ['success', 'createdAt'] }
        ]
    });
    // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Настройка автоматического шифрования
    AuditLog.setupEncryptionHooks();
    // Инициализация системы шифрования
    AuditLog.initializeEncryption();
    console.log('🔒 AuditLog model initialized with AES-256-GCM encryption for sensitive audit data');
    return AuditLog;
}
exports.default = AuditLog;
//# sourceMappingURL=AuditLog.js.map