"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptedModelBase = void 0;
exports.createEncryptedModel = createEncryptedModel;
const sequelize_1 = require("sequelize");
const DataEncryption_1 = require("./DataEncryption");
/**
 * Базовый класс для моделей с поддержкой шифрования чувствительных данных
 */
class EncryptedModelBase extends sequelize_1.Model {
    /**
     * Инициализация менеджера шифрования
     */
    static initializeEncryption(encryptionManager) {
        if (!this.encryptionManager) {
            this.encryptionManager = encryptionManager || new DataEncryption_1.DataEncryptionManager();
        }
    }
    /**
     * Получение менеджера шифрования
     */
    static getEncryptionManager() {
        if (!this.encryptionManager) {
            this.initializeEncryption();
        }
        return this.encryptionManager;
    }
    /**
     * Определение шифруемых полей в модели
     */
    static defineEncryptedFields(fields) {
        this.encryptedFields = fields;
    }
    /**
     * Получение метаданных шифруемых полей
     */
    static getEncryptedFields() {
        return this.encryptedFields;
    }
    /**
     * Создание Sequelize атрибутов для шифруемых полей
     */
    static createEncryptedAttributes() {
        const attributes = {};
        Object.entries(this.encryptedFields).forEach(([fieldName, config]) => {
            // Создаем поле для зашифрованных данных
            attributes[`${fieldName}_encrypted`] = {
                type: sequelize_1.DataTypes.JSONB,
                allowNull: config.nullable !== false,
                comment: `Encrypted ${fieldName} data`
            };
            // Создаем виртуальное поле для удобного доступа
            attributes[fieldName] = {
                type: sequelize_1.DataTypes.VIRTUAL,
                get() {
                    return this.getDecryptedField(fieldName);
                },
                set(value) {
                    this.setEncryptedField(fieldName, value);
                }
            };
        });
        return attributes;
    }
    /**
     * Настройка хуков модели для автоматического шифрования/расшифровки
     */
    static setupEncryptionHooks() {
        // Хук перед сохранением - шифруем данные
        this.addHook('beforeSave', async (instance) => {
            await instance.encryptSensitiveFields();
        });
        // Хук после загрузки - расшифровываем данные (если настроено)
        this.addHook('afterFind', async (instances) => {
            if (!instances)
                return;
            const models = Array.isArray(instances) ? instances : [instances];
            for (const instance of models) {
                if (instance instanceof this) {
                    await instance.decryptSensitiveFields();
                }
            }
        });
    }
    /**
     * Шифрование отдельного поля
     */
    async encryptField(fieldName, value) {
        const config = this.constructor.encryptedFields[fieldName];
        if (!config) {
            throw new Error(`Field ${fieldName} is not configured for encryption`);
        }
        const encryptionManager = this.constructor.getEncryptionManager();
        return await encryptionManager.encryptSensitiveData(value, config.dataType);
    }
    /**
     * Расшифровка отдельного поля
     */
    async decryptField(fieldName) {
        const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
        if (!encryptedData) {
            return null;
        }
        const encryptionManager = this.constructor.getEncryptionManager();
        return await encryptionManager.decryptSensitiveData(encryptedData);
    }
    /**
     * Установка зашифрованного поля
     */
    async setEncryptedField(fieldName, value) {
        if (value === null || value === undefined) {
            this.setDataValue(`${fieldName}_encrypted`, null);
            return;
        }
        const encryptedData = await this.encryptField(fieldName, value);
        this.setDataValue(`${fieldName}_encrypted`, encryptedData);
    }
    /**
     * Получение расшифрованного поля
     */
    getDecryptedField(fieldName) {
        // Проверяем кэш расшифрованных данных
        const cacheKey = `_decrypted_${fieldName}`;
        if (this.dataValues[cacheKey] !== undefined) {
            return this.dataValues[cacheKey];
        }
        // Если данных нет в кэше, возвращаем null
        // Расшифровка произойдет асинхронно через decryptSensitiveFields()
        return null;
    }
    /**
     * Шифрование всех чувствительных полей перед сохранением
     */
    async encryptSensitiveFields() {
        const encryptedFields = this.constructor.encryptedFields;
        for (const [fieldName, config] of Object.entries(encryptedFields)) {
            if (config.autoEncrypt !== false) {
                const value = this.dataValues[fieldName];
                if (value !== undefined) {
                    await this.setEncryptedField(fieldName, value);
                    // Очищаем виртуальное поле
                    delete this.dataValues[fieldName];
                }
            }
        }
    }
    /**
     * Расшифровка всех чувствительных полей после загрузки
     */
    async decryptSensitiveFields() {
        const encryptedFields = this.constructor.encryptedFields;
        for (const [fieldName, config] of Object.entries(encryptedFields)) {
            if (config.autoDecrypt !== false) {
                try {
                    const decryptedValue = await this.decryptField(fieldName);
                    // Кэшируем расшифрованное значение
                    this.dataValues[`_decrypted_${fieldName}`] = decryptedValue;
                }
                catch (error) {
                    console.error(`❌ Failed to decrypt field ${fieldName}:`, error);
                    // Продолжаем выполнение, но поле остается null
                }
            }
        }
    }
    /**
     * Принудительная расшифровка поля (синхронно возвращает Promise)
     */
    async getDecryptedFieldAsync(fieldName) {
        const cacheKey = `_decrypted_${fieldName}`;
        // Проверяем кэш
        if (this.dataValues[cacheKey] !== undefined) {
            return this.dataValues[cacheKey];
        }
        // Расшифровываем и кэшируем
        const decryptedValue = await this.decryptField(fieldName);
        this.dataValues[cacheKey] = decryptedValue;
        return decryptedValue;
    }
    /**
     * Обновление зашифрованного поля
     */
    async updateEncryptedField(fieldName, newValue) {
        await this.setEncryptedField(fieldName, newValue);
        // Обновляем кэш
        const cacheKey = `_decrypted_${fieldName}`;
        this.dataValues[cacheKey] = newValue;
        // Сохраняем изменения
        await this.save();
    }
    /**
     * Перешифровка всех полей с новым ключом
     */
    async reencryptAllFields(newKeyVersion) {
        const encryptedFields = this.constructor.encryptedFields;
        const encryptionManager = this.constructor.getEncryptionManager();
        for (const fieldName of Object.keys(encryptedFields)) {
            const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
            if (encryptedData) {
                try {
                    const reencryptedData = await encryptionManager.reencryptData(encryptedData, newKeyVersion);
                    this.setDataValue(`${fieldName}_encrypted`, reencryptedData);
                    // Очищаем кэш
                    delete this.dataValues[`_decrypted_${fieldName}`];
                }
                catch (error) {
                    console.error(`❌ Failed to re-encrypt field ${fieldName}:`, error);
                    throw error;
                }
            }
        }
        await this.save();
    }
    /**
     * Получение статистики шифрования для экземпляра
     */
    getEncryptionStats() {
        const encryptedFields = this.constructor.encryptedFields;
        const fieldNames = Object.keys(encryptedFields);
        let encryptedCount = 0;
        const keyVersions = [];
        let lastEncrypted;
        for (const fieldName of fieldNames) {
            const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
            if (encryptedData) {
                encryptedCount++;
                if (encryptedData.keyVersion) {
                    keyVersions.push(encryptedData.keyVersion);
                }
                if (encryptedData.createdAt && (!lastEncrypted || encryptedData.createdAt > lastEncrypted)) {
                    lastEncrypted = encryptedData.createdAt;
                }
            }
        }
        return {
            totalFields: fieldNames.length,
            encryptedFields: encryptedCount,
            keyVersions: [...new Set(keyVersions)],
            lastEncrypted
        };
    }
    /**
     * Проверка необходимости перешифровки
     */
    needsReencryption() {
        const encryptedFields = this.constructor.encryptedFields;
        const encryptionManager = this.constructor.getEncryptionManager();
        const currentKeyVersion = encryptionManager.getEncryptionStats().currentKeyVersion;
        for (const fieldName of Object.keys(encryptedFields)) {
            const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
            if (encryptedData && encryptedData.keyVersion !== currentKeyVersion) {
                return true;
            }
        }
        return false;
    }
    /**
     * Экспорт зашифрованных данных (для резервного копирования)
     */
    exportEncryptedData() {
        const encryptedFields = this.constructor.encryptedFields;
        const exported = {};
        for (const fieldName of Object.keys(encryptedFields)) {
            const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
            if (encryptedData) {
                exported[fieldName] = encryptedData;
            }
        }
        return exported;
    }
    /**
     * Импорт зашифрованных данных (для восстановления)
     */
    importEncryptedData(encryptedData) {
        for (const [fieldName, data] of Object.entries(encryptedData)) {
            this.setDataValue(`${fieldName}_encrypted`, data);
            // Очищаем кэш
            delete this.dataValues[`_decrypted_${fieldName}`];
        }
    }
}
exports.EncryptedModelBase = EncryptedModelBase;
// Метаданные шифруемых полей (определяются в наследуемых классах)
EncryptedModelBase.encryptedFields = {};
/**
 * Хелпер функция для создания модели с поддержкой шифрования
 */
function createEncryptedModel(BaseModel, encryptedFields, encryptionManager) {
    // Наследуем от EncryptedModelBase
    class EncryptedModel extends EncryptedModelBase {
    }
    // Настраиваем шифрование
    EncryptedModel.initializeEncryption(encryptionManager);
    EncryptedModel.defineEncryptedFields(encryptedFields);
    return EncryptedModel;
}
exports.default = EncryptedModelBase;
//# sourceMappingURL=EncryptedModelBase.js.map