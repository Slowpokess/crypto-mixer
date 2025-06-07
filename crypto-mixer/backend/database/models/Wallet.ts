import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType, WalletType, WalletStatus } from '../types';

// Атрибуты модели Wallet
export interface WalletAttributes {
  id: string;
  currency: CurrencyType;
  type: WalletType;
  status: WalletStatus;
  
  // Адрес и ключи
  address: string;
  publicKey?: string;
  vaultKeyId?: string;
  keyAlgorithm?: string;
  isHSMKey?: boolean;
  derivationPath?: string;
  
  // Баланс и транзакции
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  totalReceived: number;
  totalSent: number;
  transactionCount: number;
  
  // Конфигурация
  minBalance: number;
  maxBalance: number;
  isMultisig: boolean;
  requiredSignatures?: number;
  
  // Метаданные
  label?: string;
  description?: string;
  tags?: string[];
  
  // Мониторинг
  lastUsedAt?: Date;
  lastBalanceCheck?: Date;
  lastBalanceUpdate?: Date;
  lastTransactionHash?: string;
  usageCount: number;
  
  // Состояние
  isActive: boolean;
  isLocked: boolean;
  
  // Безопасность
  isCompromised: boolean;
  compromisedAt?: Date;
  compromisedReason?: string;
  
  // Системные поля
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Атрибуты для создания
export interface WalletCreationAttributes extends Optional<WalletAttributes,
  'id' | 'balance' | 'reservedBalance' | 'availableBalance' | 'totalReceived' | 
  'totalSent' | 'transactionCount' | 'minBalance' | 'maxBalance' | 'isMultisig' |
  'isCompromised' | 'usageCount' | 'isActive' | 'isLocked' | 'createdAt' | 'updatedAt'
> {}

/**
 * Модель кошелька
 * Управление всеми кошельками в системе микширования
 */
export class Wallet extends Model<WalletAttributes, WalletCreationAttributes> 
  implements WalletAttributes {
  
  public id!: string;
  public currency!: CurrencyType;
  public type!: WalletType;
  public status!: WalletStatus;
  
  public address!: string;
  public publicKey?: string;
  public vaultKeyId?: string;
  public keyAlgorithm?: string;
  public isHSMKey?: boolean;
  public derivationPath?: string;
  
  public balance!: number;
  public reservedBalance!: number;
  public availableBalance!: number;
  public totalReceived!: number;
  public totalSent!: number;
  public transactionCount!: number;
  
  public minBalance!: number;
  public maxBalance!: number;
  public isMultisig!: boolean;
  public requiredSignatures?: number;
  
  public label?: string;
  public description?: string;
  public tags?: string[];
  
  public lastUsedAt?: Date;
  public lastBalanceCheck?: Date;
  public lastBalanceUpdate?: Date;
  public lastTransactionHash?: string;
  public usageCount!: number;
  
  public isActive!: boolean;
  public isLocked!: boolean;
  
  public isCompromised!: boolean;
  public compromisedAt?: Date;
  public compromisedReason?: string;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  // Методы экземпляра

  /**
   * Проверка доступности кошелька
   */
  public isAvailable(): boolean {
    return this.status === 'ACTIVE' && !this.isCompromised;
  }

  /**
   * Проверка достаточности баланса
   */
  public hasSufficientBalance(amount: number): boolean {
    return this.availableBalance >= amount;
  }

  /**
   * Резервирование средств
   */
  public async reserveBalance(amount: number): Promise<boolean> {
    if (!this.hasSufficientBalance(amount)) {
      return false;
    }

    await this.update({
      reservedBalance: this.reservedBalance + amount,
      availableBalance: this.availableBalance - amount
    });

    return true;
  }

  /**
   * Освобождение резерва
   */
  public async releaseReserve(amount: number): Promise<void> {
    const releaseAmount = Math.min(amount, this.reservedBalance);
    
    await this.update({
      reservedBalance: this.reservedBalance - releaseAmount,
      availableBalance: this.availableBalance + releaseAmount
    });
  }

  /**
   * Обновление баланса
   */
  public async updateBalance(newBalance: number, updateReserved: boolean = false): Promise<void> {
    const balanceChange = newBalance - this.balance;
    
    const updateData: Partial<WalletAttributes> = {
      balance: newBalance,
      lastBalanceCheck: new Date()
    };

    if (!updateReserved) {
      updateData.availableBalance = newBalance - this.reservedBalance;
    } else {
      updateData.availableBalance = newBalance;
      updateData.reservedBalance = 0;
    }

    // Обновляем статистику
    if (balanceChange > 0) {
      updateData.totalReceived = this.totalReceived + balanceChange;
    } else if (balanceChange < 0) {
      updateData.totalSent = this.totalSent + Math.abs(balanceChange);
    }

    await this.update(updateData);
  }

  /**
   * Отметка об использовании
   */
  public async markAsUsed(transactionHash?: string): Promise<void> {
    await this.update({
      lastUsedAt: new Date(),
      lastTransactionHash: transactionHash,
      transactionCount: this.transactionCount + 1
    });
  }

  /**
   * Отметка как скомпрометированный
   */
  public async markAsCompromised(reason: string): Promise<void> {
    await this.update({
      isCompromised: true,
      compromisedAt: new Date(),
      compromisedReason: reason,
      status: 'INACTIVE'
    });
  }

  /**
   * Проверка лимитов баланса
   */
  public checkBalanceLimits(): { 
    withinLimits: boolean; 
    belowMin: boolean; 
    aboveMax: boolean; 
  } {
    const belowMin = this.balance < this.minBalance;
    const aboveMax = this.maxBalance > 0 && this.balance > this.maxBalance;
    
    return {
      withinLimits: !belowMin && !aboveMax,
      belowMin,
      aboveMax
    };
  }

  /**
   * Получение статистики использования
   */
  public getUsageStats(): {
    totalVolume: number;
    netBalance: number;
    utilizationRate: number;
    avgTransactionSize: number;
  } {
    const totalVolume = this.totalReceived + this.totalSent;
    const netBalance = this.totalReceived - this.totalSent;
    const utilizationRate = this.maxBalance > 0 ? (this.balance / this.maxBalance) * 100 : 0;
    const avgTransactionSize = this.transactionCount > 0 ? totalVolume / this.transactionCount : 0;

    return {
      totalVolume,
      netBalance,
      utilizationRate,
      avgTransactionSize
    };
  }

  // Статические методы

  /**
   * Поиск доступных кошельков
   */
  public static async findAvailable(currency?: CurrencyType, type?: WalletType): Promise<Wallet[]> {
    const where: any = {
      status: 'ACTIVE',
      isCompromised: false
    };

    if (currency) where.currency = currency;
    if (type) where.type = type;

    return await this.findAll({
      where,
      order: [['balance', 'DESC']]
    });
  }

  /**
   * Поиск кошелька с достаточным балансом
   */
  public static async findWithSufficientBalance(
    currency: CurrencyType, 
    amount: number, 
    type?: WalletType
  ): Promise<Wallet | null> {
    const where: any = {
      currency,
      status: 'ACTIVE',
      isCompromised: false,
      availableBalance: {
        [Op.gte]: amount
      }
    };

    if (type) where.type = type;

    return await this.findOne({
      where,
      order: [['availableBalance', 'DESC']]
    });
  }

  /**
   * Получение общего баланса по валюте
   */
  public static async getTotalBalance(currency: CurrencyType): Promise<{
    total: number;
    available: number;
    reserved: number;
    byType: Record<WalletType, number>;
  }> {
    const wallets = await this.findAll({
      where: { 
        currency,
        status: 'ACTIVE',
        isCompromised: false
      }
    });

    const result = {
      total: 0,
      available: 0,
      reserved: 0,
      byType: {} as Record<WalletType, number>
    };

    wallets.forEach(wallet => {
      result.total += wallet.balance;
      result.available += wallet.availableBalance;
      result.reserved += wallet.reservedBalance;
      
      if (!result.byType[wallet.type]) {
        result.byType[wallet.type] = 0;
      }
      result.byType[wallet.type] += wallet.balance;
    });

    return result;
  }

  /**
   * Поиск неиспользуемых кошельков
   */
  public static async findUnused(hours: number = 24): Promise<Wallet[]> {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await this.findAll({
      where: {
        status: 'ACTIVE',
        isCompromised: false,
        [Op.or]: [
          Sequelize.where(Sequelize.col('lastUsedAt'), 'IS', null),
          { lastUsedAt: { [Op.lt]: cutoffDate } }
        ]
      },
      order: [['lastUsedAt', 'ASC']]
    });
  }

  /**
   * Статистика по кошелькам
   */
  public static async getStatistics(): Promise<Record<CurrencyType, any>> {
    const stats = await this.findAll({
      attributes: [
        'currency',
        'type',
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('balance')), 'totalBalance'],
        [Sequelize.fn('SUM', Sequelize.col('availableBalance')), 'availableBalance'],
        [Sequelize.fn('AVG', Sequelize.col('balance')), 'averageBalance']
      ],
      group: ['currency', 'type', 'status'],
      raw: true
    });

    const result = {} as Record<CurrencyType, any>;
    
    stats.forEach((stat: any) => {
      const currency = stat.currency as CurrencyType;
      const type = stat.type;
      const status = stat.status;
      
      if (!result[currency]) {
        result[currency] = {};
      }
      if (!result[currency][type]) {
        result[currency][type] = {};
      }
      
      result[currency][type][status] = {
        count: parseInt(stat.count),
        totalBalance: parseFloat(stat.totalBalance) || 0,
        availableBalance: parseFloat(stat.availableBalance) || 0,
        averageBalance: parseFloat(stat.averageBalance) || 0
      };
    });

    return result;
  }
}

/**
 * Инициализация модели Wallet
 */
export function initWallet(sequelize: Sequelize): typeof Wallet {
  Wallet.init(
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
      type: {
        type: DataTypes.ENUM('HOT', 'COLD', 'MULTISIG', 'POOL'),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'COMPROMISED'),
        allowNull: false,
        defaultValue: 'ACTIVE'
      },
      address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: true
        }
      },
      publicKey: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // УДАЛЕНО: encryptedPrivateKey больше не хранится в БД
      // Теперь используется keyId для ссылки на ключ в Vault
      vaultKeyId: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'ID ключа в Vault/HSM системе'
      },
      keyAlgorithm: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: 'secp256k1',
        comment: 'Алгоритм криптографического ключа'
      },
      isHSMKey: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Флаг использования HSM для данного ключа'
      },
      derivationPath: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      balance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      reservedBalance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      availableBalance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      totalReceived: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      totalSent: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      transactionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      minBalance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      maxBalance: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      isMultisig: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      requiredSignatures: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 15
        }
      },
      label: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: []
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastBalanceCheck: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastBalanceUpdate: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastTransactionHash: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      usageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 }
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      isLocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      isCompromised: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      compromisedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      compromisedReason: {
        type: DataTypes.TEXT,
        allowNull: true
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
      modelName: 'Wallet',
      tableName: 'wallets',
      timestamps: true,
      paranoid: true, // Soft delete
      indexes: [
        {
          unique: true,
          fields: ['address']
        },
        {
          fields: ['currency']
        },
        {
          fields: ['type']
        },
        {
          fields: ['status']
        },
        {
          fields: ['currency', 'type']
        },
        {
          fields: ['currency', 'status']
        },
        {
          fields: ['availableBalance']
        },
        {
          fields: ['lastUsedAt']
        },
        {
          fields: ['isCompromised']
        },
        {
          fields: ['currency', 'type', 'status']
        }
      ],
      hooks: {
        beforeCreate: (wallet: Wallet) => {
          // Инициализируем availableBalance как balance при создании
          wallet.availableBalance = wallet.balance;
        },
        beforeUpdate: (wallet: Wallet) => {
          // Обновляем availableBalance при изменении balance или reservedBalance
          if (wallet.changed('balance') || wallet.changed('reservedBalance')) {
            wallet.availableBalance = wallet.balance - wallet.reservedBalance;
          }
        }
      }
    }
  );

  return Wallet;
}

export default Wallet;