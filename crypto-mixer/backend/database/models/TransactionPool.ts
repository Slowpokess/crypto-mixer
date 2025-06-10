import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType } from '../types';

// Атрибуты модели TransactionPool
export interface TransactionPoolAttributes {
  id: string;
  currency: CurrencyType;
  name: string;
  
  // Конфигурация пула
  minAmount: number;
  maxAmount: number;
  targetAmount: number;
  feePercentage: number;
  
  // Текущее состояние
  currentAmount: number;
  participantsCount: number;
  maxParticipants: number;
  minParticipants: number;
  
  // Статус пула
  isActive: boolean;
  isLocked: boolean;
  status: 'WAITING' | 'FILLING' | 'READY' | 'MIXING' | 'COMPLETED' | 'CANCELLED';
  
  // Временные параметры
  createdAt: Date;
  startedAt?: Date;
  lockedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  
  // Параметры микширования
  mixingRounds: number;
  completedRounds: number;
  anonymitySet: number;
  shuffleIterations: number;
  
  // Метаданные
  description?: string;
  priority: number;
  tags?: string[];
  
  // Статистика
  totalMixed: number;
  averageAmount: number;
  successRate: number;
  
  // Системные поля
  updatedAt: Date;
  deletedAt?: Date;
}

// Атрибуты для создания
export interface TransactionPoolCreationAttributes extends Optional<TransactionPoolAttributes,
  'id' | 'currentAmount' | 'participantsCount' | 'isLocked' | 'status' | 'mixingRounds' |
  'completedRounds' | 'anonymitySet' | 'shuffleIterations' | 'priority' | 'totalMixed' |
  'averageAmount' | 'successRate' | 'createdAt' | 'updatedAt' | 'startedAt' | 'lockedAt' | 
  'completedAt' | 'expiresAt' | 'description' | 'tags' | 'feePercentage' | 'minAmount' |
  'maxAmount' | 'targetAmount' | 'maxParticipants' | 'minParticipants' | 'isActive'
> {}

/**
 * Модель пула транзакций
 * Управление пулами для коллективного микширования
 */
export class TransactionPool extends Model<TransactionPoolAttributes, TransactionPoolCreationAttributes> 
  implements TransactionPoolAttributes {
  
  public id!: string;
  public currency!: CurrencyType;
  public name!: string;
  
  public minAmount!: number;
  public maxAmount!: number;
  public targetAmount!: number;
  public feePercentage!: number;
  
  public currentAmount!: number;
  public participantsCount!: number;
  public maxParticipants!: number;
  public minParticipants!: number;
  
  public isActive!: boolean;
  public isLocked!: boolean;
  public status!: 'WAITING' | 'FILLING' | 'READY' | 'MIXING' | 'COMPLETED' | 'CANCELLED';
  
  public readonly createdAt!: Date;
  public startedAt?: Date;
  public lockedAt?: Date;
  public completedAt?: Date;
  public expiresAt?: Date;
  
  public mixingRounds!: number;
  public completedRounds!: number;
  public anonymitySet!: number;
  public shuffleIterations!: number;
  
  public description?: string;
  public priority!: number;
  public tags?: string[];
  
  public totalMixed!: number;
  public averageAmount!: number;
  public successRate!: number;
  
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  // Методы экземпляра

  /**
   * Проверка готовности к микшированию
   */
  public isReadyForMixing(): boolean {
    return this.participantsCount >= this.minParticipants && 
           this.currentAmount >= this.targetAmount &&
           this.isActive && !this.isLocked;
  }

  /**
   * Проверка возможности добавления участника
   */
  public canAddParticipant(amount: number): boolean {
    if (!this.isActive || this.isLocked) return false;
    if (this.participantsCount >= this.maxParticipants) return false;
    if (amount < this.minAmount || amount > this.maxAmount) return false;
    if (this.currentAmount + amount > this.targetAmount * 1.1) return false;
    
    return true;
  }

  /**
   * Добавление участника в пул
   */
  public async addParticipant(amount: number): Promise<boolean> {
    if (!this.canAddParticipant(amount)) {
      return false;
    }

    const updateData: Partial<TransactionPoolAttributes> = {
      currentAmount: this.currentAmount + amount,
      participantsCount: this.participantsCount + 1,
      averageAmount: (this.currentAmount + amount) / (this.participantsCount + 1)
    };

    // Проверяем, достиг ли пул целевой суммы
    if (updateData.currentAmount! >= this.targetAmount) {
      updateData.status = 'READY';
    } else if (this.status === 'WAITING') {
      updateData.status = 'FILLING';
    }

    await this.update(updateData);
    return true;
  }

  /**
   * Удаление участника из пула
   */
  public async removeParticipant(amount: number): Promise<boolean> {
    if (this.isLocked || this.participantsCount === 0) {
      return false;
    }

    const newAmount = Math.max(0, this.currentAmount - amount);
    const newCount = Math.max(0, this.participantsCount - 1);

    const updateData: Partial<TransactionPoolAttributes> = {
      currentAmount: newAmount,
      participantsCount: newCount,
      averageAmount: newCount > 0 ? newAmount / newCount : 0
    };

    // Обновляем статус в зависимости от нового состояния
    if (newCount === 0) {
      updateData.status = 'WAITING';
    } else if (newAmount < this.targetAmount) {
      updateData.status = 'FILLING';
    }

    await this.update(updateData);
    return true;
  }

  /**
   * Блокировка пула для микширования
   */
  public async lockForMixing(): Promise<void> {
    await this.update({
      isLocked: true,
      status: 'MIXING',
      lockedAt: new Date(),
      startedAt: this.startedAt || new Date()
    });
  }

  /**
   * Разблокировка пула
   */
  public async unlock(): Promise<void> {
    await this.update({
      isLocked: false,
      status: this.isReadyForMixing() ? 'READY' : 'FILLING'
    });
  }

  /**
   * Завершение микширования
   */
  public async completeMixing(successful: boolean = true): Promise<void> {
    const updateData: Partial<TransactionPoolAttributes> = {
      status: successful ? 'COMPLETED' : 'CANCELLED',
      completedAt: new Date(),
      isLocked: false,
      completedRounds: this.mixingRounds
    };

    if (successful) {
      updateData.totalMixed = this.totalMixed + this.currentAmount;
      // Обновляем статистику успешности
      const totalAttempts = this.totalMixed > 0 ? 
        Math.ceil(this.totalMixed / this.targetAmount) + 1 : 1;
      updateData.successRate = ((totalAttempts - 1) * this.successRate + (successful ? 100 : 0)) / totalAttempts;
    }

    await this.update(updateData);
  }

  /**
   * Сброс пула для повторного использования
   */
  public async reset(): Promise<void> {
    await this.update({
      currentAmount: 0,
      participantsCount: 0,
      status: 'WAITING',
      isLocked: false,
      completedRounds: 0,
      startedAt: undefined,
      lockedAt: undefined,
      completedAt: undefined,
      averageAmount: 0
    });
  }

  /**
   * Получение статистики эффективности
   */
  public getEfficiencyStats(): {
    utilizationRate: number;
    fillRate: number;
    avgTimeToFill: number;
    mixingEfficiency: number;
  } {
    const utilizationRate = this.targetAmount > 0 ? (this.currentAmount / this.targetAmount) * 100 : 0;
    const fillRate = this.maxParticipants > 0 ? (this.participantsCount / this.maxParticipants) * 100 : 0;
    
    // Время до заполнения (приблизительное)
    const avgTimeToFill = this.startedAt ? 
      (Date.now() - this.startedAt.getTime()) / (1000 * 60) : 0; // в минутах
    
    const mixingEfficiency = this.mixingRounds > 0 ? 
      (this.completedRounds / this.mixingRounds) * 100 : 0;

    return {
      utilizationRate,
      fillRate,
      avgTimeToFill,
      mixingEfficiency
    };
  }

  /**
   * Проверка истечения срока
   */
  public isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  /**
   * Расчет общей комиссии пула
   */
  public getTotalFee(): number {
    return this.currentAmount * this.feePercentage / 100;
  }

  // Статические методы

  /**
   * Поиск активных пулов
   */
  public static async findActive(currency?: CurrencyType): Promise<TransactionPool[]> {
    const where: any = {
      isActive: true,
      status: ['WAITING', 'FILLING', 'READY']
    };

    if (currency) where.currency = currency;

    return await this.findAll({
      where,
      order: [['priority', 'DESC'], ['createdAt', 'ASC']]
    });
  }

  /**
   * Поиск пулов готовых к микшированию
   */
  public static async findReadyForMixing(currency?: CurrencyType): Promise<TransactionPool[]> {
    const where: any = {
      isActive: true,
      isLocked: false,
      status: 'READY'
    };

    if (currency) where.currency = currency;

    return await this.findAll({
      where,
      order: [['priority', 'DESC'], ['currentAmount', 'DESC']]
    });
  }

  /**
   * Поиск подходящего пула для суммы
   */
  public static async findSuitablePool(
    currency: CurrencyType, 
    amount: number
  ): Promise<TransactionPool | null> {
    return await this.findOne({
      where: {
        currency,
        isActive: true,
        isLocked: false,
        status: ['WAITING', 'FILLING'],
        minAmount: { [Op.lte]: amount },
        maxAmount: { [Op.gte]: amount },
        [Op.and]: [
          Sequelize.literal(`participants_count < max_participants`),
          Sequelize.literal(`current_amount + ${amount} <= target_amount * 1.1`)
        ]
      },
      order: [
        ['priority', 'DESC'],
        ['current_amount', 'DESC'], // Предпочитаем более заполненные пулы
        ['created_at', 'ASC']
      ]
    });
  }

  /**
   * Статистика по пулам
   */
  public static async getStatistics(currency?: CurrencyType): Promise<any> {
    const where: any = {};
    if (currency) where.currency = currency;

    const stats = await this.findAll({
      attributes: [
        'currency',
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('currentAmount')), 'totalAmount'],
        [Sequelize.fn('SUM', Sequelize.col('participantsCount')), 'totalParticipants'],
        [Sequelize.fn('AVG', Sequelize.col('averageAmount')), 'avgAmount'],
        [Sequelize.fn('AVG', Sequelize.col('successRate')), 'avgSuccessRate']
      ],
      where,
      group: ['currency', 'status'],
      raw: true
    });

    const result: any = {};
    stats.forEach((stat: any) => {
      if (!result[stat.currency]) {
        result[stat.currency] = {};
      }
      
      result[stat.currency][stat.status] = {
        count: parseInt(stat.count),
        totalAmount: parseFloat(stat.totalAmount) || 0,
        totalParticipants: parseInt(stat.totalParticipants) || 0,
        avgAmount: parseFloat(stat.avgAmount) || 0,
        avgSuccessRate: parseFloat(stat.avgSuccessRate) || 0
      };
    });

    return result;
  }

  /**
   * Очистка завершенных пулов
   */
  public static async cleanupCompleted(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await this.destroy({
      where: {
        status: ['COMPLETED', 'CANCELLED'],
        completedAt: {
          [Op.lt]: cutoffDate
        }
      }
    });

    return result;
  }

  /**
   * Автоматическое создание пулов для валют
   */
  public static async createDefaultPools(): Promise<TransactionPool[]> {
    const currencies: CurrencyType[] = ['BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'DASH', 'ZEC'];
    const pools: TransactionPool[] = [];

    for (const currency of currencies) {
      // Проверяем, есть ли уже активные пулы для этой валюты
      const existingPools = await this.findActive(currency);
      
      if (existingPools.length === 0) {
        const poolConfig = this.getDefaultPoolConfig(currency);
        const pool = await this.create(poolConfig);
        pools.push(pool);
      }
    }

    return pools;
  }

  /**
   * Получение конфигурации пула по умолчанию
   */
  private static getDefaultPoolConfig(currency: CurrencyType): TransactionPoolCreationAttributes {
    const configs: Record<CurrencyType, Partial<TransactionPoolCreationAttributes>> = {
      BTC: {
        minAmount: 0.001,
        maxAmount: 1.0,
        targetAmount: 5.0,
        maxParticipants: 20,
        minParticipants: 5,
        feePercentage: 0.5
      },
      ETH: {
        minAmount: 0.01,
        maxAmount: 10.0,
        targetAmount: 50.0,
        maxParticipants: 25,
        minParticipants: 5,
        feePercentage: 0.3
      },
      USDT: {
        minAmount: 10,
        maxAmount: 10000,
        targetAmount: 50000,
        maxParticipants: 30,
        minParticipants: 5,
        feePercentage: 0.2
      },
      SOL: {
        minAmount: 0.1,
        maxAmount: 100,
        targetAmount: 500,
        maxParticipants: 20,
        minParticipants: 5,
        feePercentage: 0.4
      },
      LTC: {
        minAmount: 0.01,
        maxAmount: 100,
        targetAmount: 300,
        maxParticipants: 20,
        minParticipants: 5,
        feePercentage: 0.3 // Низкая комиссия, как у ETH
      },
      DASH: {
        minAmount: 0.01,
        maxAmount: 100,
        targetAmount: 250,
        maxParticipants: 18,
        minParticipants: 4,
        feePercentage: 0.25 // Еще ниже благодаря InstantSend
      },
      ZEC: {
        minAmount: 0.001,
        maxAmount: 50,
        targetAmount: 150,
        maxParticipants: 15,
        minParticipants: 6, // Больше для лучшей анонимности с shielded транзакциями
        feePercentage: 0.6 // Выше из-за дополнительной обработки privacy features
      }
    };

    const config = configs[currency];
    
    return {
      currency,
      name: `${currency} Default Pool`,
      isActive: true,
      mixingRounds: 3,
      shuffleIterations: 5,
      anonymitySet: 10,
      priority: 1,
      ...config
    };
  }
}

/**
 * Инициализация модели TransactionPool
 */
export function initTransactionPool(sequelize: Sequelize): typeof TransactionPool {
  TransactionPool.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL', 'LTC', 'DASH', 'ZEC'),
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      minAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      maxAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      targetAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
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
      currentAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      participantsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      maxParticipants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 1000
        }
      },
      minParticipants: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 100
        }
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
      status: {
        type: DataTypes.ENUM('WAITING', 'FILLING', 'READY', 'MIXING', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'WAITING'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lockedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      mixingRounds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        validate: {
          min: 1,
          max: 10
        }
      },
      completedRounds: {
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
        defaultValue: 10,
        validate: {
          min: 3,
          max: 1000
        }
      },
      shuffleIterations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        validate: {
          min: 1,
          max: 20
        }
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
          max: 10
        }
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: []
      },
      totalMixed: {
        type: DataTypes.DECIMAL(30, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      averageAmount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      successRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 100
        }
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
      modelName: 'TransactionPool',
      tableName: 'transaction_pools',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          fields: ['currency']
        },
        {
          fields: ['status']
        },
        {
          fields: ['isActive']
        },
        {
          fields: ['isLocked']
        },
        {
          fields: ['priority']
        },
        {
          fields: ['currency', 'status']
        },
        {
          fields: ['currency', 'isActive', 'status']
        },
        {
          fields: ['minAmount', 'maxAmount']
        },
        {
          fields: ['currentAmount']
        },
        {
          fields: ['participantsCount']
        },
        {
          fields: ['expiresAt']
        }
      ],
      validate: {
        validAmountRange(this: TransactionPool) {
          if (this.minAmount >= this.maxAmount) {
            throw new Error('minAmount должен быть меньше maxAmount');
          }
          if (this.targetAmount < this.maxAmount) {
            throw new Error('targetAmount должен быть больше или равен maxAmount');
          }
        },
        validParticipantsRange(this: TransactionPool) {
          if (this.minParticipants >= this.maxParticipants) {
            throw new Error('minParticipants должен быть меньше maxParticipants');
          }
        }
      }
    }
  );

  return TransactionPool;
}

export default TransactionPool;