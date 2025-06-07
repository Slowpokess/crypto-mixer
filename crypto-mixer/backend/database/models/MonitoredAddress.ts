import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType } from '../types';

export interface MonitoredAddressAttributes {
  id: string;
  currency: CurrencyType;
  address: string;
  type: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL';
  
  balance: number;
  lastBalance: number;
  balanceChangeThreshold: number;
  
  isActive: boolean;
  lastCheckedAt?: Date;
  lastTransactionAt?: Date;
  lastTransactionHash?: string;
  
  checkIntervalMinutes: number;
  alertOnBalance: boolean;
  alertOnTransactions: boolean;
  
  webhookUrl?: string;
  notificationEmail?: string;
  
  metadata?: Record<string, any>;
  tags?: string[];
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface MonitoredAddressCreationAttributes extends Optional<MonitoredAddressAttributes,
  'id' | 'balance' | 'lastBalance' | 'balanceChangeThreshold' | 'isActive' | 
  'checkIntervalMinutes' | 'alertOnBalance' | 'alertOnTransactions' | 'createdAt' | 'updatedAt'
> {}

export class MonitoredAddress extends Model<MonitoredAddressAttributes, MonitoredAddressCreationAttributes> 
  implements MonitoredAddressAttributes {
  
  public id!: string;
  public currency!: CurrencyType;
  public address!: string;
  public type!: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL';
  
  public balance!: number;
  public lastBalance!: number;
  public balanceChangeThreshold!: number;
  
  public isActive!: boolean;
  public lastCheckedAt?: Date;
  public lastTransactionAt?: Date;
  public lastTransactionHash?: string;
  
  public checkIntervalMinutes!: number;
  public alertOnBalance!: boolean;
  public alertOnTransactions!: boolean;
  
  public webhookUrl?: string;
  public notificationEmail?: string;
  
  public metadata?: Record<string, any>;
  public tags?: string[];
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  public needsCheck(): boolean {
    if (!this.isActive) return false;
    if (!this.lastCheckedAt) return true;
    
    const nextCheck = new Date(this.lastCheckedAt.getTime() + this.checkIntervalMinutes * 60 * 1000);
    return new Date() >= nextCheck;
  }

  public async updateBalance(newBalance: number, transactionHash?: string): Promise<void> {
    const balanceChange = Math.abs(newBalance - this.balance);
    
    await this.update({
      lastBalance: this.balance,
      balance: newBalance,
      lastCheckedAt: new Date(),
      ...(transactionHash && {
        lastTransactionAt: new Date(),
        lastTransactionHash: transactionHash
      })
    });

    // Отправляем уведомление если изменение превышает порог
    if (this.alertOnBalance && balanceChange >= this.balanceChangeThreshold) {
      await this.sendBalanceAlert(newBalance, this.balance);
    }
  }

  private async sendBalanceAlert(newBalance: number, oldBalance: number): Promise<void> {
    // Логика отправки уведомлений
    const change = newBalance - oldBalance;
    const alert = {
      address: this.address,
      currency: this.currency,
      oldBalance,
      newBalance,
      change,
      timestamp: new Date()
    };

    // Здесь можно добавить отправку webhook или email
    console.log('Balance alert:', alert);
  }

  public static async findForMonitoring(): Promise<MonitoredAddress[]> {
    // Расширенная логика мониторинга с правильной типизацией
    const whereCondition: any = {
      isActive: true,
      [Op.or]: [
        { lastCheckedAt: { [Op.is]: null } },
        Sequelize.literal(
          `NOW() >= last_checked_at + INTERVAL '1 minute' * check_interval_minutes`
        )
        ]
    };
    
    return await this.findAll({
      where: whereCondition,
      order: [['lastCheckedAt', 'ASC']]
    });
  }

  public static async findByType(type: 'DEPOSIT' | 'WALLET' | 'EXTERNAL' | 'POOL'): Promise<MonitoredAddress[]> {
    return await this.findAll({
      where: { type, isActive: true },
      order: [['createdAt', 'DESC']]
    });
  }
}

export function initMonitoredAddress(sequelize: Sequelize): typeof MonitoredAddress {
  MonitoredAddress.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
        allowNull: false
      },
      address: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('DEPOSIT', 'WALLET', 'EXTERNAL', 'POOL'),
        allowNull: false
      },
      balance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 }
      },
      lastBalance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 }
      },
      balanceChangeThreshold: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 }
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      lastCheckedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastTransactionAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastTransactionHash: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      checkIntervalMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        validate: { min: 1, max: 1440 }
      },
      alertOnBalance: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      alertOnTransactions: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      webhookUrl: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      notificationEmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true }
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: []
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
      modelName: 'MonitoredAddress',
      tableName: 'monitored_addresses',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['currency', 'address'] },
        { fields: ['type'] },
        { fields: ['isActive'] },
        { fields: ['lastCheckedAt'] },
        { fields: ['currency', 'type'] },
        { fields: ['isActive', 'lastCheckedAt'] }
      ]
    }
  );

  return MonitoredAddress;
}

export default MonitoredAddress;