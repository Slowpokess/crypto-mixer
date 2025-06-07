import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

export interface SystemConfigAttributes {
  id: string;
  key: string;
  value: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED';
  category: string;
  
  description?: string;
  isEncrypted: boolean;
  isActive: boolean;
  isReadOnly: boolean;
  
  validationRules?: Record<string, any>;
  defaultValue?: string;
  
  lastModifiedBy?: string;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'ALL';
  
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemConfigCreationAttributes extends Optional<SystemConfigAttributes,
  'id' | 'isEncrypted' | 'isActive' | 'isReadOnly' | 'environment' | 'createdAt' | 'updatedAt'
> {}

export class SystemConfig extends Model<SystemConfigAttributes, SystemConfigCreationAttributes> 
  implements SystemConfigAttributes {
  
  public id!: string;
  public key!: string;
  public value!: string;
  public type!: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED';
  public category!: string;
  
  public description?: string;
  public isEncrypted!: boolean;
  public isActive!: boolean;
  public isReadOnly!: boolean;
  
  public validationRules?: Record<string, any>;
  public defaultValue?: string;
  
  public lastModifiedBy?: string;
  public environment!: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'ALL';
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public getTypedValue(): any {
    switch (this.type) {
      case 'NUMBER':
        return parseFloat(this.value);
      case 'BOOLEAN':
        return this.value.toLowerCase() === 'true';
      case 'JSON':
        try {
          return JSON.parse(this.value);
        } catch {
          return null;
        }
      case 'STRING':
      case 'ENCRYPTED':
      default:
        return this.value;
    }
  }

  public async updateValue(newValue: any, modifiedBy?: string): Promise<void> {
    if (this.isReadOnly) {
      throw new Error('Нельзя изменить значение: параметр только для чтения');
    }

    let stringValue: string;
    switch (this.type) {
      case 'JSON':
        stringValue = JSON.stringify(newValue);
        break;
      case 'BOOLEAN':
        stringValue = Boolean(newValue).toString();
        break;
      case 'NUMBER':
        stringValue = Number(newValue).toString();
        break;
      default:
        stringValue = String(newValue);
    }

    await this.update({
      value: stringValue,
      lastModifiedBy: modifiedBy
    });
  }

  public static async getValue(key: string, defaultValue?: any): Promise<any> {
    const config = await this.findOne({
      where: { 
        key, 
        isActive: true,
        environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
      }
    });

    if (!config) {
      return defaultValue;
    }

    return config.getTypedValue();
  }

  public static async setValue(
    key: string, 
    value: any, 
    type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED' = 'STRING',
    category: string = 'GENERAL',
    modifiedBy?: string
  ): Promise<SystemConfig> {
    const existingConfig = await this.findOne({ where: { key } });

    if (existingConfig) {
      await existingConfig.updateValue(value, modifiedBy);
      return existingConfig;
    }

    let stringValue: string;
    switch (type) {
      case 'JSON':
        stringValue = JSON.stringify(value);
        break;
      case 'BOOLEAN':
        stringValue = Boolean(value).toString();
        break;
      case 'NUMBER':
        stringValue = Number(value).toString();
        break;
      default:
        stringValue = String(value);
    }

    return await this.create({
      key,
      value: stringValue,
      type,
      category,
      lastModifiedBy: modifiedBy
    });
  }

  public static async getByCategory(category: string): Promise<SystemConfig[]> {
    return await this.findAll({
      where: { 
        category, 
        isActive: true,
        environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
      },
      order: [['key', 'ASC']]
    });
  }

  public static async getAllSettings(): Promise<Record<string, any>> {
    const configs = await this.findAll({
      where: { 
        isActive: true,
        environment: ['ALL', process.env.NODE_ENV?.toUpperCase() || 'DEVELOPMENT']
      }
    });

    const settings: Record<string, any> = {};
    configs.forEach(config => {
      settings[config.key] = config.getTypedValue();
    });

    return settings;
  }

  public static async initializeDefaults(): Promise<void> {
    const defaults = [
      // Mixing Configuration
      { key: 'MIXING_MIN_AMOUNT', value: '0.001', type: 'NUMBER', category: 'MIXING' },
      { key: 'MIXING_MAX_AMOUNT', value: '100', type: 'NUMBER', category: 'MIXING' },
      { key: 'MIXING_FEE_PERCENTAGE', value: '0.5', type: 'NUMBER', category: 'MIXING' },
      { key: 'MIXING_ROUNDS_DEFAULT', value: '3', type: 'NUMBER', category: 'MIXING' },
      { key: 'MIXING_DELAY_MIN_MINUTES', value: '5', type: 'NUMBER', category: 'MIXING' },
      { key: 'MIXING_DELAY_MAX_MINUTES', value: '60', type: 'NUMBER', category: 'MIXING' },
      
      // Pool Configuration
      { key: 'POOL_MIN_PARTICIPANTS', value: '5', type: 'NUMBER', category: 'POOL' },
      { key: 'POOL_MAX_PARTICIPANTS', value: '50', type: 'NUMBER', category: 'POOL' },
      { key: 'POOL_TIMEOUT_HOURS', value: '24', type: 'NUMBER', category: 'POOL' },
      
      // Security Settings
      { key: 'MAX_RETRY_ATTEMPTS', value: '3', type: 'NUMBER', category: 'SECURITY' },
      { key: 'RATE_LIMIT_REQUESTS_PER_HOUR', value: '100', type: 'NUMBER', category: 'SECURITY' },
      { key: 'ENABLE_ANONYMITY_ANALYSIS', value: 'true', type: 'BOOLEAN', category: 'SECURITY' },
      
      // Network Settings
      { key: 'BTC_CONFIRMATIONS_REQUIRED', value: '3', type: 'NUMBER', category: 'NETWORK' },
      { key: 'ETH_CONFIRMATIONS_REQUIRED', value: '12', type: 'NUMBER', category: 'NETWORK' },
      { key: 'SOL_CONFIRMATIONS_REQUIRED', value: '32', type: 'NUMBER', category: 'NETWORK' },
      
      // System Settings
      { key: 'SYSTEM_MAINTENANCE_MODE', value: 'false', type: 'BOOLEAN', category: 'SYSTEM' },
      { key: 'LOG_LEVEL', value: 'INFO', type: 'STRING', category: 'SYSTEM' },
      { key: 'DATABASE_BACKUP_INTERVAL_HOURS', value: '6', type: 'NUMBER', category: 'SYSTEM' }
    ];

    for (const config of defaults) {
      const existing = await this.findOne({ where: { key: config.key } });
      if (!existing) {
        await this.create({
          key: config.key,
          value: config.value,
          type: config.type as any,
          category: config.category,
          description: `Default ${config.key.toLowerCase().replace(/_/g, ' ')} setting`
        });
      }
    }
  }
}

export function initSystemConfig(sequelize: Sequelize): typeof SystemConfig {
  SystemConfig.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: true,
          isUppercase: true
        }
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'),
        allowNull: false,
        defaultValue: 'STRING'
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          notEmpty: true,
          isUppercase: true
        }
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isEncrypted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      isReadOnly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      validationRules: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      defaultValue: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      lastModifiedBy: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      environment: {
        type: DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
        allowNull: false,
        defaultValue: 'ALL'
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
      }
    },
    {
      sequelize,
      modelName: 'SystemConfig',
      tableName: 'system_configs',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['key'] },
        { fields: ['category'] },
        { fields: ['type'] },
        { fields: ['isActive'] },
        { fields: ['environment'] },
        { fields: ['category', 'isActive'] },
        { fields: ['key', 'environment'] }
      ]
    }
  );

  return SystemConfig;
}

export default SystemConfig;