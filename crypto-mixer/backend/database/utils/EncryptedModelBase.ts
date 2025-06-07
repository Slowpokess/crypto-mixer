import { Model, DataTypes, Sequelize, ModelStatic, Optional } from 'sequelize';
import { DataEncryptionManager, SensitiveDataType, EncryptedData } from './DataEncryption';

/**
 * Конфигурация для шифруемых полей
 */
export interface EncryptedFieldConfig {
  dataType: SensitiveDataType;
  required?: boolean;
  nullable?: boolean;
  autoEncrypt?: boolean; // Автоматическое шифрование при сохранении
  autoDecrypt?: boolean; // Автоматическое расшифровка при чтении
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
export abstract class EncryptedModelBase<TModelAttributes extends Record<string, any> = any, TCreationAttributes extends Record<string, any> = TModelAttributes> 
  extends Model<TModelAttributes, TCreationAttributes> {
  // Статический менеджер шифрования (общий для всех моделей)
  private static encryptionManager: DataEncryptionManager;
  
  // Метаданные шифруемых полей (определяются в наследуемых классах)
  protected static encryptedFields: EncryptedFieldsMetadata = {};

  /**
   * Инициализация менеджера шифрования
   */
  static initializeEncryption(encryptionManager?: DataEncryptionManager): void {
    if (!this.encryptionManager) {
      this.encryptionManager = encryptionManager || new DataEncryptionManager();
    }
  }

  /**
   * Получение менеджера шифрования
   */
  static getEncryptionManager(): DataEncryptionManager {
    if (!this.encryptionManager) {
      this.initializeEncryption();
    }
    return this.encryptionManager;
  }

  /**
   * Определение шифруемых полей в модели
   */
  static defineEncryptedFields(fields: EncryptedFieldsMetadata): void {
    this.encryptedFields = fields;
  }

  /**
   * Получение метаданных шифруемых полей
   */
  static getEncryptedFields(): EncryptedFieldsMetadata {
    return this.encryptedFields;
  }

  /**
   * Создание Sequelize атрибутов для шифруемых полей
   */
  static createEncryptedAttributes(): Record<string, any> {
    const attributes: Record<string, any> = {};

    Object.entries(this.encryptedFields).forEach(([fieldName, config]) => {
      // Создаем поле для зашифрованных данных
      attributes[`${fieldName}_encrypted`] = {
        type: DataTypes.JSONB,
        allowNull: config.nullable !== false,
        comment: `Encrypted ${fieldName} data`
      };

      // Создаем виртуальное поле для удобного доступа
      attributes[fieldName] = {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDecryptedField(fieldName);
        },
        set(value: any) {
          this.setEncryptedField(fieldName, value);
        }
      };
    });

    return attributes;
  }

  /**
   * Настройка хуков модели для автоматического шифрования/расшифровки
   */
  static setupEncryptionHooks(): void {
    // Хук перед сохранением - шифруем данные
    this.addHook('beforeSave', async (instance: any) => {
      await instance.encryptSensitiveFields();
    });

    // Хук после загрузки - расшифровываем данные (если настроено)
    this.addHook('afterFind', async (instances: any) => {
      if (!instances) return;
      
      const models = Array.isArray(instances) ? instances : [instances];
      
      for (const instance of models) {
        if (instance instanceof this) {
          await instance.decryptSensitiveFields();
        }
      }
    });
  }

  /**
   * Шифрование отдельного поля
   */
  async encryptField(fieldName: string, value: any): Promise<EncryptedData> {
    const config = (this.constructor as typeof EncryptedModelBase).encryptedFields[fieldName];
    if (!config) {
      throw new Error(`Field ${fieldName} is not configured for encryption`);
    }

    const encryptionManager = (this.constructor as typeof EncryptedModelBase).getEncryptionManager();
    return await encryptionManager.encryptSensitiveData(value, config.dataType);
  }

  /**
   * Расшифровка отдельного поля
   */
  async decryptField<T = any>(fieldName: string): Promise<T | null> {
    const encryptedData = this.getDataValue(`${fieldName}_encrypted` as keyof TModelAttributes);
    if (!encryptedData) {
      return null;
    }

    const encryptionManager = (this.constructor as typeof EncryptedModelBase).getEncryptionManager();
    return await encryptionManager.decryptSensitiveData<T>(encryptedData as any);
  }

  /**
   * Установка зашифрованного поля
   */
  async setEncryptedField(fieldName: string, value: any): Promise<void> {
    if (value === null || value === undefined) {
      this.setDataValue(`${fieldName}_encrypted` as keyof TModelAttributes, null);
      return;
    }

    const encryptedData = await this.encryptField(fieldName, value);
    this.setDataValue(`${fieldName}_encrypted` as keyof TModelAttributes, encryptedData);
  }

  /**
   * Получение расшифрованного поля
   */
  getDecryptedField<T = any>(fieldName: string): T | null {
    // Проверяем кэш расшифрованных данных
    const cacheKey = `_decrypted_${fieldName}`;
    if ((this.dataValues as any)[cacheKey] !== undefined) {
      return (this.dataValues as any)[cacheKey];
    }

    // Если данных нет в кэше, возвращаем null
    // Расшифровка произойдет асинхронно через decryptSensitiveFields()
    return null;
  }

  /**
   * Шифрование всех чувствительных полей перед сохранением
   */
  async encryptSensitiveFields(): Promise<void> {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    
    for (const [fieldName, config] of Object.entries(encryptedFields)) {
      if (config.autoEncrypt !== false) {
        const value = (this.dataValues as any)[fieldName];
        if (value !== undefined) {
          await this.setEncryptedField(fieldName, value);
          // Очищаем виртуальное поле
          delete (this.dataValues as any)[fieldName];
        }
      }
    }
  }

  /**
   * Расшифровка всех чувствительных полей после загрузки
   */
  async decryptSensitiveFields(): Promise<void> {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    
    for (const [fieldName, config] of Object.entries(encryptedFields)) {
      if (config.autoDecrypt !== false) {
        try {
          const decryptedValue = await this.decryptField(fieldName);
          // Кэшируем расшифрованное значение
          this.dataValues[`_decrypted_${fieldName}`] = decryptedValue;
        } catch (error) {
          console.error(`❌ Failed to decrypt field ${fieldName}:`, error);
          // Продолжаем выполнение, но поле остается null
        }
      }
    }
  }

  /**
   * Принудительная расшифровка поля (синхронно возвращает Promise)
   */
  async getDecryptedFieldAsync<T = any>(fieldName: string): Promise<T | null> {
    const cacheKey = `_decrypted_${fieldName}`;
    
    // Проверяем кэш
    if ((this.dataValues as any)[cacheKey] !== undefined) {
      return (this.dataValues as any)[cacheKey];
    }

    // Расшифровываем и кэшируем
    const decryptedValue = await this.decryptField<T>(fieldName);
    (this.dataValues as any)[cacheKey] = decryptedValue;
    
    return decryptedValue;
  }

  /**
   * Обновление зашифрованного поля
   */
  async updateEncryptedField(fieldName: string, newValue: any): Promise<void> {
    await this.setEncryptedField(fieldName, newValue);
    
    // Обновляем кэш
    const cacheKey = `_decrypted_${fieldName}`;
    (this.dataValues as any)[cacheKey] = newValue;
    
    // Сохраняем изменения
    await this.save();
  }

  /**
   * Перешифровка всех полей с новым ключом
   */
  async reencryptAllFields(newKeyVersion?: string): Promise<void> {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    const encryptionManager = (this.constructor as typeof EncryptedModelBase).getEncryptionManager();
    
    for (const fieldName of Object.keys(encryptedFields)) {
      const encryptedData = this.getDataValue(`${fieldName}_encrypted`);
      if (encryptedData) {
        try {
          const reencryptedData = await encryptionManager.reencryptData(encryptedData, newKeyVersion);
          this.setDataValue(`${fieldName}_encrypted`, reencryptedData);
          
          // Очищаем кэш
          delete this.dataValues[`_decrypted_${fieldName}`];
          
        } catch (error) {
          console.error(`❌ Failed to re-encrypt field ${fieldName}:`, error);
          throw error;
        }
      }
    }
    
    await this.save();
  }

  /**
   * Получение статистики шифрования для экземпляра
   */
  getEncryptionStats(): {
    totalFields: number;
    encryptedFields: number;
    keyVersions: string[];
    lastEncrypted?: Date;
  } {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    const fieldNames = Object.keys(encryptedFields);
    
    let encryptedCount = 0;
    const keyVersions: string[] = [];
    let lastEncrypted: Date | undefined;

    for (const fieldName of fieldNames) {
      const encryptedData = this.getDataValue(`${fieldName}_encrypted` as keyof TModelAttributes) as any;
      if (encryptedData) {
        encryptedCount++;
        if (encryptedData.keyVersion) {
          keyVersions.push(encryptedData.keyVersion);
        }
        
        if (encryptedData.createdAt && (!lastEncrypted || encryptedData.createdAt > lastEncrypted)) {
          lastEncrypted = encryptedData.createdAt;
        }
      }
    }

    return {
      totalFields: fieldNames.length,
      encryptedFields: encryptedCount,
      keyVersions: [...new Set(keyVersions)],
      lastEncrypted
    };
  }

  /**
   * Проверка необходимости перешифровки
   */
  needsReencryption(): boolean {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    const encryptionManager = (this.constructor as typeof EncryptedModelBase).getEncryptionManager();
    const currentKeyVersion = encryptionManager.getEncryptionStats().currentKeyVersion;

    for (const fieldName of Object.keys(encryptedFields)) {
      const encryptedData = this.getDataValue(`${fieldName}_encrypted` as keyof TModelAttributes) as any;
      if (encryptedData && encryptedData.keyVersion !== currentKeyVersion) {
        return true;
      }
    }

    return false;
  }

  /**
   * Экспорт зашифрованных данных (для резервного копирования)
   */
  exportEncryptedData(): Record<string, EncryptedData> {
    const encryptedFields = (this.constructor as typeof EncryptedModelBase).encryptedFields;
    const exported: Record<string, EncryptedData> = {};

    for (const fieldName of Object.keys(encryptedFields)) {
      const encryptedData = this.getDataValue(`${fieldName}_encrypted` as keyof TModelAttributes) as any;
      if (encryptedData) {
        exported[fieldName] = encryptedData;
      }
    }

    return exported;
  }

  /**
   * Импорт зашифрованных данных (для восстановления)
   */
  importEncryptedData(encryptedData: Record<string, EncryptedData>): void {
    for (const [fieldName, data] of Object.entries(encryptedData)) {
      this.setDataValue(`${fieldName}_encrypted` as keyof TModelAttributes, data as any);
      // Очищаем кэш
      delete (this.dataValues as any)[`_decrypted_${fieldName}`];
    }
  }
}

/**
 * Хелпер функция для создания модели с поддержкой шифрования
 */
export function createEncryptedModel<T extends typeof Model>(
  BaseModel: T,
  encryptedFields: EncryptedFieldsMetadata,
  encryptionManager?: DataEncryptionManager
): T {
  // Наследуем от EncryptedModelBase
  class EncryptedModel extends EncryptedModelBase {}
  
  // Настраиваем шифрование
  EncryptedModel.initializeEncryption(encryptionManager);
  EncryptedModel.defineEncryptedFields(encryptedFields);
  
  return EncryptedModel as unknown as T;
}

export default EncryptedModelBase;