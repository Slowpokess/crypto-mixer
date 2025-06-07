/**
 * Менеджер для работы с HashiCorp Vault
 * Обеспечивает безопасное хранение и управление приватными ключами
 */
export declare class VaultManager {
    private vault;
    private logger;
    private config;
    private isInitialized;
    constructor(config: VaultConfig);
    /**
     * Инициализация соединения с Vault и проверка готовности
     */
    initialize(): Promise<void>;
    /**
     * Сохранение приватного ключа в Vault с дополнительным шифрованием
     */
    storePrivateKey(keyId: string, privateKey: string, metadata: KeyMetadata): Promise<string>;
    /**
     * Получение приватного ключа из Vault с расшифровкой
     */
    retrievePrivateKey(keyId: string, currency: string): Promise<string>;
    /**
     * Ротация приватного ключа с сохранением старой версии
     */
    rotateKey(keyId: string, currency: string): Promise<string>;
    /**
     * Удаление ключа из Vault (необратимая операция)
     */
    deleteKey(keyId: string, currency: string): Promise<void>;
    /**
     * Получение списка всех ключей для валюты
     */
    listKeys(currency: string): Promise<KeyInfo[]>;
    /**
     * Создание ключа шифрования в transit engine
     */
    private createTransitKey;
    /**
     * Шифрование данных через transit engine
     */
    private encryptWithTransit;
    /**
     * Расшифровка данных через transit engine
     */
    private decryptWithTransit;
    /**
     * Генерация нового приватного ключа
     */
    private generateNewPrivateKey;
    /**
     * Проверка валидности ключа для secp256k1
     */
    private isKeyInvalid;
    /**
     * Архивирование ключа перед удалением
     */
    private archiveKeyBeforeDeletion;
    /**
     * Проверка инициализации
     */
    private ensureInitialized;
    /**
     * Получение статистики использования Vault
     */
    getStats(): Promise<VaultStats>;
    /**
     * Закрытие соединения с Vault
     */
    close(): Promise<void>;
}
export interface VaultConfig {
    endpoint: string;
    token: string;
    strictSSL: boolean;
}
export interface KeyMetadata {
    currency: string;
    algorithm?: string;
    purpose?: string;
    rotationSchedule?: string;
    description?: string;
}
export interface StoredKeyMetadata extends KeyMetadata {
    keyId: string;
    transitKeyName: string;
    createdAt: string;
    previousKeyId?: string;
    rotatedAt?: string;
}
export interface KeyInfo {
    keyId: string;
    currency: string;
    algorithm: string;
    createdAt: string;
    purpose: string;
}
export interface VaultStats {
    totalKeys: number;
    keysByCurrency: Record<string, number>;
    vaultStatus: string;
    lastCheck: string;
}
