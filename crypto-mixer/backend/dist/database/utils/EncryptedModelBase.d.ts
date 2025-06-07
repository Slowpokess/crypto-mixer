import { Model } from 'sequelize';
import { DataEncryptionManager, SensitiveDataType, EncryptedData } from './DataEncryption';
/**
 * Конфигурация для шифруемых полей
 */
export interface EncryptedFieldConfig {
    dataType: SensitiveDataType;
    required?: boolean;
    nullable?: boolean;
    autoEncrypt?: boolean;
    autoDecrypt?: boolean;
}
/**
 * Метаданные для шифруемых полей модели
 */
export interface EncryptedFieldsMetadata {
    [fieldName: string]: EncryptedFieldConfig;
}
/**
 * Базовый класс для моделей с поддержкой шифрования чувствительных данных
 */
export declare abstract class EncryptedModelBase<TModelAttributes extends Record<string, any> = any, TCreationAttributes extends Record<string, any> = TModelAttributes> extends Model<TModelAttributes, TCreationAttributes> {
    private static encryptionManager;
    protected static encryptedFields: EncryptedFieldsMetadata;
    /**
     * Инициализация менеджера шифрования
     */
    static initializeEncryption(encryptionManager?: DataEncryptionManager): void;
    /**
     * Получение менеджера шифрования
     */
    static getEncryptionManager(): DataEncryptionManager;
    /**
     * Определение шифруемых полей в модели
     */
    static defineEncryptedFields(fields: EncryptedFieldsMetadata): void;
    /**
     * Получение метаданных шифруемых полей
     */
    static getEncryptedFields(): EncryptedFieldsMetadata;
    /**
     * Создание Sequelize атрибутов для шифруемых полей
     */
    static createEncryptedAttributes(): Record<string, any>;
    /**
     * Настройка хуков модели для автоматического шифрования/расшифровки
     */
    static setupEncryptionHooks(): void;
    /**
     * Шифрование отдельного поля
     */
    encryptField(fieldName: string, value: any): Promise<EncryptedData>;
    /**
     * Расшифровка отдельного поля
     */
    decryptField<T = any>(fieldName: string): Promise<T | null>;
    /**
     * Установка зашифрованного поля
     */
    setEncryptedField(fieldName: string, value: any): Promise<void>;
    /**
     * Получение расшифрованного поля
     */
    getDecryptedField<T = any>(fieldName: string): T | null;
    /**
     * Шифрование всех чувствительных полей перед сохранением
     */
    encryptSensitiveFields(): Promise<void>;
    /**
     * Расшифровка всех чувствительных полей после загрузки
     */
    decryptSensitiveFields(): Promise<void>;
    /**
     * Принудительная расшифровка поля (синхронно возвращает Promise)
     */
    getDecryptedFieldAsync<T = any>(fieldName: string): Promise<T | null>;
    /**
     * Обновление зашифрованного поля
     */
    updateEncryptedField(fieldName: string, newValue: any): Promise<void>;
    /**
     * Перешифровка всех полей с новым ключом
     */
    reencryptAllFields(newKeyVersion?: string): Promise<void>;
    /**
     * Получение статистики шифрования для экземпляра
     */
    getEncryptionStats(): {
        totalFields: number;
        encryptedFields: number;
        keyVersions: string[];
        lastEncrypted?: Date;
    };
    /**
     * Проверка необходимости перешифровки
     */
    needsReencryption(): boolean;
    /**
     * Экспорт зашифрованных данных (для резервного копирования)
     */
    exportEncryptedData(): Record<string, EncryptedData>;
    /**
     * Импорт зашифрованных данных (для восстановления)
     */
    importEncryptedData(encryptedData: Record<string, EncryptedData>): void;
}
/**
 * Хелпер функция для создания модели с поддержкой шифрования
 */
export declare function createEncryptedModel<T extends typeof Model>(BaseModel: T, encryptedFields: EncryptedFieldsMetadata, encryptionManager?: DataEncryptionManager): T;
export default EncryptedModelBase;
