import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType, TransactionStatus } from '../types';

// Атрибуты модели OutputTransaction
export interface OutputTransactionAttributes {
  id: string;
  mixRequestId: string;
  blockchainTransactionId?: string;
  
  // Базовая информация
  currency: CurrencyType;
  amount: number;
  fee: number;
  status: TransactionStatus;
  
  // Адреса
  fromAddress: string;
  toAddress: string;
  
  // Временные параметры
  scheduledAt: Date;
  delayMinutes: number;
  processedAt?: Date;
  
  // Данные транзакции
  txid?: string;
  blockHeight?: number;
  confirmations: number;
  requiredConfirmations: number;
  
  // Мета-информация
  outputIndex: number;
  totalOutputs: number;
  percentage: number;
  
  // Приоритет и обработка
  priority: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  
  // Безопасность
  isAnonymized: boolean;
  mixingRounds: number;
  anonymitySet: number;
  
  // Системные поля
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Атрибуты для создания
export interface OutputTransactionCreationAttributes extends Optional<OutputTransactionAttributes,
  'id' | 'confirmations' | 'outputIndex' | 'totalOutputs' | 'priority' | 'retryCount' |
  'maxRetries' | 'isAnonymized' | 'mixingRounds' | 'anonymitySet' | 'createdAt' | 'updatedAt'
> {}

/**
 * Модель исходящей транзакции
 * Управление выводом средств после микширования
 */
export class OutputTransaction extends Model<OutputTransactionAttributes, OutputTransactionCreationAttributes> 
  implements OutputTransactionAttributes {
  
  public id!: string;
  public mixRequestId!: string;
  public blockchainTransactionId?: string;
  
  public currency!: CurrencyType;
  public amount!: number;
  public fee!: number;
  public status!: TransactionStatus;
  
  public fromAddress!: string;
  public toAddress!: string;
  
  public scheduledAt!: Date;
  public delayMinutes!: number;
  public processedAt?: Date;
  
  public txid?: string;
  public blockHeight?: number;
  public confirmations!: number;
  public requiredConfirmations!: number;
  
  public outputIndex!: number;
  public totalOutputs!: number;
  public percentage!: number;
  
  public priority!: number;
  public retryCount!: number;
  public maxRetries!: number;
  public errorMessage?: string;
  
  public isAnonymized!: boolean;
  public mixingRounds!: number;
  public anonymitySet!: number;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  // Методы экземпляра

  /**
   * Проверка готовности к обработке
   */
  public isReadyForProcessing(): boolean {
    return new Date() >= this.scheduledAt && 
           this.status === 'PENDING' && 
           this.retryCount < this.maxRetries;
  }

  /**
   * Проверка подтверждения транзакции
   */
  public isConfirmed(): boolean {
    return this.confirmations >= this.requiredConfirmations && this.status === 'CONFIRMED';
  }

  /**
   * Проверка возможности повтора
   */
  public canRetry(): boolean {
    return this.retryCount < this.maxRetries && 
           ['FAILED', 'PENDING'].includes(this.status);
  }

  /**
   * Обновление статуса обработки
   */
  public async updateProcessingStatus(
    status: TransactionStatus, 
    txid?: string, 
    errorMessage?: string
  ): Promise<void> {
    const updateData: Partial<OutputTransactionAttributes> = {
      status,
      processedAt: new Date()
    };

    if (txid) {
      updateData.txid = txid;
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
      updateData.retryCount = this.retryCount + 1;
    }

    await this.update(updateData);
  }

  /**
   * Обновление подтверждений
   */
  public async updateConfirmations(confirmations: number, blockHeight?: number): Promise<void> {
    const updateData: Partial<OutputTransactionAttributes> = {
      confirmations
    };

    if (blockHeight) {
      updateData.blockHeight = blockHeight;
    }

    if (confirmations >= this.requiredConfirmations && this.status !== 'CONFIRMED') {
      updateData.status = 'CONFIRMED';
    }

    await this.update(updateData);
  }

  /**
   * Отметка неудачи с увеличением счетчика повторов
   */
  public async markAsFailed(errorMessage: string): Promise<void> {
    await this.update({
      status: 'FAILED',
      errorMessage,
      retryCount: this.retryCount + 1
    });
  }

  /**
   * Повторная обработка
   */
  public async retry(delayMinutes: number = 5): Promise<void> {
    if (!this.canRetry()) {
      throw new Error('Нельзя повторить обработку: достигнут лимит попыток');
    }

    const newScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    await this.update({
      status: 'PENDING',
      scheduledAt: newScheduledAt,
      errorMessage: undefined,
      retryCount: this.retryCount + 1
    });
  }

  /**
   * Расчет времени ожидания
   */
  public getTimeUntilProcessing(): number {
    const now = Date.now();
    const scheduledTime = this.scheduledAt.getTime();
    return Math.max(0, scheduledTime - now);
  }

  /**
   * Получение процента завершения
   */
  public getCompletionPercentage(): number {
    if (this.status === 'CONFIRMED') return 100;
    if (this.status === 'FAILED') return 0;
    if (this.confirmations === 0) return 10;
    
    return Math.min(90, 10 + (this.confirmations / this.requiredConfirmations) * 80);
  }

  /**
   * Проверка просроченности
   */
  public isOverdue(maxDelayHours: number = 24): boolean {
    const maxTime = this.scheduledAt.getTime() + maxDelayHours * 60 * 60 * 1000;
    return Date.now() > maxTime && !['CONFIRMED', 'FAILED'].includes(this.status);
  }

  /**
   * Получение эффективной комиссии
   */
  public getEffectiveFeeRate(): number {
    return this.amount > 0 ? (this.fee / this.amount) * 100 : 0;
  }

  // Статические методы

  /**
   * Поиск транзакций готовых к обработке
   */
  public static async findReadyForProcessing(limit: number = 50): Promise<OutputTransaction[]> {
    return await this.findAll({
      where: {
        status: 'PENDING',
        scheduledAt: {
          [Op.lte]: new Date()
        },
        retryCount: {
          [Op.lt]: Sequelize.col('maxRetries')
        }
      },
      order: [
        ['priority', 'DESC'],
        ['scheduledAt', 'ASC']
      ],
      limit
    });
  }

  /**
   * Поиск по запросу микширования
   */
  public static async findByMixRequest(mixRequestId: string): Promise<OutputTransaction[]> {
    return await this.findAll({
      where: { mixRequestId },
      order: [['outputIndex', 'ASC']]
    });
  }

  /**
   * Поиск неподтвержденных транзакций для мониторинга
   */
  public static async findUnconfirmed(currency?: CurrencyType): Promise<OutputTransaction[]> {
    const where: any = {
      status: ['PENDING', 'BROADCASTING', 'MEMPOOL'],
      txid: {
        [Op.ne]: null
      }
    };

    if (currency) where.currency = currency;

    return await this.findAll({
      where,
      order: [['processedAt', 'ASC']]
    });
  }

  /**
   * Поиск просроченных транзакций
   */
  public static async findOverdue(maxDelayHours: number = 24): Promise<OutputTransaction[]> {
    const cutoffTime = new Date(Date.now() - maxDelayHours * 60 * 60 * 1000);
    
    return await this.findAll({
      where: {
        scheduledAt: {
          [Op.lt]: cutoffTime
        },
        status: ['PENDING', 'BROADCASTING']
      },
      order: [['scheduledAt', 'ASC']]
    });
  }

  /**
   * Поиск неудачных транзакций для повтора
   */
  public static async findForRetry(): Promise<OutputTransaction[]> {
    return await this.findAll({
      where: {
        status: 'FAILED',
        retryCount: {
          [Op.lt]: Sequelize.col('maxRetries')
        }
      },
      order: [['retryCount', 'ASC'], ['updatedAt', 'ASC']]
    });
  }

  /**
   * Статистика по исходящим транзакциям
   */
  public static async getStatistics(currency?: CurrencyType): Promise<any> {
    const where: any = {};
    if (currency) where.currency = currency;

    const stats = await this.findAll({
      attributes: [
        'currency',
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalAmount'],
        [Sequelize.fn('SUM', Sequelize.col('fee')), 'totalFee'],
        [Sequelize.fn('AVG', Sequelize.col('delayMinutes')), 'avgDelay'],
        [Sequelize.fn('AVG', Sequelize.col('retryCount')), 'avgRetries']
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
        totalFee: parseFloat(stat.totalFee) || 0,
        avgDelay: parseFloat(stat.avgDelay) || 0,
        avgRetries: parseFloat(stat.avgRetries) || 0
      };
    });

    return result;
  }

  /**
   * Групповое обновление статуса для запроса микширования
   */
  public static async updateStatusForMixRequest(
    mixRequestId: string, 
    status: TransactionStatus
  ): Promise<number> {
    const [updatedCount] = await this.update(
      { status },
      { 
        where: { mixRequestId },
        returning: false
      }
    );

    return updatedCount;
  }

  /**
   * Получение общей статистики успешности
   */
  public static async getSuccessRate(timeFrame: 'day' | 'week' | 'month' = 'day'): Promise<{
    successRate: number;
    totalProcessed: number;
    successful: number;
    failed: number;
  }> {
    const hours = timeFrame === 'day' ? 24 : (timeFrame === 'week' ? 168 : 720);
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await this.findAll({
      attributes: [
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: {
        processedAt: {
          [Op.gte]: cutoffTime
        },
        status: ['CONFIRMED', 'FAILED']
      },
      group: ['status'],
      raw: true
    });

    let successful = 0;
    let failed = 0;

    stats.forEach((stat: any) => {
      const count = parseInt(stat.count);
      if (stat.status === 'CONFIRMED') {
        successful = count;
      } else if (stat.status === 'FAILED') {
        failed = count;
      }
    });

    const totalProcessed = successful + failed;
    const successRate = totalProcessed > 0 ? (successful / totalProcessed) * 100 : 0;

    return {
      successRate,
      totalProcessed,
      successful,
      failed
    };
  }

  /**
   * Очистка старых записей
   */
  public static async cleanupOld(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await this.destroy({
      where: {
        status: 'CONFIRMED',
        processedAt: {
          [Op.lt]: cutoffDate
        }
      }
    });

    return result;
  }
}

/**
 * Инициализация модели OutputTransaction
 */
export function initOutputTransaction(sequelize: Sequelize): typeof OutputTransaction {
  OutputTransaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      mixRequestId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'mix_requests',
          key: 'id'
        }
      },
      blockchainTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'blockchain_transactions',
          key: 'id'
        }
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      fee: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: false,
        validate: {
          min: 0,
          isDecimal: true
        }
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      fromAddress: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      toAddress: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      delayMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0,
          max: 10080 // максимум неделя
        }
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      txid: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      blockHeight: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0
        }
      },
      confirmations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      requiredConfirmations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 100
        }
      },
      outputIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      totalOutputs: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1
        }
      },
      percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 0,
          max: 100
        }
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
      retryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      maxRetries: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        validate: {
          min: 0,
          max: 10
        }
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isAnonymized: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      mixingRounds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
          max: 10
        }
      },
      anonymitySet: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
          max: 1000
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
      modelName: 'OutputTransaction',
      tableName: 'output_transactions',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          fields: ['mixRequestId']
        },
        {
          fields: ['blockchainTransactionId']
        },
        {
          fields: ['currency']
        },
        {
          fields: ['status']
        },
        {
          fields: ['txid']
        },
        {
          fields: ['fromAddress']
        },
        {
          fields: ['toAddress']
        },
        {
          fields: ['scheduledAt']
        },
        {
          fields: ['processedAt']
        },
        {
          fields: ['status', 'scheduledAt']
        },
        {
          fields: ['currency', 'status']
        },
        {
          fields: ['mixRequestId', 'outputIndex']
        },
        {
          fields: ['priority', 'scheduledAt']
        },
        {
          fields: ['retryCount', 'maxRetries']
        }
      ],
      hooks: {
        beforeCreate: (outputTransaction: OutputTransaction) => {
          // Устанавливаем время обработки с учетом задержки
          const scheduledTime = new Date(outputTransaction.createdAt);
          scheduledTime.setMinutes(scheduledTime.getMinutes() + outputTransaction.delayMinutes);
          outputTransaction.scheduledAt = scheduledTime;
        }
      }
    }
  );

  return OutputTransaction;
}

export default OutputTransaction;