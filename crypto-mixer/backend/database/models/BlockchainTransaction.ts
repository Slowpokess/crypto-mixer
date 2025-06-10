import { DataTypes, Model, Sequelize, Optional, Op } from 'sequelize';
import { CurrencyType, TransactionStatus, TransactionInput, TransactionOutput } from '../types';

// Атрибуты модели BlockchainTransaction
export interface BlockchainTransactionAttributes {
  id: string;
  mixRequestId?: string;
  
  // Базовая информация о транзакции
  txid: string;
  currency: CurrencyType;
  status: TransactionStatus;
  type: 'INPUT' | 'OUTPUT' | 'INTERNAL';
  
  // Суммы и комиссии
  amount: number;
  fee: number;
  feeRate?: number;
  
  // Блокчейн данные
  blockHeight?: number;
  blockHash?: string;
  confirmations: number;
  requiredConfirmations: number;
  
  // Входы и выходы
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  inputsCount: number;
  outputsCount: number;
  
  // Адреса
  fromAddress?: string;
  toAddress?: string;
  
  // Временные данные
  broadcastedAt?: Date;
  confirmedAt?: Date;
  estimatedConfirmationTime?: Date;
  
  // Технические данные
  rawTransaction?: string;
  hexData?: string;
  size: number;
  vsize?: number;
  weight?: number;
  
  // Метаданные
  nonce?: number;
  gasPrice?: number;
  gasLimit?: number;
  gasUsed?: number;
  
  // Мониторинг
  lastCheckedAt?: Date;
  checkCount: number;
  errorMessage?: string;
  retryCount: number;
  
  // Системные поля
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Атрибуты для создания
export interface BlockchainTransactionCreationAttributes extends Optional<BlockchainTransactionAttributes,
  'id' | 'confirmations' | 'inputsCount' | 'outputsCount' | 'size' | 'checkCount' | 
  'retryCount' | 'createdAt' | 'updatedAt'
> {}

/**
 * Модель блокчейн транзакции
 * Отслеживание всех транзакций в блокчейне для микширования
 */
export class BlockchainTransaction extends Model<BlockchainTransactionAttributes, BlockchainTransactionCreationAttributes> 
  implements BlockchainTransactionAttributes {
  
  public id!: string;
  public mixRequestId?: string;
  
  public txid!: string;
  public currency!: CurrencyType;
  public status!: TransactionStatus;
  public type!: 'INPUT' | 'OUTPUT' | 'INTERNAL';
  
  public amount!: number;
  public fee!: number;
  public feeRate?: number;
  
  public blockHeight?: number;
  public blockHash?: string;
  public confirmations!: number;
  public requiredConfirmations!: number;
  
  public inputs!: TransactionInput[];
  public outputs!: TransactionOutput[];
  public inputsCount!: number;
  public outputsCount!: number;
  
  public fromAddress?: string;
  public toAddress?: string;
  
  public broadcastedAt?: Date;
  public confirmedAt?: Date;
  public estimatedConfirmationTime?: Date;
  
  public rawTransaction?: string;
  public hexData?: string;
  public size!: number;
  public vsize?: number;
  public weight?: number;
  
  public nonce?: number;
  public gasPrice?: number;
  public gasLimit?: number;
  public gasUsed?: number;
  
  public lastCheckedAt?: Date;
  public checkCount!: number;
  public errorMessage?: string;
  public retryCount!: number;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public readonly deletedAt?: Date;

  // Методы экземпляра

  /**
   * Проверка подтверждения транзакции
   */
  public isConfirmed(): boolean {
    return this.confirmations >= this.requiredConfirmations;
  }

  /**
   * Проверка нахождения в мемпуле
   */
  public isInMempool(): boolean {
    return this.status === 'MEMPOOL' || (this.status === 'BROADCASTING' && !this.blockHeight);
  }

  /**
   * Получение процента подтверждений
   */
  public getConfirmationProgress(): number {
    if (this.requiredConfirmations === 0) return 100;
    return Math.min((this.confirmations / this.requiredConfirmations) * 100, 100);
  }

  /**
   * Обновление количества подтверждений
   */
  public async updateConfirmations(confirmations: number, blockHeight?: number, blockHash?: string): Promise<void> {
    const updateData: Partial<BlockchainTransactionAttributes> = {
      confirmations,
      lastCheckedAt: new Date(),
      checkCount: this.checkCount + 1
    };

    if (blockHeight) {
      updateData.blockHeight = blockHeight;
    }

    if (blockHash) {
      updateData.blockHash = blockHash;
    }

    // Обновляем статус в зависимости от подтверждений
    if (confirmations >= this.requiredConfirmations && this.status !== 'CONFIRMED') {
      updateData.status = 'CONFIRMED';
      updateData.confirmedAt = new Date();
    } else if (confirmations > 0 && this.status === 'MEMPOOL') {
      updateData.status = 'PENDING';
    }

    await this.update(updateData);
  }

  /**
   * Отметка об ошибке
   */
  public async markAsFailed(errorMessage: string): Promise<void> {
    await this.update({
      status: 'FAILED',
      errorMessage,
      retryCount: this.retryCount + 1,
      lastCheckedAt: new Date()
    });
  }

  /**
   * Отметка о трансляции
   */
  public async markAsBroadcasted(): Promise<void> {
    await this.update({
      status: 'BROADCASTING',
      broadcastedAt: new Date()
    });
  }

  /**
   * Получение эффективности комиссии
   */
  public getFeeEfficiency(): number {
    if (!this.feeRate || this.size === 0) return 0;
    return this.fee / this.size; // сатоши за байт или wei за газ
  }

  /**
   * Расчет времени до подтверждения
   */
  public getEstimatedConfirmationTime(): Date | null {
    if (this.isConfirmed()) return null;
    
    const avgBlockTime = this.getAverageBlockTime();
    const remainingConfirmations = this.requiredConfirmations - this.confirmations;
    const estimatedMs = remainingConfirmations * avgBlockTime * 1000;
    
    return new Date(Date.now() + estimatedMs);
  }

  /**
   * Получение среднего времени блока для валюты
   */
  private getAverageBlockTime(): number {
    const blockTimes: Record<CurrencyType, number> = {
      'BTC': 600,   // 10 минут
      'ETH': 13,    // 13 секунд
      'USDT': 13,   // На Ethereum
      'SOL': 0.4,   // 400ms
      'LTC': 150,   // 2.5 минуты
      'DASH': 157,  // ~2.6 минуты
      'ZEC': 150    // 2.5 минуты
    };
    
    return blockTimes[this.currency] || 600;
  }

  /**
   * Получение всех адресов транзакции
   */
  public getAllAddresses(): string[] {
    const addresses = new Set<string>();
    
    this.inputs.forEach(input => {
      if (input.address) addresses.add(input.address);
    });
    
    this.outputs.forEach(output => {
      if (output.address) addresses.add(output.address);
    });
    
    return Array.from(addresses);
  }

  /**
   * Проверка принадлежности адреса к транзакции
   */
  public containsAddress(address: string): boolean {
    return this.getAllAddresses().includes(address);
  }

  /**
   * Получение суммы для конкретного адреса
   */
  public getAmountForAddress(address: string): { received: number; sent: number } {
    let received = 0;
    let sent = 0;

    this.outputs.forEach(output => {
      if (output.address === address) {
        received += output.amount;
      }
    });

    this.inputs.forEach(input => {
      if (input.address === address) {
        sent += input.amount;
      }
    });

    return { received, sent };
  }

  // Статические методы

  /**
   * Поиск по txid
   */
  public static async findByTxid(txid: string): Promise<BlockchainTransaction | null> {
    return await this.findOne({ where: { txid } });
  }

  /**
   * Поиск неподтвержденных транзакций
   */
  public static async findUnconfirmed(currency?: CurrencyType): Promise<BlockchainTransaction[]> {
    const where: any = {
      [Op.or]: [
        { status: 'PENDING' },
        { status: 'MEMPOOL' },
        { status: 'BROADCASTING' }
      ]
    };

    if (currency) where.currency = currency;

    return await this.findAll({
      where,
      order: [['createdAt', 'ASC']]
    });
  }

  /**
   * Поиск транзакций для мониторинга
   */
  public static async findForMonitoring(limit: number = 100): Promise<BlockchainTransaction[]> {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 минут назад
    
    // Расширенная логика мониторинга с правильной типизацией
    const whereCondition: any = {
      status: {
        [Op.in]: ['PENDING', 'MEMPOOL', 'BROADCASTING']
      },
      [Op.or]: [
        { lastCheckedAt: { [Op.is]: null } },
        { lastCheckedAt: { [Op.lt]: cutoffTime } }
      ]
    };

    return await this.findAll({
      where: whereCondition,
      order: [['lastCheckedAt', 'ASC']],
      limit,
      // Дополнительная логика для оптимизации запроса
      attributes: {
        include: [
          // Добавляем вычисляемое поле времени ожидания
          [
            Sequelize.literal(`EXTRACT(EPOCH FROM (NOW() - "lastCheckedAt"))`),
            'waitingTime'
          ]
        ]
      }
    });
  }

  /**
   * Поиск по адресу
   */
  public static async findByAddress(address: string, currency?: CurrencyType): Promise<BlockchainTransaction[]> {
    const where: any = {};
    if (currency) where.currency = currency;

    return await this.findAll({
      where: {
        ...where,
        [Op.or]: [
          { fromAddress: address },
          { toAddress: address },
          {
            [Op.or]: [
              Sequelize.literal(`inputs @> '[{"address": "${address}"}]'`),
              Sequelize.literal(`outputs @> '[{"address": "${address}"}]'`)
            ]
          }
        ]
      },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Статистика по транзакциям
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
        [Sequelize.fn('AVG', Sequelize.col('confirmations')), 'avgConfirmations']
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
        avgConfirmations: parseFloat(stat.avgConfirmations) || 0
      };
    });

    return result;
  }

  /**
   * Очистка старых транзакций
   */
  public static async cleanupOld(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await this.destroy({
      where: {
        status: 'CONFIRMED',
        confirmedAt: {
          [Op.lt]: cutoffDate
        }
      }
    });

    return result;
  }
}

/**
 * Инициализация модели BlockchainTransaction
 */
export function initBlockchainTransaction(sequelize: Sequelize): typeof BlockchainTransaction {
  BlockchainTransaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      mixRequestId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'mix_requests',
          key: 'id'
        }
      },
      txid: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      currency: {
        type: DataTypes.ENUM('BTC', 'ETH', 'USDT', 'SOL'),
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      type: {
        type: DataTypes.ENUM('INPUT', 'OUTPUT', 'INTERNAL'),
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
      feeRate: {
        type: DataTypes.DECIMAL(20, 8),
        allowNull: true
      },
      blockHeight: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0
        }
      },
      blockHash: {
        type: DataTypes.STRING(100),
        allowNull: true
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
      inputs: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      outputs: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      },
      inputsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      outputsCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      fromAddress: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      toAddress: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      broadcastedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      confirmedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      estimatedConfirmationTime: {
        type: DataTypes.DATE,
        allowNull: true
      },
      rawTransaction: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      hexData: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      vsize: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      weight: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      nonce: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      gasPrice: {
        type: DataTypes.DECIMAL(30, 0),
        allowNull: true
      },
      gasLimit: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      gasUsed: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      lastCheckedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      checkCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      retryCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
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
      modelName: 'BlockchainTransaction',
      tableName: 'blockchain_transactions',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['txid', 'currency']
        },
        {
          fields: ['mixRequestId']
        },
        {
          fields: ['currency']
        },
        {
          fields: ['status']
        },
        {
          fields: ['type']
        },
        {
          fields: ['blockHeight']
        },
        {
          fields: ['confirmations']
        },
        {
          fields: ['fromAddress']
        },
        {
          fields: ['toAddress']
        },
        {
          fields: ['lastCheckedAt']
        },
        {
          fields: ['currency', 'status']
        },
        {
          fields: ['status', 'lastCheckedAt']
        },
        {
          using: 'gin',
          fields: ['inputs']
        },
        {
          using: 'gin',
          fields: ['outputs']
        }
      ],
      hooks: {
        beforeCreate: (transaction: BlockchainTransaction) => {
          transaction.inputsCount = transaction.inputs.length;
          transaction.outputsCount = transaction.outputs.length;
        },
        beforeUpdate: (transaction: BlockchainTransaction) => {
          if (transaction.changed('inputs')) {
            transaction.inputsCount = transaction.inputs.length;
          }
          if (transaction.changed('outputs')) {
            transaction.outputsCount = transaction.outputs.length;
          }
        }
      }
    }
  );

  return BlockchainTransaction;
}

export default BlockchainTransaction;