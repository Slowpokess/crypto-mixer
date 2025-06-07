import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { LogLevel } from '../types';
import { EncryptedModelBase, EncryptedFieldsMetadata } from '../utils/EncryptedModelBase';
import { SensitiveDataType } from '../utils/DataEncryption';

export interface AuditLogAttributes {
  id: string;
  level: LogLevel;
  action: string;
  
  userId?: string;
  sessionId?: string;
  mixRequestId?: string;
  
  resourceType?: string;
  resourceId?: string;
  
  message: string;
  details?: Record<string, any>;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  
  ipAddress?: string;
  userAgent?: string;
  
  success: boolean;
  duration?: number;
  errorCode?: string;
  
  createdAt: Date;
}

export interface AuditLogCreationAttributes extends Optional<AuditLogAttributes,
  'id' | 'success' | 'createdAt'
> {}

export class AuditLog extends EncryptedModelBase<AuditLogAttributes, AuditLogCreationAttributes> 
  implements AuditLogAttributes {
  
  public id!: string;
  public level!: LogLevel;
  public action!: string;
  
  public userId?: string;
  public sessionId?: string;
  public mixRequestId?: string;
  
  public resourceType?: string;
  public resourceId?: string;
  
  public message!: string;
  public details?: Record<string, any>;
  public oldValues?: Record<string, any>;
  public newValues?: Record<string, any>;
  
  public ipAddress?: string;
  public userAgent?: string;
  
  public success!: boolean;
  public duration?: number;
  public errorCode?: string;
  
  public readonly createdAt!: Date;

  public static async logAction(data: {
    level: LogLevel;
    action: string;
    message: string;
    userId?: string;
    sessionId?: string;
    mixRequestId?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success?: boolean;
    duration?: number;
    errorCode?: string;
  }): Promise<AuditLog> {
    return await this.create({
      success: true,
      ...data
    });
  }

  public static async findByUser(userId: string, limit: number = 100): Promise<AuditLog[]> {
    return await this.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  public static async findBySession(sessionId: string): Promise<AuditLog[]> {
    return await this.findAll({
      where: { sessionId },
      order: [['createdAt', 'ASC']]
    });
  }

  public static async findByMixRequest(mixRequestId: string): Promise<AuditLog[]> {
    return await this.findAll({
      where: { mixRequestId },
      order: [['createdAt', 'ASC']]
    });
  }

  public static async findErrors(timeFrame: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<AuditLog[]> {
    return await this.findAll({
      where: {
        level: 'ERROR',
        createdAt: { [Op.gte]: timeFrame }
      },
      order: [['createdAt', 'DESC']]
    });
  }

  public static async getStatistics(timeFrame: Date): Promise<Record<string, any>> {
    const stats = await this.findAll({
      attributes: [
        'level',
        'action',
        'success',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: {
        createdAt: { [Op.gte]: timeFrame }
      },
      group: ['level', 'action', 'success'],
      raw: true
    });

    const result: Record<string, any> = {};
    stats.forEach((stat: any) => {
      const key = `${stat.level}_${stat.action}_${stat.success ? 'success' : 'failure'}`;
      result[key] = parseInt(stat.count);
    });

    return result;
  }
}

export function initAuditLog(sequelize: Sequelize): typeof AuditLog {
  // Настройка полей для шифрования чувствительных данных аудита
  const encryptedFields: EncryptedFieldsMetadata = {
    details: {
      dataType: SensitiveDataType.AUDIT_DETAILS,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
    oldValues: {
      dataType: SensitiveDataType.AUDIT_DETAILS,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
    newValues: {
      dataType: SensitiveDataType.AUDIT_DETAILS,
      autoEncrypt: true,
      autoDecrypt: true,
      nullable: true
    },
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
    }
  };

  // Определяем зашифрованные поля
  AuditLog.defineEncryptedFields(encryptedFields);
  
  // Создаем атрибуты для зашифрованных полей
  const encryptedAttributes = AuditLog.createEncryptedAttributes();

  AuditLog.init(
    {
      ...encryptedAttributes, // Добавляем зашифрованные поля
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      level: {
        type: DataTypes.ENUM('ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
        allowNull: false
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      userId: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      sessionId: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      mixRequestId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'mix_requests', key: 'id' }
      },
      resourceType: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      resourceId: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // БЕЗОПАСНОСТЬ: Чувствительные поля (details, oldValues, newValues, ipAddress, userAgent) 
      // автоматически создаются через encryptedAttributes с шифрованием AES-256-GCM
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 0 }
      },
      errorCode: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      timestamps: false,
      indexes: [
        { fields: ['level'] },
        { fields: ['action'] },
        { fields: ['userId'] },
        { fields: ['sessionId'] },
        { fields: ['mixRequestId'] },
        { fields: ['resourceType', 'resourceId'] },
        { fields: ['createdAt'] },
        { fields: ['level', 'createdAt'] },
        { fields: ['success', 'createdAt'] }
      ]
    }
  );

  // КРИТИЧЕСКАЯ БЕЗОПАСНОСТЬ: Настройка автоматического шифрования
  AuditLog.setupEncryptionHooks();
  
  // Инициализация системы шифрования
  AuditLog.initializeEncryption();

  console.log('🔒 AuditLog model initialized with AES-256-GCM encryption for sensitive audit data');

  return AuditLog;
}

export default AuditLog;