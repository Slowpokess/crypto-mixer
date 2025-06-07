/**
 * Гибридный менеджер HSM/Vault для управления криптографическими ключами
 *
 * В production использует настоящие HSM модули для критических операций,
 * а Vault для хранения и менее критических ключей.
 * В development режиме использует Vault как основное хранилище с программными ключами.
 */
export declare class HSMManager {
    private pkcs11;
    private session;
    private vaultManager;
    private logger;
    private config;
    private isInitialized;
    constructor(config: HSMConfig);
    /**
     * Инициализация HSM и Vault
     * В production режиме инициализирует реальные HSM модули
     * В development режиме использует только Vault
     */
    initialize(): Promise<void>;
    /**
     * Инициализация реального HSM модуля
     */
    private initializeRealHSM;
    isConnected(): boolean;
    /**
     * Генерация нового криптографического ключа
     * В зависимости от конфигурации использует HSM или генерирует программно и сохраняет в Vault
     */
    generateKey(algorithm: string, currency: string, purpose?: KeyPurpose): Promise<KeyGenerationResult>;
    /**
     * Генерация ключа в HSM (для критических операций)
     */
    private generateKeyInHSM;
    /**
     * Генерация программного ключа и сохранение в Vault
     */
    private generateKeyInVault;
    /**
     * Получение публичного ключа по ID
     */
    getPublicKey(keyId: string, currency: string): Promise<string>;
    /**
     * Подпись данных с использованием указанного ключа
     */
    sign(keyId: string, currency: string, data: Buffer): Promise<string>;
    /**
     * Подпись данных с использованием HSM
     */
    private signWithHSM;
    /**
     * Подпись данных с использованием ключа из Vault
     */
    private signWithVaultKey;
    /**
     * Ротация ключа
     */
    rotateKey(keyId: string, currency: string): Promise<KeyGenerationResult>;
    private generateKeyId;
    private shouldUseHSM;
    private isHSMKey;
    private generateSecp256k1Key;
    private generateEd25519Key;
    private derivePublicKey;
    private signSecp256k1;
    private signEd25519;
    private ensureInitialized;
    private getSecp256k1KeyTemplate;
    private getEd25519KeyTemplate;
    private extractPublicKeyFromHSM;
    private getPublicKeyFromHSM;
    private getHSMHandle;
    /**
     * Закрытие соединений
     */
    close(): Promise<void>;
}
export interface HSMConfig {
    useRealHSM: boolean;
    hsmPin?: string;
    vaultEndpoint: string;
    vaultToken: string;
    strictSSL: boolean;
}
export type KeyPurpose = 'master' | 'signing' | 'encryption' | 'backup';
export interface KeyGenerationResult {
    keyId: string;
    publicKey: string;
    isHSMKey: boolean;
    algorithm: string;
    createdAt: string;
}
