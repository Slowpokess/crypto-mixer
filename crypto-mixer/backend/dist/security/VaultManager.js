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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultManager = void 0;
// Полноценная реализация Vault Manager для продакшн-управления секретами
const crypto_1 = __importDefault(require("crypto"));
const vault = __importStar(require("node-vault"));
const logger_1 = __importDefault(require("../utils/logger"));
class VaultManager {
    constructor(config) {
        this.vaultClient = null;
        this.initialized = false;
        this.secretCache = new Map();
        this.keyCache = new Map();
        this.cacheTimeout = 300000; // 5 минут
        this.config = {
            requestTimeout: 10000,
            retryOptions: {
                retries: 3,
                factor: 2,
                minTimeout: 1000,
                maxTimeout: 5000
            },
            ...config
        };
    }
    async initialize() {
        try {
            if (!this.config.enabled) {
                logger_1.default.info('Vault отключен в конфигурации');
                this.initialized = true;
                return;
            }
            if (!this.config.endpoint || !this.config.token) {
                throw new Error('Vault endpoint и token обязательны для инициализации');
            }
            // Настройка клиента Vault
            const vaultOptions = {
                apiVersion: 'v1',
                endpoint: this.config.endpoint,
                token: this.config.token,
                requestTimeout: this.config.requestTimeout
            };
            if (this.config.namespace) {
                vaultOptions.namespace = this.config.namespace;
            }
            // SSL конфигурация для продакшна
            if (this.config.caPath || this.config.keyPath || this.config.certPath) {
                vaultOptions.mustSecure = true;
                if (this.config.caPath)
                    vaultOptions.ca = this.config.caPath;
                if (this.config.keyPath)
                    vaultOptions.key = this.config.keyPath;
                if (this.config.certPath)
                    vaultOptions.cert = this.config.certPath;
            }
            this.vaultClient = vault.default(vaultOptions);
            // Проверка подключения
            await this.healthCheck();
            // Настройка движков секретов если они не существуют
            await this.setupSecretEngines();
            this.initialized = true;
            logger_1.default.info('Vault Manager успешно инициализирован', {
                endpoint: this.config.endpoint,
                namespace: this.config.namespace
            });
        }
        catch (error) {
            logger_1.default.error('Ошибка инициализации Vault Manager', error);
            throw error;
        }
    }
    async healthCheck() {
        try {
            const health = await this.vaultClient.health();
            if (!health.sealed) {
                logger_1.default.info('Vault доступен и распечатан');
            }
            else {
                throw new Error('Vault запечатан');
            }
        }
        catch (error) {
            logger_1.default.error('Ошибка проверки здоровья Vault', error);
            throw error;
        }
    }
    async setupSecretEngines() {
        try {
            // Настройка KV v2 движка для секретов
            await this.ensureSecretEngine('kv-v2', 'mixer-secrets');
            // Настройка Transit движка для шифрования
            await this.ensureSecretEngine('transit', 'mixer-transit');
            // Настройка PKI движка для сертификатов
            await this.ensureSecretEngine('pki', 'mixer-pki');
            logger_1.default.info('Движки секретов настроены');
        }
        catch (error) {
            logger_1.default.error('Ошибка настройки движков секретов', error);
            // Не прерываем инициализацию, возможно движки уже настроены
        }
    }
    async ensureSecretEngine(type, path) {
        try {
            await this.vaultClient.mounts();
            // Проверяем существует ли движок
            const mounts = await this.vaultClient.mounts();
            if (!mounts[`${path}/`]) {
                await this.vaultClient.mount({
                    mount_point: path,
                    type: type,
                    config: {
                        max_lease_ttl: '87600h', // 10 лет
                        default_lease_ttl: '8760h' // 1 год
                    }
                });
                logger_1.default.info(`Создан движок секретов: ${type} в ${path}`);
            }
        }
        catch (error) {
            // Движок уже может существовать
            logger_1.default.debug(`Движок ${path} уже существует или нет прав на создание`);
        }
    }
    async storeSecret(path, secret, metadata) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const fullPath = `mixer-secrets/data/${path}`;
            await this.vaultClient.write(fullPath, {
                data: secret,
                metadata: metadata || {}
            });
            // Кэшируем секрет
            this.cacheSecret(path, {
                key: path,
                value: JSON.stringify(secret),
                metadata
            });
            logger_1.default.info('Секрет успешно сохранен', { path });
        }
        catch (error) {
            logger_1.default.error('Ошибка сохранения секрета', error, { path });
            throw error;
        }
    }
    async getSecret(path) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        // Проверяем кэш
        const cached = this.getCachedSecret(path);
        if (cached) {
            return cached;
        }
        try {
            const fullPath = `mixer-secrets/data/${path}`;
            const response = await this.vaultClient.read(fullPath);
            if (!response || !response.data) {
                return null;
            }
            const secret = {
                key: path,
                value: JSON.stringify(response.data.data),
                version: response.data.metadata?.version,
                metadata: response.data.metadata,
                leaseId: response.lease_id,
                leaseDuration: response.lease_duration,
                renewable: response.renewable
            };
            // Кэшируем
            this.cacheSecret(path, secret);
            return secret;
        }
        catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            logger_1.default.error('Ошибка получения секрета', error, { path });
            throw error;
        }
    }
    async generateCryptoKey(keyName, algorithm = 'aes256-gcm96') {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        // Проверяем кэш
        const cached = this.getCachedKey(keyName);
        if (cached) {
            return cached;
        }
        try {
            // Создаем ключ в Transit движке
            await this.vaultClient.write(`mixer-transit/keys/${keyName}`, {
                type: algorithm,
                exportable: false, // Ключи не экспортируются для безопасности
                allow_plaintext_backup: false,
                derived: false
            });
            // Получаем информацию о ключе
            const keyInfo = await this.vaultClient.read(`mixer-transit/keys/${keyName}`);
            const keyResult = {
                keyId: keyName,
                publicKey: keyInfo.data.keys['1']?.public_key || '',
                algorithm,
                usage: ['encrypt', 'decrypt', 'sign', 'verify']
            };
            // Кэшируем
            this.cacheKey(keyName, keyResult);
            logger_1.default.info('Криптографический ключ создан', { keyName, algorithm });
            return keyResult;
        }
        catch (error) {
            logger_1.default.error('Ошибка создания криптографического ключа', error, { keyName });
            throw error;
        }
    }
    async encryptData(keyName, plaintext) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const base64Data = Buffer.from(plaintext).toString('base64');
            const response = await this.vaultClient.write(`mixer-transit/encrypt/${keyName}`, {
                plaintext: base64Data
            });
            return response.data.ciphertext;
        }
        catch (error) {
            logger_1.default.error('Ошибка шифрования данных', error, { keyName });
            throw error;
        }
    }
    async decryptData(keyName, ciphertext) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const response = await this.vaultClient.write(`mixer-transit/decrypt/${keyName}`, {
                ciphertext
            });
            const decryptedBase64 = response.data.plaintext;
            return Buffer.from(decryptedBase64, 'base64').toString();
        }
        catch (error) {
            logger_1.default.error('Ошибка расшифровки данных', error, { keyName });
            throw error;
        }
    }
    async signData(keyName, data) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const hashedData = crypto_1.default.createHash('sha256').update(data).digest('base64');
            const response = await this.vaultClient.write(`mixer-transit/sign/${keyName}`, {
                input: hashedData,
                hash_algorithm: 'sha2-256'
            });
            return response.data.signature;
        }
        catch (error) {
            logger_1.default.error('Ошибка подписи данных', error, { keyName });
            throw error;
        }
    }
    async verifySignature(keyName, data, signature) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const hashedData = crypto_1.default.createHash('sha256').update(data).digest('base64');
            const response = await this.vaultClient.write(`mixer-transit/verify/${keyName}`, {
                input: hashedData,
                signature,
                hash_algorithm: 'sha2-256'
            });
            return response.data.valid === true;
        }
        catch (error) {
            logger_1.default.error('Ошибка проверки подписи', error, { keyName });
            return false;
        }
    }
    async rotateKey(keyName) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            await this.vaultClient.write(`mixer-transit/keys/${keyName}/rotate`);
            // Очищаем кэш для этого ключа
            this.keyCache.delete(keyName);
            logger_1.default.info('Ключ успешно ротирован', { keyName });
        }
        catch (error) {
            logger_1.default.error('Ошибка ротации ключа', error, { keyName });
            throw error;
        }
    }
    async deleteSecret(path) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            const fullPath = `mixer-secrets/metadata/${path}`;
            await this.vaultClient.delete(fullPath);
            // Удаляем из кэша
            this.secretCache.delete(path);
            logger_1.default.info('Секрет удален', { path });
        }
        catch (error) {
            logger_1.default.error('Ошибка удаления секрета', error, { path });
            throw error;
        }
    }
    cacheSecret(path, secret) {
        this.secretCache.set(path, {
            ...secret,
            metadata: {
                ...secret.metadata,
                cachedAt: Date.now()
            }
        });
        // Автоочистка кэша
        setTimeout(() => {
            this.secretCache.delete(path);
        }, this.cacheTimeout);
    }
    getCachedSecret(path) {
        const cached = this.secretCache.get(path);
        if (!cached)
            return null;
        const cachedAt = cached.metadata?.cachedAt || 0;
        if (Date.now() - cachedAt > this.cacheTimeout) {
            this.secretCache.delete(path);
            return null;
        }
        return cached;
    }
    cacheKey(keyName, keyResult) {
        this.keyCache.set(keyName, keyResult);
        // Автоочистка кэша ключей (дольше чем секреты)
        setTimeout(() => {
            this.keyCache.delete(keyName);
        }, this.cacheTimeout * 2);
    }
    getCachedKey(keyName) {
        return this.keyCache.get(keyName) || null;
    }
    async renewLease(leaseId) {
        if (!this.initialized) {
            throw new Error('Vault Manager не инициализирован');
        }
        try {
            await this.vaultClient.write('sys/leases/renew', {
                lease_id: leaseId,
                increment: 3600 // Продлеваем на час
            });
            logger_1.default.info('Lease успешно продлен', { leaseId });
        }
        catch (error) {
            logger_1.default.error('Ошибка продления lease', error, { leaseId });
            throw error;
        }
    }
    async shutdown() {
        // Очищаем кэши
        this.secretCache.clear();
        this.keyCache.clear();
        this.initialized = false;
        logger_1.default.info('Vault Manager завершил работу');
    }
    isInitialized() {
        return this.initialized;
    }
    isEnabled() {
        return this.config.enabled;
    }
    getStats() {
        return {
            initialized: this.initialized,
            cachedSecrets: this.secretCache.size,
            cachedKeys: this.keyCache.size,
            enabled: this.config.enabled
        };
    }
}
exports.VaultManager = VaultManager;
//# sourceMappingURL=VaultManager.js.map