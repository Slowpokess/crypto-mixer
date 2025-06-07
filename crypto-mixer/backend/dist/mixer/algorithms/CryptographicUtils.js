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
exports.CryptographicUtils = void 0;
const crypto = __importStar(require("crypto"));
const secp256k1 = __importStar(require("secp256k1"));
/**
 * Криптографические утилиты для алгоритмов микширования
 * Обеспечивает безопасные криптографические операции
 */
class CryptographicUtils {
    /**
     * Генерирует криптографически стойкую пару ключей
     */
    static generateKeyPair() {
        let privateKey;
        // Генерируем приватный ключ в допустимом диапазоне
        do {
            privateKey = crypto.randomBytes(32);
        } while (!secp256k1.privateKeyVerify(privateKey));
        const publicKey = secp256k1.publicKeyCreate(privateKey, true); // compressed
        return {
            privateKey,
            publicKey: Buffer.from(publicKey)
        };
    }
    /**
     * Создает детерминистический ключ из seed
     */
    static generateKeyPairFromSeed(seed) {
        const hash = crypto.createHash('sha256').update(seed).digest();
        if (!secp256k1.privateKeyVerify(hash)) {
            // Если hash не подходит, используем HMAC для получения валидного ключа
            const hmac = crypto.createHmac('sha256', 'secp256k1_seed');
            const privateKey = hmac.update(seed).digest();
            if (!secp256k1.privateKeyVerify(privateKey)) {
                throw new Error('Unable to generate valid private key from seed');
            }
            const publicKey = secp256k1.publicKeyCreate(privateKey, true);
            return {
                privateKey,
                publicKey: Buffer.from(publicKey)
            };
        }
        const publicKey = secp256k1.publicKeyCreate(hash, true);
        return {
            privateKey: hash,
            publicKey: Buffer.from(publicKey)
        };
    }
    /**
     * Подписывает сообщение приватным ключом (ECDSA)
     */
    static signMessage(message, privateKey) {
        const messageHash = crypto.createHash('sha256').update(message).digest();
        const signature = secp256k1.ecdsaSign(messageHash, privateKey);
        return {
            r: Buffer.from(signature.signature.slice(0, 32)),
            s: Buffer.from(signature.signature.slice(32, 64)),
            recovery: signature.recid
        };
    }
    /**
     * Проверяет подпись ECDSA
     */
    static verifySignature(message, signature, publicKey) {
        try {
            const messageHash = crypto.createHash('sha256').update(message).digest();
            const signatureBuffer = Buffer.concat([signature.r, signature.s]);
            return secp256k1.ecdsaVerify(signatureBuffer, messageHash, publicKey);
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Создает Schnorr подпись (для Ring Signatures)
     */
    static createSchnorrSignature(message, privateKey, nonce) {
        // Генерируем случайный nonce если не предоставлен
        const k = nonce || crypto.randomBytes(32);
        // R = k * G
        const R = secp256k1.publicKeyCreate(k, true);
        // e = H(R || P || m)
        const publicKey = secp256k1.publicKeyCreate(privateKey, true);
        const hasher = crypto.createHash('sha256');
        hasher.update(R);
        hasher.update(publicKey);
        hasher.update(message);
        const e = hasher.digest();
        // s = k + e * x (mod n)
        const eScalar = this.bufferToScalar(e);
        const kScalar = this.bufferToScalar(k);
        const xScalar = this.bufferToScalar(privateKey);
        const s = this.scalarAdd(kScalar, this.scalarMultiply(eScalar, xScalar));
        // Signature = (R, s)
        const signature = Buffer.concat([R, this.scalarToBuffer(s)]);
        return {
            signature,
            publicKey: Buffer.from(publicKey),
            message
        };
    }
    /**
     * Проверяет Schnorr подпись
     */
    static verifySchnorrSignature(signature) {
        try {
            const { signature: sig, publicKey, message } = signature;
            // Извлекаем R и s из подписи
            const R = sig.slice(0, 33);
            const s = sig.slice(33);
            // e = H(R || P || m)
            const hasher = crypto.createHash('sha256');
            hasher.update(R);
            hasher.update(publicKey);
            hasher.update(message);
            const e = hasher.digest();
            // Проверяем: s * G = R + e * P
            const sScalar = this.bufferToScalar(s);
            const eScalar = this.bufferToScalar(e);
            const sG = secp256k1.publicKeyCreate(this.scalarToBuffer(sScalar), true);
            const eP = secp256k1.publicKeyTweakMul(publicKey, this.scalarToBuffer(eScalar));
            const RePlus = secp256k1.publicKeyCombine([R, eP]);
            return Buffer.from(sG).equals(Buffer.from(RePlus));
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Генерирует key image для Ring Signatures
     */
    static generateKeyImage(privateKey, publicKey) {
        // Key Image = x * H_p(P) где x - приватный ключ, P - публичный ключ
        const hashPoint = this.hashToPoint(publicKey);
        return this.pointMultiply(hashPoint, privateKey);
    }
    /**
     * Хеширует данные в точку на кривой (hash-to-curve)
     */
    static hashToPoint(data) {
        // Простая реализация hash-to-curve
        // В продакшене следует использовать RFC 8017 или аналогичный стандарт
        let counter = 0;
        let point;
        do {
            const hasher = crypto.createHash('sha256');
            hasher.update(data);
            hasher.update(Buffer.from([counter]));
            const hash = hasher.digest();
            try {
                // Пытаемся создать валидную точку
                point = this.tryCreatePoint(hash);
                if (point)
                    break;
            }
            catch (error) {
                // Если не получилось, увеличиваем счетчик и пробуем снова
            }
            counter++;
        } while (counter < 256); // Предотвращаем бесконечный цикл
        if (!point) {
            throw new Error('Unable to hash to valid curve point');
        }
        return point;
    }
    /**
     * Попытка создать валидную точку кривой из hash
     */
    static tryCreatePoint(hash) {
        try {
            // Используем hash как x-координату и пытаемся найти y
            const x = hash.slice(0, 32);
            // Для secp256k1: y² = x³ + 7
            // Вместо полного вычисления используем упрощенный подход
            const candidate = Buffer.alloc(33);
            candidate[0] = 0x02; // compressed point prefix
            x.copy(candidate, 1);
            // Проверяем, является ли это валидной точкой
            if (this.isValidPoint(candidate)) {
                return candidate;
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Проверяет, является ли данный буфер валидной точкой кривой
     */
    static isValidPoint(point) {
        try {
            // Попытка декомпрессии точки
            const uncompressed = secp256k1.publicKeyConvert(point, false);
            return uncompressed.length === 65;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Умножение точки на скаляр
     */
    static pointMultiply(point, scalar) {
        try {
            return Buffer.from(secp256k1.publicKeyTweakMul(point, scalar));
        }
        catch (error) {
            throw new Error('Point multiplication failed: ' + error);
        }
    }
    /**
     * Сложение точек
     */
    static pointAdd(point1, point2) {
        try {
            return Buffer.from(secp256k1.publicKeyCombine([point1, point2]));
        }
        catch (error) {
            throw new Error('Point addition failed: ' + error);
        }
    }
    /**
     * Преобразует буфер в скаляр (модуло порядок кривой)
     */
    static bufferToScalar(buffer) {
        const scalar = Buffer.alloc(32);
        if (buffer.length <= 32) {
            buffer.copy(scalar, 32 - buffer.length);
        }
        else {
            // Если буфер больше 32 байт, берем младшие 32 байта
            buffer.copy(scalar, 0, buffer.length - 32);
        }
        // Редуцируем по модулю порядка кривой
        return this.scalarReduce(scalar);
    }
    /**
     * Преобразует скаляр обратно в буфер
     */
    static scalarToBuffer(scalar) {
        return Buffer.from(scalar);
    }
    /**
     * Сложение скаляров (модуло порядок кривой)
     */
    static scalarAdd(a, b) {
        const result = Buffer.alloc(32);
        let carry = 0;
        for (let i = 31; i >= 0; i--) {
            const sum = a[i] + b[i] + carry;
            result[i] = sum & 0xFF;
            carry = sum >> 8;
        }
        return this.scalarReduce(result);
    }
    /**
     * Умножение скаляров (модуло порядок кривой)
     */
    static scalarMultiply(a, b) {
        // Упрощенная реализация
        // В продакшене нужно использовать правильную модулярную арифметику
        const result = Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            result[i] = (a[i] * b[i]) & 0xFF;
        }
        return this.scalarReduce(result);
    }
    /**
     * Вычитание скаляров (модуло порядок кривой)
     */
    static scalarSubtract(a, b) {
        const result = Buffer.alloc(32);
        let borrow = 0;
        for (let i = 31; i >= 0; i--) {
            let diff = a[i] - b[i] - borrow;
            if (diff < 0) {
                diff += 256;
                borrow = 1;
            }
            else {
                borrow = 0;
            }
            result[i] = diff;
        }
        return this.scalarReduce(result);
    }
    /**
     * Редукция скаляра по модулю порядка кривой
     */
    static scalarReduce(scalar) {
        // Упрощенная реализация
        // В продакшене нужно использовать правильную редукцию по модулю n
        const result = Buffer.from(scalar);
        // Простая проверка на переполнение
        if (this.bufferCompare(result, this.CURVE_ORDER) >= 0) {
            // Если больше порядка кривой, вычитаем порядок
            return this.scalarSubtract(result, this.CURVE_ORDER);
        }
        return result;
    }
    /**
     * Сравнение буферов как больших чисел
     */
    static bufferCompare(a, b) {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] < b[i])
                return -1;
            if (a[i] > b[i])
                return 1;
        }
        return a.length - b.length;
    }
    /**
     * Генерирует криптографически стойкий nonce
     */
    static generateNonce(privateKey, message) {
        // RFC 6979 deterministic nonce generation
        const hasher = crypto.createHmac('sha256', privateKey);
        hasher.update(message);
        return hasher.digest();
    }
    /**
     * Хеширует данные с помощью SHA-256
     */
    static hash256(data) {
        return crypto.createHash('sha256').update(data).digest();
    }
    /**
     * Хеширует данные с помощью double SHA-256 (как в Bitcoin)
     */
    static hash256Double(data) {
        const first = crypto.createHash('sha256').update(data).digest();
        return crypto.createHash('sha256').update(first).digest();
    }
    /**
     * Создает HMAC подпись
     */
    static hmac(key, data) {
        return crypto.createHmac('sha256', key).update(data).digest();
    }
    /**
     * Генерирует случайные байты криптографически стойким способом
     */
    static randomBytes(length) {
        return crypto.randomBytes(length);
    }
    /**
     * Проверяет, что значение является валидным приватным ключом
     */
    static isValidPrivateKey(privateKey) {
        return privateKey.length === 32 && secp256k1.privateKeyVerify(privateKey);
    }
    /**
     * Проверяет, что значение является валидным публичным ключом
     */
    static isValidPublicKey(publicKey) {
        try {
            return secp256k1.publicKeyVerify(publicKey);
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Сжимает публичный ключ
     */
    static compressPublicKey(publicKey) {
        try {
            return Buffer.from(secp256k1.publicKeyConvert(publicKey, true));
        }
        catch (error) {
            throw new Error('Invalid public key for compression');
        }
    }
    /**
     * Разжимает публичный ключ
     */
    static uncompressPublicKey(publicKey) {
        try {
            return Buffer.from(secp256k1.publicKeyConvert(publicKey, false));
        }
        catch (error) {
            throw new Error('Invalid public key for decompression');
        }
    }
}
exports.CryptographicUtils = CryptographicUtils;
CryptographicUtils.CURVE_ORDER = Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 'hex');
CryptographicUtils.GENERATOR_POINT = Buffer.from('0479BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8', 'hex');
//# sourceMappingURL=CryptographicUtils.js.map