import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType, MixRequestStatus, OutputConfiguration } from '../types';
import { EncryptedModelBase, EncryptedFieldsMetadata } from '../utils/EncryptedModelBase';
import { SensitiveDataType } from '../utils/DataEncryption';

// Атрибуты модели MixRequest
export interface MixRequestAttributes {
  id: string;
  sessionId: string;
  currency: CurrencyType;
  inputAmount: number;
  outputAmount: number;
  feeAmount: number;
  feePercentage: number;
  status: MixRequestStatus;
  
  // Адреса
  inputAddress: string;
  outputAddresses: OutputConfiguration[];
  
  // Временные параметры
  delayMinutes: number;
  expiresAt: Date;
  completedAt?: Date;
  
  // Метаданные
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  
  // Дополнительные поля
  transactionCount: number;
  anonymitySet: number;
  riskScore: number;
  notes?: string;
  
  // Параметры микширования
  anonymityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  mixingAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
  
  // Системные поля
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Атрибуты для создания (опциональные поля)
export interface MixRequestCreationAttributes extends Optional<MixRequestAttributes, 
  'id' | 'outputAmount' | 'feeAmount' | 'status' | 'transactionCount' | 
  'anonymitySet' | 'riskScore' | 'createdAt' | 'updatedAt'
> {}

/**
 * Модель запроса на микширование с поддержкой шифрования чувствительных данных
 * Центральная таблица для отслеживания всех запросов на микширование
 */
export class MixRequest extends EncryptedModelBase<MixRequestAttributes, MixRequestCreationAttributes> 
  implements MixRequestAttributes {
  
  public id!: string;
  public sessionId!: string;
  public currency!: CurrencyType;
  public inputAmount!: number;
  public outputAmount!: number;
  public feeAmount!: number;
  public feePercentage!: number;
  public status!: MixRequestStatus;
  
  public inputAddress!: string;
  public outputAddresses!: OutputConfiguration[];
  
  public delayMinutes!: number;
  public expiresAt!: Date;
  public completedAt?: Date;
  
  public ipAddress?: string;
  public userAgent?: string;
  public referrer?: string;
  
  public transactionCount!: number;
  public anonymitySet!: number;
  public riskScore!: number;
  public notes?: string;
  
  public anonymityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  public mixingAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  // Методы экземпляра
  
  /**
   * Проверка истечения срока запроса
   */
  public isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Проверка завершенности запроса
   */
  public isCompleted(): boolean {
    return this.status === 'COMPLETED';
  }

  /**
   * Проверка возможности отмены
   */
  public canBeCancelled(): boolean {
    return ['PENDING', 'PROCESSING'].includes(this.status);
  }

  /**
   * Получение общей суммы вывода
   */
  public getTotalOutputAmount(): number {
    return this.outputAddresses.reduce((total, output) => {
      return total + (output.amount || (this.outputAmount * output.percentage / 100));
    }, 0);
  }

  /**
   * Расчет комиссии
   */
  public calculateFee(): number {
    return this.inputAmount * this.feePercentage / 100;
  }

  /**
   * Обновление статуса
   */
  public async updateStatus(newStatus: MixRequestStatus, notes?: string): Promise<void> {
    const updateData: Partial<MixRequestAttributes> = {
      status: newStatus,
      notes: notes || this.notes
    };

    if (newStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    await this.update(updateData);
  }

  /**
   * Добавление адреса вывода
   */
  public addOutputAddress(address: string, percentage: number, delayMinutes?: number): void {
    const currentTotal = this.outputAddresses.reduce((sum, addr) => sum + addr.percentage, 0);
    
    if (currentTotal + percentage > 100) {
      throw new Error('Общий процент адресов вывода не может превышать 100%');
    }

    this.outputAddresses.push({
      address,
      percentage,
      delayMinutes
    });
  }

  /**
   * Валидация адресов вывода
   */
  public validateOutputAddresses(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (this.outputAddresses.length === 0) {
      errors.push('Необходим хотя бы один адрес вывода');
    }

    const totalPercentage = this.outputAddresses.reduce((sum, addr) => sum + addr.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      errors.push('Общий процент адресов вывода должен равняться 100%');
    }

    // Проверка уникальности адресов
    const addresses = this.outputAddresses.map(addr => addr.address);
    const uniqueAddresses = new Set(addresses);
    if (addresses.length !== uniqueAddresses.size) {
      errors.push('Адреса вывода должны быть уникальными');
    }

    // Проверка на совпадение с входным адресом
    if (addresses.includes(this.inputAddress)) {
      errors.push('Адрес вывода не может совпадать с входным адресом');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Статические методы

  /**
   * Поиск запросов по статусу
   */
  public static async findByStatus(status: MixRequestStatus): Promise<MixRequest[]> {
    return await this.findAll({
      where: { status },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Поиск активных запросов
   */
  public static async findActive(): Promise<MixRequest[]> {
    return await this.findAll({
      where: {
        status: ['PENDING', 'PROCESSING', 'MIXING']
      },
      order: [['createdAt', 'ASC']]
    });
  }

  /**
   * Поиск истекших запросов
   */
  public static async findExpired(): Promise<MixRequest[]> {
    return await this.findAll({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        },
        status: ['PENDING', 'PROCESSING']
      }
    });
  }

  /**
   * Статистика по валютам
   */
  public static async getCurrencyStats(): Promise<Record<CurrencyType, any>> {
    const stats = await this.findAll({
      attributes: [
        'currency',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('inputAmount')), 'totalVolume'],
        [Sequelize.fn('AVG', Sequelize.col('inputAmount')), 'averageAmount']
      ],
      group: ['currency'],
      raw: true
    });

    const result = {} as Record<CurrencyType, any>;
    stats.forEach((stat: any) => {
      // Расширенная типизация для безопасного индексирования
      const currency = stat.currency as CurrencyType;
      result[currency] = {
        count: parseInt(stat.count),
        totalVolume: parseFloat(stat.totalVolume) || 0,
        averageAmount: parseFloat(stat.averageAmount) || 0
      };
    });

    return result;
  }
}

/**
 * Инициализация модели MixRequest с поддержкой шифрования
 */
export function initMixRequest(sequelize: Sequelize): typeof MixRequest {
  // Настройка полей для шифрования чувствительных данных
  const encryptedFields: EncryptedFieldsMetadata = {
    ipAddress: {
      dataType: SensitiveDataType.IP_ADDRESS,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
    userAgent: {
      dataType: SensitiveDataType.USER_METADATA,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
    referrer: {
      dataType: SensitiveDataType.USER_METADATA,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
    notes: {
      dataType: SensitiveDataType.NOTES,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    }
  };

  // Определяем зашифрованные поля
  MixRequest.defineEncryptedFields(encryptedFields);
  
  // Создаем атрибуты для зашифрованных полей
  const encryptedAttributes = MixRequest.createEncryptedAttributes();

  MixRequest.init(
    {
      ...encryptedAttributes, // Добавляем зашифрованные поля
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      sessionId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: {
          notEmpty: true,
          len: [8, 64]
        }
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
        allowNull: false
      },
      inputAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      outputAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      feeAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      feePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 0,
          max: 10
        }
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'PROCESSING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      inputAddress: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      outputAddresses: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      delayMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 1440 // 24 часа
        }
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // БЕЗОПАСНОСТЬ: Чувствительные поля (ipAddress, userAgent, referrer, notes) 
      // автоматически создаются через encryptedAttributes с шифрованием AES-256-GCM
      transactionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      anonymitySet: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      riskScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100
        }
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'MixRequest',
      tableName: 'mix_requests',
      timestamps: true,
      paranoid: true, // Soft delete
      indexes: [
        {
          fields: ['sessionId']
        },
        {
          fields: ['currency']
        },
        {
          fields: ['status']
        },
        {
          fields: ['inputAddress']
        },
        {
          fields: ['createdAt']
        },
        {
          fields: ['expiresAt']
        },
        {
          fields: ['status', 'currency']
        },
        {
          fields: ['status', 'expiresAt']
        }
      ],
      hooks: {
        beforeCreate: (mixRequest: MixRequest) => {
          // Расчет суммы вывода и комиссии
          mixRequest.feeAmount = mixRequest.calculateFee();
          mixRequest.outputAmount = mixRequest.inputAmount - mixRequest.feeAmount;
        },
        beforeUpdate: (mixRequest: MixRequest) => {
          // Пересчет при изменении входящей суммы или процента комиссии
          if (mixRequest.changed('inputAmount') || mixRequest.changed('feePercentage')) {
            mixRequest.feeAmount = mixRequest.calculateFee();
            mixRequest.outputAmount = mixRequest.inputAmount - mixRequest.feeAmount;
          }
        }
      }
    }
  );

  // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Настройка автоматического шифрования
  MixRequest.setupEncryptionHooks();
  
  // Инициализация системы шифрования
  MixRequest.initializeEncryption();

  console.log('🔒 MixRequest model initialized with AES-256-GCM encryption for sensitive data');

  return MixRequest;
}

/**
 * Расширенные методы для работы с зашифрованными данными
 */
export namespace MixRequestSecurity {
  /**
   * Массовое перешифровывание всех записей
   */
  export async function reencryptAllRecords(newKeyVersion?: string): Promise<number> {
    const records = await MixRequest.findAll();
    let reencryptedCount = 0;

    for (const record of records) {
      try {
        if (record.needsReencryption()) {
          await record.reencryptAllFields(newKeyVersion);
          reencryptedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to re-encrypt MixRequest ${record.id}:`, error);
      }
    }

    console.log(`🔄 Re-encrypted ${reencryptedCount} MixRequest records`);
    return reencryptedCount;
  }

  /**
   * Аудит шифрования для всех записей
   */
  export async function auditEncryption(): Promise<{
    total: number;
    encrypted: number;
    needsReencryption: number;
    keyVersions: string[];
  }> {
    const records = await MixRequest.findAll();
    const keyVersions = new Set<string>();
    let encryptedCount = 0;
    let needsReencryptionCount = 0;

    for (const record of records) {
      const stats = record.getEncryptionStats();
      if (stats.encryptedFields > 0) {
        encryptedCount++;
        stats.keyVersions.forEach(v => keyVersions.add(v));
      }
      if (record.needsReencryption()) {
        needsReencryptionCount++;
      }
    }

    const auditResult = {
      total: records.length,
      encrypted: encryptedCount,
      needsReencryption: needsReencryptionCount,
      keyVersions: Array.from(keyVersions)
    };

    console.log('🔍 MixRequest encryption audit:', auditResult);
    return auditResult;
  }

  /**
   * Поиск записей по зашифрованным полям (требует расшифровки)
   */
  export async function findByEncryptedField(
    fieldName: 'ipAddress' | 'userAgent' | 'referrer' | 'notes',
    searchValue: string
  ): Promise<MixRequest[]> {
    const allRecords = await MixRequest.findAll();
    const matchingRecords: MixRequest[] = [];

    for (const record of allRecords) {
      try {
        const decryptedValue = await record.getDecryptedFieldAsync(fieldName);
        if (decryptedValue && String(decryptedValue).includes(searchValue)) {
          matchingRecords.push(record);
        }
      } catch (error) {
        console.error(`❌ Failed to decrypt ${fieldName} for record ${record.id}:`, error);
      }
    }

    return matchingRecords;
  }

  /**
   * Экспорт зашифрованных данных для резервного копирования
   */
  export async function exportEncryptedData(recordId: string): Promise<Record<string, any>> {
    const record = await MixRequest.findByPk(recordId);
    if (!record) {
      throw new Error(`MixRequest ${recordId} not found`);
    }

    return {
      id: record.id,
      encryptedData: record.exportEncryptedData(),
      stats: record.getEncryptionStats()
    };
  }
}

export default MixRequest;