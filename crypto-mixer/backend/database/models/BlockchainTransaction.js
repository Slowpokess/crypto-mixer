/**
 * Модель BlockchainTransaction - журнал всех блокчейн транзакций
 * Партиционированная таблица для хранения больших объемов транзакционных данных
 */

module.exports = (sequelize, DataTypes) => {
  const BlockchainTransaction = sequelize.define('BlockchainTransaction', {
    // Уникальный идентификатор записи
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор записи транзакции'
    },
    
    // Тип криптовалюты
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты транзакции'
    },
    
    // Хеш транзакции
    tx_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [32, 128]
      },
      comment: 'Хеш транзакции в блокчейне'
    },
    
    // Адрес отправителя
    from_address: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'Адрес отправителя транзакции'
    },
    
    // Адрес получателя
    to_address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      validate: {
        notEmpty: true
      },
      comment: 'Адрес получателя транзакции'
    },
    
    // Сумма транзакции
    amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Сумма транзакции в наименьших единицах валюты'
    },
    
    // Комиссия транзакции
    fee: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Комиссия за транзакцию'
    },
    
    // Количество подтверждений
    confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Количество подтверждений транзакции'
    },
    
    // Номер блока
    block_number: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Номер блока содержащего транзакцию'
    },
    
    // Хеш блока
    block_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'Хеш блока содержащего транзакцию'
    },
    
    // Время подтверждения транзакции
    confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время подтверждения транзакции в блокчейне'
    },
    
    // Статус транзакции
    status: {
      type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'FAILED', 'DROPPED'),
      allowNull: false,
      defaultValue: 'PENDING',
      comment: 'Статус транзакции в блокчейне'
    },
    
    // Позиция в блоке
    transaction_index: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Позиция транзакции в блоке'
    },
    
    // Nonce (для Ethereum-подобных сетей)
    nonce: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Nonce транзакции (для Ethereum и подобных)'
    },
    
    // Gas price (для Ethereum-подобных сетей)
    gas_price: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Цена газа для транзакции (в wei)'
    },
    
    // Gas limit (для Ethereum-подобных сетей)
    gas_limit: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Лимит газа для транзакции'
    },
    
    // Gas used (для Ethereum-подобных сетей)
    gas_used: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Количество использованного газа'
    },
    
    // Входные данные транзакции
    input_data: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Входные данные транзакции (для смарт-контрактов)'
    },
    
    // Logs транзакции (для Ethereum)
    logs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Логи событий транзакции'
    },
    
    // Связанные адреса (для отслеживания)
    related_addresses: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Связанные адреса для отслеживания'
    },
    
    // Тип транзакции
    transaction_type: {
      type: DataTypes.ENUM('DEPOSIT', 'WITHDRAWAL', 'INTERNAL', 'FEE', 'CONTRACT'),
      allowNull: false,
      defaultValue: 'INTERNAL',
      comment: 'Тип транзакции в системе'
    },
    
    // Метаданные транзакции
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Дополнительные метаданные транзакции'
    },
    
    // Время последнего обновления статуса
    status_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последнего обновления статуса'
    },
    
    // Ошибка (если транзакция не удалась)
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Сообщение об ошибке при неуспешной транзакции'
    },
    
    // Попытки обработки
    processing_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Количество попыток обработки транзакции'
    }
  }, {
    // Настройки таблицы
    tableName: 'blockchain_transactions',
    timestamps: true,
    underscored: true,
    
    // Партиционирование по дате создания (PostgreSQL)
    // Это требует дополнительной настройки на уровне БД
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['tx_hash'],
        unique: true
      },
      {
        fields: ['currency', 'status']
      },
      {
        fields: ['from_address']
      },
      {
        fields: ['to_address']
      },
      {
        fields: ['currency', 'block_number']
      },
      {
        fields: ['transaction_type', 'currency']
      },
      {
        fields: ['status', 'confirmations']
      },
      {
        fields: ['confirmed_at']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['currency', 'created_at']
      },
      // Композитный индекс для поиска по адресам
      {
        fields: ['currency', 'to_address', 'status']
      },
      {
        fields: ['currency', 'from_address', 'status']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeUpdate: (transaction, options) => {
        // Обновление времени статуса при изменении
        if (transaction.changed('status')) {
          transaction.status_updated_at = new Date();
          
          // Установка времени подтверждения
          if (transaction.status === 'CONFIRMED' && !transaction.confirmed_at) {
            transaction.confirmed_at = new Date();
          }
        }
        
        // Увеличение счетчика попыток обработки
        if (transaction.changed('processing_attempts')) {
          transaction.processing_attempts += 1;
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Подтвержденные транзакции
      confirmed: {
        where: { status: 'CONFIRMED' }
      },
      
      // Ожидающие подтверждения
      pending: {
        where: { status: 'PENDING' }
      },
      
      // Неудачные транзакции
      failed: {
        where: { status: 'FAILED' }
      },
      
      // По валюте
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // По типу транзакции
      byType: (transactionType) => ({
        where: { transaction_type: transactionType }
      }),
      
      // По адресу
      byAddress: (address) => ({
        where: {
          [sequelize.Sequelize.Op.or]: [
            { from_address: address },
            { to_address: address }
          ]
        }
      }),
      
      // Недавние транзакции
      recent: (hours = 24) => ({
        where: {
          created_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
          }
        }
      }),
      
      // С минимальными подтверждениями
      withMinConfirmations: (minConfirmations) => ({
        where: {
          confirmations: {
            [sequelize.Sequelize.Op.gte]: minConfirmations
          }
        }
      })
    }
  });
  
  // Ассоциации (пока нет прямых связей)
  BlockchainTransaction.associate = (models) => {
    // Возможные связи с другими моделями будут добавлены позже
  };
  
  // Методы экземпляра
  BlockchainTransaction.prototype.isConfirmed = function(requiredConfirmations = null) {
    const minimumConfirmations = requiredConfirmations || this.getMinimumConfirmations();
    return this.confirmations >= minimumConfirmations && this.status === 'CONFIRMED';
  };
  
  BlockchainTransaction.prototype.getMinimumConfirmations = function() {
    const requirements = {
      'BTC': 6,
      'ETH': 12,
      'USDT_ERC20': 12,
      'USDT_TRC20': 20,
      'SOL': 32
    };
    
    return requirements[this.currency] || 6;
  };
  
  BlockchainTransaction.prototype.updateConfirmations = async function(confirmations, blockData = {}) {
    this.confirmations = confirmations;
    
    if (blockData.blockNumber) this.block_number = blockData.blockNumber;
    if (blockData.blockHash) this.block_hash = blockData.blockHash;
    if (blockData.transactionIndex !== undefined) this.transaction_index = blockData.transactionIndex;
    
    // Автоматическое изменение статуса
    if (this.confirmations >= this.getMinimumConfirmations() && this.status === 'PENDING') {
      this.status = 'CONFIRMED';
      this.confirmed_at = new Date();
    }
    
    await this.save();
  };
  
  BlockchainTransaction.prototype.markAsFailed = async function(errorMessage) {
    this.status = 'FAILED';
    this.error_message = errorMessage;
    this.status_updated_at = new Date();
    await this.save();
  };
  
  BlockchainTransaction.prototype.addLog = async function(logEntry) {
    const logs = this.logs || [];
    logs.push({
      ...logEntry,
      timestamp: new Date().toISOString()
    });
    
    this.logs = logs;
    await this.save();
  };
  
  BlockchainTransaction.prototype.calculateAge = function() {
    const now = new Date();
    const created = new Date(this.created_at);
    return Math.floor((now - created) / (1000 * 60)); // Возраст в минутах
  };
  
  // Статические методы
  BlockchainTransaction.findByHash = function(txHash) {
    return this.findOne({ where: { tx_hash: txHash } });
  };
  
  BlockchainTransaction.findByAddress = function(address, currency = null, limit = 50) {
    const where = {
      [sequelize.Sequelize.Op.or]: [
        { from_address: address },
        { to_address: address }
      ]
    };
    
    if (currency) where.currency = currency;
    
    return this.findAll({
      where,
      limit,
      order: [['created_at', 'DESC']]
    });
  };
  
  BlockchainTransaction.getTransactionStats = async function(currency = null, hours = 24) {
    const where = {
      created_at: {
        [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
      }
    };
    
    if (currency) where.currency = currency;
    
    const result = await this.findAll({
      where,
      attributes: [
        'currency',
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
        [sequelize.fn('AVG', sequelize.col('confirmations')), 'avg_confirmations']
      ],
      group: ['currency', 'status']
    });
    
    const stats = {};
    result.forEach(item => {
      const curr = item.currency;
      const status = item.status;
      
      if (!stats[curr]) stats[curr] = {};
      
      stats[curr][status] = {
        count: parseInt(item.get('count')),
        total_amount: parseFloat(item.get('total_amount')) || 0,
        avg_confirmations: parseFloat(item.get('avg_confirmations')) || 0
      };
    });
    
    return stats;
  };
  
  BlockchainTransaction.getPendingTransactions = function(currency = null, maxAge = 60) {
    const where = {
      status: 'PENDING',
      created_at: {
        [sequelize.Sequelize.Op.gte]: new Date(Date.now() - maxAge * 60 * 1000)
      }
    };
    
    if (currency) where.currency = currency;
    
    return this.findAll({
      where,
      order: [['created_at', 'ASC']]
    });
  };
  
  BlockchainTransaction.getVolumeStats = async function(currency, timeframe = '24h') {
    const timeframes = {
      '1h': 1,
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30
    };
    
    const hours = timeframes[timeframe] || 24;
    
    const result = await this.findAll({
      where: {
        currency,
        status: 'CONFIRMED',
        confirmed_at: {
          [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
        }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_volume'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'average_amount'],
        [sequelize.fn('SUM', sequelize.col('fee')), 'total_fees']
      ]
    });
    
    const stats = result[0];
    return {
      transaction_count: parseInt(stats.get('transaction_count')) || 0,
      total_volume: parseFloat(stats.get('total_volume')) || 0,
      average_amount: parseFloat(stats.get('average_amount')) || 0,
      total_fees: parseFloat(stats.get('total_fees')) || 0,
      timeframe
    };
  };
  
  // Создание транзакции с валидацией
  BlockchainTransaction.createTransaction = async function(data, transaction = null) {
    // Проверка на дублирование по хешу
    const existing = await this.findByHash(data.tx_hash);
    if (existing) {
      throw new Error(`Транзакция с хешем ${data.tx_hash} уже существует`);
    }
    
    return this.create(data, { transaction });
  };
  
  // Очистка старых записей
  BlockchainTransaction.cleanupOldTransactions = async function(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const deletedCount = await this.destroy({
      where: {
        created_at: {
          [sequelize.Sequelize.Op.lt]: cutoffDate
        },
        status: {
          [sequelize.Sequelize.Op.in]: ['CONFIRMED', 'FAILED', 'DROPPED']
        }
      }
    });
    
    return deletedCount;
  };
  
  return BlockchainTransaction;
};