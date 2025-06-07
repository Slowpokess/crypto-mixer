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
exports.HSMManager = void 0;
const logger_1 = require("../utils/logger");
const vault_manager_1 = require("./vault.manager");
const crypto_1 = __importDefault(require("crypto"));
const secp256k1 = __importStar(require("secp256k1"));
// PKCS#11 constants для реальных HSM
const CKM_SHA256_RSA_PKCS = 0x00000040;
const CKM_ECDSA_SHA256 = 0x00001042;
const CKU_USER = 1;
const CKF_RW_SESSION = 0x00000002;
const CKF_SERIAL_SESSION = 0x00000004;
/**
 * Гибридный менеджер HSM/Vault для управления криптографическими ключами
 *
 * В production использует настоящие HSM модули для критических операций,
 * а Vault для хранения и менее критических ключей.
 * В development режиме использует Vault как основное хранилище с программными ключами.
 */
class HSMManager {
    constructor(config) {
        this.pkcs11 = null;
        this.session = null;
        this.isInitialized = false;
        this.config = config;
        this.logger = new logger_1.Logger('HSMManager');
        // Инициализируем Vault Manager
        this.vaultManager = new vault_manager_1.VaultManager({
            endpoint: config.vaultEndpoint,
            token: config.vaultToken,
            strictSSL: config.strictSSL
        });
    }
    /**
     * Инициализация HSM и Vault
     * В production режиме инициализирует реальные HSM модули
     * В development режиме использует только Vault
     */
    async initialize() {
        try {
            this.logger.info('Инициализация HSM Manager...');
            // Всегда инициализируем Vault
            await this.vaultManager.initialize();
            this.logger.info('Vault Manager инициализирован');
            if (this.config.useRealHSM && process.env.NODE_ENV === 'production') {
                await this.initializeRealHSM();
            }
            else {
                this.logger.info('Используется Vault в качестве основного хранилища ключей');
                this.session = 1; // Mock session для совместимости
            }
            this.isInitialized = true;
            this.logger.info('HSM Manager успешно инициализирован');
        }
        catch (error) {
            this.logger.error('Ошибка инициализации HSM Manager:', error);
            throw new Error(`Не удалось инициализировать HSM: ${error.message}`);
        }
    }
    /**
     * Инициализация реального HSM модуля
     */
    async initializeRealHSM() {
        try {
            // Загружаем PKCS#11 библиотеку
            const { PKCS11 } = await Promise.resolve().then(() => __importStar(require('pkcs11js')));
            this.pkcs11 = new PKCS11();
            // Инициализируем PKCS#11
            this.pkcs11.C_Initialize();
            // Получаем список слотов
            const slots = this.pkcs11.C_GetSlotList(true);
            if (slots.length === 0) {
                throw new Error('HSM слоты не найдены');
            }
            // Открываем сессию с первым доступным слотом
            const slotId = slots[0];
            this.session = this.pkcs11.C_OpenSession(slotId, CKF_SERIAL_SESSION | CKF_RW_SESSION);
            // Аутентификация в HSM
            if (this.config.hsmPin) {
                this.pkcs11.C_Login(this.session, CKU_USER, this.config.hsmPin);
            }
            this.logger.info('Реальный HSM модуль инициализирован', { slotId });
        }
        catch (error) {
            this.logger.error('Ошибка инициализации реального HSM:', error);
            throw error;
        }
    }
    isConnected() {
        return this.isInitialized && this.session !== null;
    }
    /**
     * Генерация нового криптографического ключа
     * В зависимости от конфигурации использует HSM или генерирует программно и сохраняет в Vault
     */
    async generateKey(algorithm, currency, purpose = 'signing') {
        this.ensureInitialized();
        try {
            const keyId = this.generateKeyId(currency, algorithm);
            if (this.shouldUseHSM(purpose)) {
                return await this.generateKeyInHSM(keyId, algorithm, currency, purpose);
            }
            else {
                return await this.generateKeyInVault(keyId, algorithm, currency, purpose);
            }
        }
        catch (error) {
            this.logger.error('Ошибка генерации ключа:', error);
            throw new Error(`Не удалось сгенерировать ключ: ${error.message}`);
        }
    }
    /**
     * Генерация ключа в HSM (для критических операций)
     */
    async generateKeyInHSM(keyId, algorithm, currency, purpose) {
        if (!this.pkcs11 || !this.session) {
            throw new Error('HSM недоступен для генерации ключа');
        }
        try {
            let mechanism;
            let keyTemplate;
            switch (algorithm) {
                case 'secp256k1':
                    mechanism = { mechanism: CKM_ECDSA_SHA256 };
                    keyTemplate = this.getSecp256k1KeyTemplate(keyId);
                    break;
                case 'ed25519':
                    // Для Ed25519 используем специфичный механизм
                    mechanism = { mechanism: 0x00001057 }; // CKM_EC_EDWARDS_KEY_PAIR_GEN
                    keyTemplate = this.getEd25519KeyTemplate(keyId);
                    break;
                default:
                    throw new Error(`Неподдерживаемый алгоритм HSM: ${algorithm}`);
            }
            // Генерируем пару ключей в HSM
            const keyPair = this.pkcs11.C_GenerateKeyPair(this.session, mechanism, keyTemplate.publicKeyTemplate, keyTemplate.privateKeyTemplate);
            // Получаем публичный ключ
            const publicKey = await this.extractPublicKeyFromHSM(keyPair.publicKey);
            // Сохраняем референс на ключ в HSM в Vault для управления
            const metadata = {
                currency,
                algorithm,
                purpose,
                description: `HSM ключ для ${currency}`,
                rotationSchedule: purpose === 'master' ? '365d' : '90d'
            };
            await this.vaultManager.storePrivateKey(keyId, `hsm:${keyPair.privateKey}`, // Сохраняем HSM handle, а не сам ключ
            metadata);
            this.logger.info('Ключ сгенерирован в HSM', {
                keyId,
                algorithm,
                currency,
                purpose,
                hsmHandle: keyPair.privateKey
            });
            return {
                keyId,
                publicKey,
                isHSMKey: true,
                algorithm,
                createdAt: new Date().toISOString()
            };
        }
        catch (error) {
            this.logger.error('Ошибка генерации ключа в HSM:', error);
            throw error;
        }
    }
    /**
     * Генерация программного ключа и сохранение в Vault
     */
    async generateKeyInVault(keyId, algorithm, currency, purpose) {
        try {
            let privateKey;
            let publicKey;
            switch (algorithm) {
                case 'secp256k1':
                    ({ privateKey, publicKey } = this.generateSecp256k1Key());
                    break;
                case 'ed25519':
                    ({ privateKey, publicKey } = this.generateEd25519Key());
                    break;
                default:
                    throw new Error(`Неподдерживаемый алгоритм: ${algorithm}`);
            }
            // Сохраняем приватный ключ в Vault
            const metadata = {
                currency,
                algorithm,
                purpose,
                description: `Программный ключ для ${currency}`,
                rotationSchedule: purpose === 'master' ? '365d' : '90d'
            };
            await this.vaultManager.storePrivateKey(keyId, privateKey, metadata);
            this.logger.info('Ключ сгенерирован и сохранен в Vault', {
                keyId,
                algorithm,
                currency,
                purpose
            });
            return {
                keyId,
                publicKey,
                isHSMKey: false,
                algorithm,
                createdAt: new Date().toISOString()
            };
        }
        catch (error) {
            this.logger.error('Ошибка генерации ключа в Vault:', error);
            throw error;
        }
    }
    /**
     * Получение публичного ключа по ID
     */
    async getPublicKey(keyId, currency) {
        this.ensureInitialized();
        try {
            // Пытаемся получить метаданные ключа из Vault
            const keys = await this.vaultManager.listKeys(currency);
            const keyInfo = keys.find(k => k.keyId === keyId);
            if (!keyInfo) {
                throw new Error(`Ключ ${keyId} не найден`);
            }
            // Если это HSM ключ, получаем публичный ключ из HSM
            if (this.isHSMKey(keyId)) {
                return await this.getPublicKeyFromHSM(keyId);
            }
            else {
                // Для программных ключей вычисляем публичный ключ из приватного
                const privateKey = await this.vaultManager.retrievePrivateKey(keyId, currency);
                return this.derivePublicKey(privateKey, keyInfo.algorithm);
            }
        }
        catch (error) {
            this.logger.error('Ошибка получения публичного ключа:', error);
            throw new Error(`Не удалось получить публичный ключ: ${error.message}`);
        }
    }
    /**
     * Подпись данных с использованием указанного ключа
     */
    async sign(keyId, currency, data) {
        this.ensureInitialized();
        try {
            if (this.isHSMKey(keyId)) {
                return await this.signWithHSM(keyId, data);
            }
            else {
                return await this.signWithVaultKey(keyId, currency, data);
            }
        }
        catch (error) {
            this.logger.error('Ошибка подписи данных:', error);
            throw new Error(`Не удалось подписать данные: ${error.message}`);
        }
    }
    /**
     * Подпись данных с использованием HSM
     */
    async signWithHSM(keyId, data) {
        if (!this.pkcs11 || !this.session) {
            throw new Error('HSM недоступен для подписи');
        }
        try {
            // Извлекаем HSM handle из Vault
            const hsmHandle = await this.getHSMHandle(keyId);
            // Инициализируем подпись в HSM
            this.pkcs11.C_SignInit(this.session, { mechanism: CKM_ECDSA_SHA256 }, hsmHandle);
            // Выполняем подпись
            const signature = this.pkcs11.C_Sign(this.session, data);
            return signature.toString('hex');
        }
        catch (error) {
            this.logger.error('Ошибка подписи в HSM:', error);
            throw error;
        }
    }
    /**
     * Подпись данных с использованием ключа из Vault
     */
    async signWithVaultKey(keyId, currency, data) {
        try {
            const privateKey = await this.vaultManager.retrievePrivateKey(keyId, currency);
            const keys = await this.vaultManager.listKeys(currency);
            const keyInfo = keys.find(k => k.keyId === keyId);
            if (!keyInfo) {
                throw new Error(`Информация о ключе ${keyId} не найдена`);
            }
            switch (keyInfo.algorithm) {
                case 'secp256k1':
                    return this.signSecp256k1(privateKey, data);
                case 'ed25519':
                    return this.signEd25519(privateKey, data);
                default:
                    throw new Error(`Неподдерживаемый алгоритм для подписи: ${keyInfo.algorithm}`);
            }
        }
        catch (error) {
            this.logger.error('Ошибка подписи программным ключом:', error);
            throw error;
        }
    }
    /**
     * Ротация ключа
     */
    async rotateKey(keyId, currency) {
        this.ensureInitialized();
        try {
            // Получаем информацию о текущем ключе
            const keys = await this.vaultManager.listKeys(currency);
            const currentKey = keys.find(k => k.keyId === keyId);
            if (!currentKey) {
                throw new Error(`Ключ для ротации не найден: ${keyId}`);
            }
            // Генерируем новый ключ с теми же параметрами
            const newKey = await this.generateKey(currentKey.algorithm, currency, currentKey.purpose);
            // Архивируем старый ключ через Vault
            await this.vaultManager.rotateKey(keyId, currency);
            this.logger.info('Ключ успешно ротирован', {
                oldKeyId: keyId,
                newKeyId: newKey.keyId,
                currency
            });
            return newKey;
        }
        catch (error) {
            this.logger.error('Ошибка ротации ключа:', error);
            throw new Error(`Не удалось ротировать ключ: ${error.message}`);
        }
    }
    // Утилитарные методы
    generateKeyId(currency, algorithm) {
        const timestamp = Date.now();
        const random = crypto_1.default.randomBytes(4).toString('hex');
        return `${currency.toLowerCase()}-${algorithm}-${timestamp}-${random}`;
    }
    shouldUseHSM(purpose) {
        return this.config.useRealHSM &&
            process.env.NODE_ENV === 'production' &&
            (purpose === 'master' || purpose === 'signing');
    }
    isHSMKey(keyId) {
        return keyId.includes('hsm') || this.config.useRealHSM;
    }
    generateSecp256k1Key() {
        let privateKeyBytes;
        do {
            privateKeyBytes = crypto_1.default.randomBytes(32);
        } while (!secp256k1.privateKeyVerify(privateKeyBytes));
        const publicKeyBytes = secp256k1.publicKeyCreate(privateKeyBytes, false);
        return {
            privateKey: privateKeyBytes.toString('hex'),
            publicKey: publicKeyBytes.toString('hex')
        };
    }
    generateEd25519Key() {
        const privateKeyBytes = crypto_1.default.randomBytes(32);
        // Для Ed25519 используем криптографическую библиотеку
        // В реальной реализации здесь был бы tweetnacl или noble-ed25519
        const publicKeyBytes = crypto_1.default.createHash('sha256').update(privateKeyBytes).digest().slice(0, 32);
        return {
            privateKey: privateKeyBytes.toString('hex'),
            publicKey: publicKeyBytes.toString('hex')
        };
    }
    derivePublicKey(privateKey, algorithm) {
        switch (algorithm) {
            case 'secp256k1':
                const privKey = Buffer.from(privateKey, 'hex');
                const pubKey = secp256k1.publicKeyCreate(privKey, false);
                return pubKey.toString('hex');
            case 'ed25519':
                // Простая деривация для демонстрации
                return crypto_1.default.createHash('sha256').update(Buffer.from(privateKey, 'hex')).digest().toString('hex');
            default:
                throw new Error(`Неподдерживаемый алгоритм: ${algorithm}`);
        }
    }
    signSecp256k1(privateKey, data) {
        const privKeyBuffer = Buffer.from(privateKey, 'hex');
        const signature = secp256k1.ecdsaSign(data, privKeyBuffer);
        return signature.signature.toString('hex');
    }
    signEd25519(privateKey, data) {
        // Упрощенная подпись для демонстрации
        const hmac = crypto_1.default.createHmac('sha256', Buffer.from(privateKey, 'hex'));
        hmac.update(data);
        return hmac.digest('hex');
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('HSMManager не инициализирован. Вызовите initialize() сначала.');
        }
    }
    // HSM-специфичные методы (заглушки для реализации)
    getSecp256k1KeyTemplate(keyId) {
        return {
            publicKeyTemplate: [
                { type: 0x00000100, value: true }, // CKA_TOKEN
                { type: 0x00000001, value: true }, // CKA_PRIVATE
                { type: 0x00000081, value: keyId } // CKA_ID
            ],
            privateKeyTemplate: [
                { type: 0x00000100, value: true }, // CKA_TOKEN
                { type: 0x00000001, value: true }, // CKA_PRIVATE
                { type: 0x00000081, value: keyId } // CKA_ID
            ]
        };
    }
    getEd25519KeyTemplate(keyId) {
        // Аналогично secp256k1, но для Ed25519
        return this.getSecp256k1KeyTemplate(keyId);
    }
    async extractPublicKeyFromHSM(hsmHandle) {
        // Заглушка - в реальной реализации извлекаем публичный ключ из HSM
        return '04' + '0'.repeat(126);
    }
    async getPublicKeyFromHSM(keyId) {
        // Заглушка - получение публичного ключа из HSM по ID
        return '04' + '0'.repeat(126);
    }
    async getHSMHandle(keyId) {
        // Заглушка - получение HSM handle по keyId
        return 1;
    }
    /**
     * Закрытие соединений
     */
    async close() {
        try {
            // Закрываем HSM соединение
            if (this.session && this.pkcs11) {
                this.pkcs11.C_Logout(this.session);
                this.pkcs11.C_CloseSession(this.session);
                this.pkcs11.C_Finalize();
            }
            // Закрываем Vault соединение
            await this.vaultManager.close();
            this.session = null;
            this.pkcs11 = null;
            this.isInitialized = false;
            this.logger.info('HSM Manager соединения закрыты');
        }
        catch (error) {
            this.logger.error('Ошибка закрытия HSM Manager:', error);
        }
    }
}
exports.HSMManager = HSMManager;
//# sourceMappingURL=hsm.manager.js.map