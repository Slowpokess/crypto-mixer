import { EventEmitter } from 'events';
export interface RingKey {
    publicKey: Buffer;
    privateKey?: Buffer;
    keyImage?: Buffer;
    index: number;
    metadata?: {
        amount?: number;
        blockHeight?: number;
        txHash?: string;
        outputIndex?: number;
    };
}
export interface RingSignature {
    c: Buffer[];
    s: Buffer[];
    keyImage: Buffer;
    ringSize: number;
    messageHash: Buffer;
    algorithm: 'MLSAG' | 'CLSAG' | 'BORROMEAN';
    version: number;
}
export interface StealthAddress {
    spendPublicKey: Buffer;
    viewPublicKey: Buffer;
    address: string;
    txPublicKey: Buffer;
    privateKey?: Buffer;
}
export interface RingTransaction {
    id: string;
    version: number;
    inputs: RingTransactionInput[];
    outputs: RingTransactionOutput[];
    ringSignatures: RingSignature[];
    fee: number;
    extra: Buffer;
    timestamp: Date;
    status: 'PENDING' | 'SIGNED' | 'VERIFIED' | 'BROADCASTED' | 'CONFIRMED' | 'FAILED';
}
export interface RingTransactionInput {
    keyImage: Buffer;
    ringSignature: RingSignature;
    amount: number;
    ringKeys: RingKey[];
    globalIndex: number;
    realOutputIndex: number;
}
export interface RingTransactionOutput {
    amount: number;
    stealth: StealthAddress;
    commitment?: Buffer;
    rangeProof?: Buffer;
    ephemeralKey: Buffer;
}
export interface RingConfig {
    ringSize: number;
    minRingSize: number;
    maxRingSize: number;
    algorithm: 'MLSAG' | 'CLSAG' | 'BORROMEAN';
    stealthAddresses: boolean;
    confidentialTransactions: boolean;
    decoySelectionAlgorithm: 'UNIFORM' | 'TRIANGULAR' | 'GAMMA';
    minimumAge: number;
    maximumAge: number;
}
/**
 * Продвинутая реализация Ring Signatures для анонимных транзакций
 * Включает MLSAG, CLSAG, stealth addresses и confidential transactions
 */
export declare class RingSignaturesAlgorithm extends EventEmitter {
    private config;
    private keyImageRegistry;
    private decoyDatabase;
    private stealthAddressCache;
    private logger;
    constructor(dependencies?: any);
    /**
     * Создает Ring Signature используя CLSAG алгоритм
     */
    createCLSAGSignature(message: Buffer, realKey: RingKey, ringKeys: RingKey[], commitment?: Buffer): Promise<RingSignature>;
    /**
     * Проверяет CLSAG signature
     */
    verifyCLSAGSignature(message: Buffer, signature: RingSignature, ringKeys: RingKey[], commitment?: Buffer): Promise<boolean>;
    /**
     * Создает stealth address для получения анонимных платежей
     */
    createStealthAddress(spendPublicKey: Buffer, viewPublicKey: Buffer): Promise<StealthAddress>;
    /**
     * Сканирует транзакции для обнаружения входящих платежей на stealth address
     */
    scanForIncomingPayments(transactions: any[], viewPrivateKey: Buffer, spendPublicKey: Buffer): Promise<StealthAddress[]>;
    /**
     * Создает Ring Transaction с множественными входами и выходами
     */
    createRingTransaction(inputs: Array<{
        realKey: RingKey;
        amount: number;
        ringKeys?: RingKey[];
        commitment?: Buffer;
    }>, outputs: Array<{
        amount: number;
        stealthAddress: StealthAddress;
        commitment?: Buffer;
    }>, fee?: number): Promise<RingTransaction>;
    /**
     * Проверяет Ring Transaction
     */
    verifyRingTransaction(transaction: RingTransaction): Promise<boolean>;
    /**
     * Генерирует оптимальные decoy keys
     */
    generateDecoyKeys(realKey: RingKey, count: number, currency?: string): Promise<RingKey[]>;
    /**
     * Получает статистику алгоритма
     */
    getStatistics(): any;
    /**
     * Очищает кеши и устаревшие данные
     */
    cleanup(): void;
    private _generateKeyImage;
    private _isKeyImageUsed;
    private _registerKeyImage;
    private _generateCLSAGSignature;
    private _verifyCLSAGMath;
    private _selectDecoyKeys;
    private _generateGammaDistributedDecoys;
    private _generateTriangularDistributedDecoys;
    private _generateUniformDistributedDecoys;
    private _generateDecoyKeyForAge;
    private _generateRandomDecoyKey;
    private _sampleGamma;
    private _computeSharedSecret;
    private _computeStealthPublicKey;
    private _computeStealthPrivateKey;
    private _encodeStealthAddress;
    private _generateRangeProof;
    private _verifyRangeProof;
    private _createTransactionMessage;
    private _getSecureRandomIndex;
}
