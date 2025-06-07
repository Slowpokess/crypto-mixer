export interface EllipticCurvePoint {
    x: Buffer;
    y: Buffer;
    compressed?: boolean;
}
export interface KeyPair {
    privateKey: Buffer;
    publicKey: Buffer;
}
export interface Signature {
    r: Buffer;
    s: Buffer;
    recovery?: number;
}
export interface SchnorrSignature {
    signature: Buffer;
    publicKey: Buffer;
    message: Buffer;
}
/**
 * Криптографические утилиты для алгоритмов микширования
 * Обеспечивает безопасные криптографические операции
 */
export declare class CryptographicUtils {
    private static readonly CURVE_ORDER;
    private static readonly GENERATOR_POINT;
    /**
     * Генерирует криптографически стойкую пару ключей
     */
    static generateKeyPair(): KeyPair;
    /**
     * Создает детерминистический ключ из seed
     */
    static generateKeyPairFromSeed(seed: Buffer): KeyPair;
    /**
     * Подписывает сообщение приватным ключом (ECDSA)
     */
    static signMessage(message: Buffer, privateKey: Buffer): Signature;
    /**
     * Проверяет подпись ECDSA
     */
    static verifySignature(message: Buffer, signature: Signature, publicKey: Buffer): boolean;
    /**
     * Создает Schnorr подпись (для Ring Signatures)
     */
    static createSchnorrSignature(message: Buffer, privateKey: Buffer, nonce?: Buffer): SchnorrSignature;
    /**
     * Проверяет Schnorr подпись
     */
    static verifySchnorrSignature(signature: SchnorrSignature): boolean;
    /**
     * Генерирует key image для Ring Signatures
     */
    static generateKeyImage(privateKey: Buffer, publicKey: Buffer): Buffer;
    /**
     * Хеширует данные в точку на кривой (hash-to-curve)
     */
    static hashToPoint(data: Buffer): Buffer;
    /**
     * Попытка создать валидную точку кривой из hash
     */
    private static tryCreatePoint;
    /**
     * Проверяет, является ли данный буфер валидной точкой кривой
     */
    private static isValidPoint;
    /**
     * Умножение точки на скаляр
     */
    static pointMultiply(point: Buffer, scalar: Buffer): Buffer;
    /**
     * Сложение точек
     */
    static pointAdd(point1: Buffer, point2: Buffer): Buffer;
    /**
     * Преобразует буфер в скаляр (модуло порядок кривой)
     */
    static bufferToScalar(buffer: Buffer): Buffer;
    /**
     * Преобразует скаляр обратно в буфер
     */
    static scalarToBuffer(scalar: Buffer): Buffer;
    /**
     * Сложение скаляров (модуло порядок кривой)
     */
    static scalarAdd(a: Buffer, b: Buffer): Buffer;
    /**
     * Умножение скаляров (модуло порядок кривой)
     */
    static scalarMultiply(a: Buffer, b: Buffer): Buffer;
    /**
     * Вычитание скаляров (модуло порядок кривой)
     */
    static scalarSubtract(a: Buffer, b: Buffer): Buffer;
    /**
     * Редукция скаляра по модулю порядка кривой
     */
    private static scalarReduce;
    /**
     * Сравнение буферов как больших чисел
     */
    private static bufferCompare;
    /**
     * Генерирует криптографически стойкий nonce
     */
    static generateNonce(privateKey: Buffer, message: Buffer): Buffer;
    /**
     * Хеширует данные с помощью SHA-256
     */
    static hash256(data: Buffer): Buffer;
    /**
     * Хеширует данные с помощью double SHA-256 (как в Bitcoin)
     */
    static hash256Double(data: Buffer): Buffer;
    /**
     * Создает HMAC подпись
     */
    static hmac(key: Buffer, data: Buffer): Buffer;
    /**
     * Генерирует случайные байты криптографически стойким способом
     */
    static randomBytes(length: number): Buffer;
    /**
     * Проверяет, что значение является валидным приватным ключом
     */
    static isValidPrivateKey(privateKey: Buffer): boolean;
    /**
     * Проверяет, что значение является валидным публичным ключом
     */
    static isValidPublicKey(publicKey: Buffer): boolean;
    /**
     * Сжимает публичный ключ
     */
    static compressPublicKey(publicKey: Buffer): Buffer;
    /**
     * Разжимает публичный ключ
     */
    static uncompressPublicKey(publicKey: Buffer): Buffer;
}
