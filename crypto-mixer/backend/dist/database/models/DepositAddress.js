"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositAddress = void 0;
const sequelize_1 = require("sequelize");
const crypto_1 = __importDefault(require("crypto"));
class DepositAddress extends sequelize_1.Model {
    // Instance methods
    encryptPrivateKey(privateKey, encryptionKey) {
        try {
            // Расширенная криптография с современными алгоритмами
            const algorithm = 'aes-256-gcm';
            const key = crypto_1.default.scryptSync(encryptionKey, 'salt', 32);
            const iv = crypto_1.default.randomBytes(16);
            const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            // Получаем authentication tag для дополнительной безопасности
            const authTag = cipher.getAuthTag();
            // Комбинируем IV, authTag и зашифрованные данные
            const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
            this.private_key_encrypted = result;
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Ошибка шифрования приватного ключа: ${errorMessage}`);
        }
    }
    decryptPrivateKey(encryptionKey) {
        try {
            // Расширенная логика расшифровки с проверкой целостности
            const algorithm = 'aes-256-gcm';
            const key = crypto_1.default.scryptSync(encryptionKey, 'salt', 32);
            // Разбираем зашифрованные данные
            const parts = this.private_key_encrypted.split(':');
            if (parts.length !== 3) {
                throw new Error('Неверный формат зашифрованных данных');
            }
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Ошибка расшифровки приватного ключа: ${errorMessage}`);
        }
    }
    async markAsUsed() {
        this.used = true;
        this.first_used_at = new Date();
        await this.save();
    }
    isValidForCurrency() {
        const validators = {
            BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
            ETH: /^0x[a-fA-F0-9]{40}$/,
            USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
            SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
        };
        const pattern = validators[this.currency];
        return pattern ? pattern.test(this.address) : false;
    }
    static async findByAddress(address) {
        return this.findOne({ where: { address } });
    }
    static async findUnusedByCurrency(currency, limit = 10) {
        return this.scope(['unused', { method: ['byCurrency', currency] }])
            .findAll({
            limit,
            order: [['created_at', 'ASC']]
        });
    }
    static async generateNextIndex(currency) {
        const lastAddress = await this.findOne({
            where: { currency },
            order: [['address_index', 'DESC']],
            attributes: ['address_index']
        });
        return lastAddress ? (lastAddress.address_index || 0) + 1 : 0;
    }
    static async getUsageStats() {
        const result = await this.findAll({
            attributes: [
                "currency",
                [sequelize_1.Sequelize.fn("COUNT", sequelize_1.Sequelize.col("id")), "total"],
                [sequelize_1.Sequelize.fn("COUNT", sequelize_1.Sequelize.literal("CASE WHEN used=true THEN1 END")), "used_count"]
            ],
            group: ["currency"]
        });
        // Расширенная типизация для корректной работы со статистикой
        return result.reduce((acc, item) => {
            const currency = item.currency;
            const total = parseInt(String(item.get("total")));
            const used = parseInt(String(item.get("used_count"))) || 0;
            acc[currency] = {
                total,
                used,
                unused: total - used,
                usage_percentage: total > 0 ? ((used / total) * 100).toFixed(2) : 0,
                // Дополнительная аналитика
                efficiency_score: total > 0 ? Math.round((used / total) * 100) : 0,
                last_updated: new Date()
            };
            return acc;
        }, {});
    }
    static async createSecure(data, encryptionKey, transaction = null) {
        const { privateKey, ...addressData } = data;
        // Расширенная валидация входящих данных
        if (!privateKey || !data.currency || !data.address || !data.mix_request_id) {
            throw new Error('Обязательные поля не заполнены для создания безопасного адреса');
        }
        // Создание записи с полными данными адреса
        const address = await this.create({
            ...addressData,
            // Расширенные поля с правильной типизацией
            used: false,
            expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа
            // Поля timestamps будут автоматически заполнены Sequelize
        }, { transaction });
        // Шифрование и сохранение приватного ключа
        if (privateKey) {
            address.encryptPrivateKey(privateKey, encryptionKey);
            await address.save({ transaction });
        }
        return address;
    }
}
exports.DepositAddress = DepositAddress;
exports.default = (sequelizeInstance) => {
    DepositAddress.init({
        id: {
            type: sequelize_1.DataTypes.UUID,
            defaultValue: sequelize_1.DataTypes.UUIDV4,
            primaryKey: true,
            comment: 'Уникальный идентификатор записи адреса депозита'
        },
        mix_request_id: {
            type: sequelize_1.DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'mix_requests',
                key: 'id'
            },
            onDelete: 'CASCADE',
            comment: 'Идентификатор связанного запроса на микширование'
        },
        currency: {
            type: sequelize_1.DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
            allowNull: false,
            comment: 'Тип криптовалюты адреса'
        },
        address: {
            type: sequelize_1.DataTypes.STRING(128),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true,
                len: [20, 128],
                isValidAddress(value) {
                    // Базовая валидация адресов по длине и формату
                    // Расширенная типизация валидаторов адресов
                    const validators = {
                        BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
                        ETH: /^0x[a-fA-F0-9]{40}$/,
                        USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
                        SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
                    };
                    const pattern = validators[String(this.currency)];
                    if (pattern && !pattern.test(value)) {
                        throw new Error(`Неверный формат адреса для валюты ${this.currency}`);
                    }
                }
            },
            comment: 'Адрес для получения депозита'
        },
        private_key_encrypted: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true
            },
            comment: 'Зашифрованный приватный ключ адреса'
        },
        encryption_iv: {
            type: sequelize_1.DataTypes.STRING(32),
            allowNull: false,
            comment: 'Вектор инициализации для расшифровки приватного ключа'
        },
        used: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'Флаг использования адреса (получен ли депозит)'
        },
        first_used_at: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true,
            comment: 'Время первого получения средств на адрес'
        },
        derivation_path: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
            validate: {
                isValidPath(value) {
                    if (value && !/^m(\/\d+'?)*$/.test(value)) {
                        throw new Error('Неверный формат пути деривации');
                    }
                }
            },
            comment: 'Путь деривации для HD кошельков (BIP44/BIP49/BIP84)'
        },
        address_index: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 0
            },
            comment: 'Индекс адреса в последовательности генерации'
        },
        metadata: {
            type: sequelize_1.DataTypes.JSONB,
            allowNull: true,
            defaultValue: {},
            comment: 'Дополнительные метаданные адреса'
        }
    }, {
        sequelize: sequelizeInstance,
        tableName: "deposit_addresses",
        timestamps: true,
        underscored: true,
        indexes: [
            { fields: ['mix_request_id'], unique: true },
            { fields: ['address'], unique: true },
            { fields: ['currency', 'used'] },
            { fields: ['currency', 'address_index'] },
            { fields: ['created_at'] }
        ],
        hooks: {
            beforeCreate: (depositAddress) => {
                // Генерация IV для шифрования если не задан
                if (!depositAddress.encryption_iv) {
                    depositAddress.encryption_iv = crypto_1.default.randomBytes(16).toString('hex');
                }
            },
            beforeUpdate: (depositAddress) => {
                // Установка времени первого использования
                if (depositAddress.changed('used') && depositAddress.used && !depositAddress.first_used_at) {
                    depositAddress.first_used_at = new Date();
                }
            }
        },
        scopes: {
            unused: {
                where: { used: false }
            },
            used: {
                where: { used: true }
            },
            byCurrency: (currency) => ({
                where: { currency }
            }),
            recent: {
                where: {
                    created_at: { [sequelizeInstance.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }
            }
        }
    });
    // Расширенный функционал ассоциаций
    DepositAddress.associate = (models) => {
        DepositAddress.belongsTo(models.MixRequest, {
            foreignKey: 'mix_request_id',
            as: 'mixRequest'
        });
        DepositAddress.hasOne(models.MonitoredAddress, {
            foreignKey: 'address',
            sourceKey: 'address',
            as: 'monitoredAddress'
        });
    };
    return DepositAddress;
};
//# sourceMappingURL=DepositAddress.js.map