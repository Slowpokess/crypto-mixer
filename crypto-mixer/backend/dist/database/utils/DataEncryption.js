"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataEncryptionManager = exports.SensitiveDataType = void 0;
const crypto = __importStar(require("crypto"));
const util_1 = require("util");
/**
 * Типы чувствительных данных для шифрования
 */
var SensitiveDataType;
(function (SensitiveDataType) {
    SensitiveDataType["IP_ADDRESS"] = "ip_address";
    SensitiveDataType["USER_METADATA"] = "user_metadata";
    SensitiveDataType["NOTES"] = "notes";
    SensitiveDataType["TRANSACTION_METADATA"] = "transaction_metadata";
    SensitiveDataType["SESSION_DATA"] = "session_data";
    SensitiveDataType["AUDIT_DETAILS"] = "audit_details";
    SensitiveDataType["ERROR_DETAILS"] = "error_details";
    SensitiveDataType["CUSTOM_DATA"] = "custom_data";
})(SensitiveDataType || (exports.SensitiveDataType = SensitiveDataType = {}));
/**
 * Менеджер шифрования чувствительных данных
 * Использует AES-256-GCM для authenticated encryption
 */
class DataEncryptionManager {
    constructor(config = {}) {
        this.keyCache = new Map();
        this.ALGORITHM = 'aes-256-gcm';
        this.KEY_LENGTH = 32; // 256 bits
        this.IV_LENGTH = 16; // 128 bits
        this.TAG_LENGTH = 16; // 128 bits
        this.SALT_LENGTH = 32; // 256 bits
        this.config = {
            masterKey: process.env.DATA_ENCRYPTION_KEY || this.generateSecureKey(),
            algorithm: 'aes-256-gcm',
            keyRotationInterval: parseInt(process.env.KEY_ROTATION_DAYS || '90'),
            compressionEnabled: process.env.DATA_COMPRESSION === 'true',
            integrityCheckEnabled: true,
            ...config
        };
        this.currentKeyVersion = this.generateKeyVersion();
        this.validateConfiguration();
    }
    /**
     * Шифрование чувствительных данных
     */
    async encryptSensitiveData(data, dataType, keyVersion) {
        try {
            // Валидация входных данных
            this.validateInput(data, dataType);
            const version = keyVersion || this.currentKeyVersion;
            const key = await this.getDerivedKey(version);
            // Подготавливаем данные для шифрования
            let plaintext = this.prepareDataForEncryption(data);
            // Сжатие (если включено)
            if (this.config.compressionEnabled && plaintext.length > 100) {
                plaintext = await this.compressData(plaintext);
            }
            // Генерируем случайный IV
            const iv = crypto.randomBytes(this.IV_LENGTH);
            // Создаем cipher
            const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
            // Шифруем данные
            const encrypted = Buffer.concat([
                cipher.update(plaintext, 'utf8'),
                cipher.final()
            ]);
            // Получаем authentication tag
            const tag = cipher.getAuthTag();
            // Вычисляем контрольную сумму оригинальных данных
            const checksum = this.calculateChecksum(data);
            const encryptedData = {
                encryptedValue: encrypted.toString('base64'),
                iv: iv.toString('base64'),
                tag: tag.toString('base64'),
                algorithm: this.ALGORITHM,
                keyVersion: version,
                dataType,
                createdAt: new Date(),
                metadata: {
                    originalLength: Buffer.byteLength(plaintext, 'utf8'),
                    checksum
                }
            };
            // Логируем операцию шифрования (без данных)
            console.log(`🔒 Encrypted ${dataType} data`, {
                keyVersion: version,
                dataLength: plaintext.length,
                compressed: this.config.compressionEnabled
            });
            return encryptedData;
        }
        catch (error) {
            console.error('❌ Encryption failed:', error);
            throw new Error(`Data encryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Расшифровка чувствительных данных
     */
    async decryptSensitiveData(encryptedData) {
        try {
            // Валидация зашифрованных данных
            this.validateEncryptedData(encryptedData);
            const key = await this.getDerivedKey(encryptedData.keyVersion);
            // Декодируем данные из base64
            const encrypted = Buffer.from(encryptedData.encryptedValue, 'base64');
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const tag = Buffer.from(encryptedData.tag, 'base64');
            // Создаем decipher
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(tag);
            // Расшифровываем данные
            let decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
            let plaintext = decrypted.toString('utf8');
            // Распаковка (если была сжата)
            if (this.config.compressionEnabled && encryptedData.metadata?.originalLength) {
                plaintext = await this.decompressData(plaintext);
            }
            // Парсим данные
            const result = this.parseDecryptedData(plaintext);
            // Проверяем целостность (если включено)
            if (this.config.integrityCheckEnabled && encryptedData.metadata?.checksum) {
                const currentChecksum = this.calculateChecksum(result);
                if (currentChecksum !== encryptedData.metadata.checksum) {
                    throw new Error('Data integrity check failed - checksum mismatch');
                }
            }
            // Логируем операцию расшифровки
            console.log(`🔓 Decrypted ${encryptedData.dataType} data`, {
                keyVersion: encryptedData.keyVersion,
                algorithm: encryptedData.algorithm
            });
            return result;
        }
        catch (error) {
            console.error('❌ Decryption failed:', error);
            throw new Error(`Data decryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Массовое шифрование данных
     */
    async encryptMultiple(dataItems) {
        const results = [];
        for (const item of dataItems) {
            try {
                const encrypted = await this.encryptSensitiveData(item.data, item.type);
                results.push({ id: item.id, encrypted });
            }
            catch (error) {
                console.error(`❌ Failed to encrypt item ${item.id}:`, error);
                throw error;
            }
        }
        return results;
    }
    /**
     * Массовое расшифровка данных
     */
    async decryptMultiple(encryptedItems) {
        const results = [];
        for (const item of encryptedItems) {
            try {
                const data = await this.decryptSensitiveData(item.encrypted);
                results.push({ id: item.id, data });
            }
            catch (error) {
                console.error(`❌ Failed to decrypt item ${item.id}:`, error);
                throw error;
            }
        }
        return results;
    }
    /**
     * Перешифровка данных с новым ключом
     */
    async reencryptData(encryptedData, newKeyVersion) {
        try {
            // Расшифровываем старые данные
            const decryptedData = await this.decryptSensitiveData(encryptedData);
            // Шифруем новым ключом
            const newEncryptedData = await this.encryptSensitiveData(decryptedData, encryptedData.dataType, newKeyVersion || this.currentKeyVersion);
            console.log(`🔄 Re-encrypted ${encryptedData.dataType} data`, {
                oldVersion: encryptedData.keyVersion,
                newVersion: newEncryptedData.keyVersion
            });
            return newEncryptedData;
        }
        catch (error) {
            console.error('❌ Re-encryption failed:', error);
            throw error;
        }
    }
    /**
     * Ротация ключей шифрования
     */
    async rotateEncryptionKeys() {
        try {
            const newKeyVersion = this.generateKeyVersion();
            // Генерируем новый производный ключ
            await this.getDerivedKey(newKeyVersion);
            this.currentKeyVersion = newKeyVersion;
            console.log(`🔑 Encryption key rotated`, {
                newVersion: newKeyVersion,
                timestamp: new Date().toISOString()
            });
            return newKeyVersion;
        }
        catch (error) {
            console.error('❌ Key rotation failed:', error);
            throw error;
        }
    }
    /**
     * Получение статистики шифрования
     */
    getEncryptionStats() {
        return {
            algorithm: this.config.algorithm,
            currentKeyVersion: this.currentKeyVersion,
            keyRotationInterval: this.config.keyRotationInterval,
            compressionEnabled: this.config.compressionEnabled,
            integrityCheckEnabled: this.config.integrityCheckEnabled,
            cachedKeys: this.keyCache.size
        };
    }
    // === Приватные методы ===
    /**
     * Валидация конфигурации шифрования
     */
    validateConfiguration() {
        if (!this.config.masterKey || this.config.masterKey.length < 32) {
            throw new Error('Master encryption key must be at least 32 characters long');
        }
        if (this.config.keyRotationInterval < 1 || this.config.keyRotationInterval > 365) {
            throw new Error('Key rotation interval must be between 1 and 365 days');
        }
        if (!crypto.constants || !crypto.getCiphers().includes(this.ALGORITHM)) {
            throw new Error(`Encryption algorithm ${this.ALGORITHM} is not supported`);
        }
    }
    /**
     * Валидация входных данных
     */
    validateInput(data, dataType) {
        if (data === null || data === undefined) {
            throw new Error('Data to encrypt cannot be null or undefined');
        }
        if (!Object.values(SensitiveDataType).includes(dataType)) {
            throw new Error(`Invalid data type: ${dataType}`);
        }
        // Проверяем размер данных
        const jsonString = JSON.stringify(data);
        if (jsonString.length > 1024 * 1024) { // 1MB лимит
            throw new Error('Data too large for encryption (max 1MB)');
        }
    }
    /**
     * Валидация зашифрованных данных
     */
    validateEncryptedData(encryptedData) {
        const required = ['encryptedValue', 'iv', 'tag', 'algorithm', 'keyVersion'];
        for (const field of required) {
            if (!encryptedData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        if (encryptedData.algorithm !== this.ALGORITHM) {
            throw new Error(`Unsupported algorithm: ${encryptedData.algorithm}`);
        }
    }
    /**
     * Генерация производного ключа
     */
    async getDerivedKey(keyVersion) {
        // Проверяем кэш
        if (this.keyCache.has(keyVersion)) {
            return this.keyCache.get(keyVersion);
        }
        // Генерируем salt на основе версии ключа
        const salt = crypto.createHash('sha256')
            .update(keyVersion + this.config.masterKey)
            .digest();
        // Используем PBKDF2 для деривации ключа
        const derivedKey = await (0, util_1.promisify)(crypto.pbkdf2)(this.config.masterKey, salt, 100000, // 100k итераций
        this.KEY_LENGTH, 'sha256');
        // Кэшируем ключ
        this.keyCache.set(keyVersion, derivedKey);
        // Ограничиваем размер кэша
        if (this.keyCache.size > 10) {
            const firstKey = this.keyCache.keys().next().value;
            if (firstKey !== undefined) {
                this.keyCache.delete(firstKey);
            }
        }
        return derivedKey;
    }
    /**
     * Генерация версии ключа
     */
    generateKeyVersion() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `v${timestamp}_${random}`;
    }
    /**
     * Генерация безопасного ключа
     */
    generateSecureKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    /**
     * Подготовка данных для шифрования
     */
    prepareDataForEncryption(data) {
        if (typeof data === 'string') {
            return data;
        }
        return JSON.stringify(data);
    }
    /**
     * Парсинг расшифрованных данных
     */
    parseDecryptedData(plaintext) {
        try {
            return JSON.parse(plaintext);
        }
        catch {
            // Если не JSON, возвращаем как строку
            return plaintext;
        }
    }
    /**
     * Вычисление контрольной суммы
     */
    calculateChecksum(data) {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('sha256').update(jsonString).digest('hex');
    }
    /**
     * Сжатие данных
     */
    async compressData(data) {
        const zlib = require('zlib');
        const compressed = await (0, util_1.promisify)(zlib.gzip)(Buffer.from(data, 'utf8'));
        return compressed.toString('base64');
    }
    /**
     * Распаковка данных
     */
    async decompressData(compressedData) {
        const zlib = require('zlib');
        const buffer = Buffer.from(compressedData, 'base64');
        const decompressed = await (0, util_1.promisify)(zlib.gunzip)(buffer);
        return decompressed.toString('utf8');
    }
    /**
     * Очистка кэша ключей
     */
    clearKeyCache() {
        this.keyCache.clear();
        console.log('🧹 Encryption key cache cleared');
    }
    /**
     * Проверка необходимости ротации ключей
     */
    isKeyRotationNeeded() {
        const keyAge = this.getKeyAge(this.currentKeyVersion);
        return keyAge > this.config.keyRotationInterval;
    }
    /**
     * Получение возраста ключа в днях
     */
    getKeyAge(keyVersion) {
        const match = keyVersion.match(/^v(\d+)_/);
        if (!match)
            return 0;
        const keyTimestamp = parseInt(match[1]);
        const ageMs = Date.now() - keyTimestamp;
        return ageMs / (1000 * 60 * 60 * 24); // конвертируем в дни
    }
}
exports.DataEncryptionManager = DataEncryptionManager;
exports.default = DataEncryptionManager;
//# sourceMappingURL=DataEncryption.js.map