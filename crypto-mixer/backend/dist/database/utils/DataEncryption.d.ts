/**
 * Типы чувствительных данных для шифрования
 */
export declare enum SensitiveDataType {
    IP_ADDRESS = "ip_address",
    USER_METADATA = "user_metadata",
    NOTES = "notes",
    TRANSACTION_METADATA = "transaction_metadata",
    SESSION_DATA = "session_data",
    AUDIT_DETAILS = "audit_details",
    ERROR_DETAILS = "error_details",
    CUSTOM_DATA = "custom_data"
}
/**
 * Интерфейс для зашифрованных данных
 */
export interface EncryptedData {
    encryptedValue: string;
    iv: string;
    tag: string;
    algorithm: string;
    keyVersion: string;
    dataType: SensitiveDataType;
    createdAt: Date;
    metadata?: {
        originalLength: number;
        checksum: string;
    };
}
/**
 * Интерфейс для конфигурации шифрования
 */
export interface EncryptionConfig {
    masterKey: string;
    algorithm: string;
    keyRotationInterval: number;
    compressionEnabled: boolean;
    integrityCheckEnabled: boolean;
}
/**
 * Менеджер шифрования чувствительных данных
 * Использует AES-256-GCM для authenticated encryption
 */
export declare class DataEncryptionManager {
    private config;
    private currentKeyVersion;
    private keyCache;
    private readonly ALGORITHM;
    private readonly KEY_LENGTH;
    private readonly IV_LENGTH;
    private readonly TAG_LENGTH;
    private readonly SALT_LENGTH;
    constructor(config?: Partial<EncryptionConfig>);
    /**
     * Шифрование чувствительных данных
     */
    encryptSensitiveData(data: any, dataType: SensitiveDataType, keyVersion?: string): Promise<EncryptedData>;
    /**
     * Расшифровка чувствительных данных
     */
    decryptSensitiveData<T = any>(encryptedData: EncryptedData): Promise<T>;
    /**
     * Массовое шифрование данных
     */
    encryptMultiple(dataItems: Array<{
        data: any;
        type: SensitiveDataType;
        id?: string;
    }>): Promise<Array<{
        id?: string;
        encrypted: EncryptedData;
    }>>;
    /**
     * Массовое расшифровка данных
     */
    decryptMultiple<T = any>(encryptedItems: Array<{
        encrypted: EncryptedData;
        id?: string;
    }>): Promise<Array<{
        id?: string;
        data: T;
    }>>;
    /**
     * Перешифровка данных с новым ключом
     */
    reencryptData(encryptedData: EncryptedData, newKeyVersion?: string): Promise<EncryptedData>;
    /**
     * Ротация ключей шифрования
     */
    rotateEncryptionKeys(): Promise<string>;
    /**
     * Получение статистики шифрования
     */
    getEncryptionStats(): {
        algorithm: string;
        currentKeyVersion: string;
        keyRotationInterval: number;
        compressionEnabled: boolean;
        integrityCheckEnabled: boolean;
        cachedKeys: number;
    };
    /**
     * Валидация конфигурации шифрования
     */
    private validateConfiguration;
    /**
     * Валидация входных данных
     */
    private validateInput;
    /**
     * Валидация зашифрованных данных
     */
    private validateEncryptedData;
    /**
     * Генерация производного ключа
     */
    private getDerivedKey;
    /**
     * Генерация версии ключа
     */
    private generateKeyVersion;
    /**
     * Генерация безопасного ключа
     */
    private generateSecureKey;
    /**
     * Подготовка данных для шифрования
     */
    private prepareDataForEncryption;
    /**
     * Парсинг расшифрованных данных
     */
    private parseDecryptedData;
    /**
     * Вычисление контрольной суммы
     */
    private calculateChecksum;
    /**
     * Сжатие данных
     */
    private compressData;
    /**
     * Распаковка данных
     */
    private decompressData;
    /**
     * Очистка кэша ключей
     */
    clearKeyCache(): void;
    /**
     * Проверка необходимости ротации ключей
     */
    isKeyRotationNeeded(): boolean;
    /**
     * Получение возраста ключа в днях
     */
    private getKeyAge;
}
export default DataEncryptionManager;
