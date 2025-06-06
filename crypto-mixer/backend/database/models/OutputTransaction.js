/**
 * Модель OutputTransaction - исходящие транзакции после микширования
 * Управляет отправкой смикшированных средств на указанные пользователем адреса
 */

module.exports = (sequelize, DataTypes) => {
  const OutputTransaction = sequelize.define('OutputTransaction', {
    // Уникальный идентификатор транзакции
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор исходящей транзакции'
    },
    
    // Связь с запросом на микширование
    mix_request_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'mix_requests',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'Идентификатор связанного запроса на микширование'
    },
    
    // Адрес получателя
    output_address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [20, 128]
      },
      comment: 'Адрес получателя смикшированных средств'
    },
    
    // Сумма для отправки (в наименьших единицах)
    amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Сумма для отправки в наименьших единицах валюты'
    },
    
    // Тип криптовалюты
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты для отправки'
    },
    
    // Запланированное время отправки
    scheduled_at: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Запланированное время отправки транзакции'
    },
    
    // Фактическое время отправки
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Фактическое время отправки транзакции'
    },
    
    // Хеш транзакции в блокчейне
    tx_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true,
      comment: 'Хеш транзакции в блокчейне'
    },
    
    // Количество подтверждений
    confirmations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Количество подтверждений транзакции в блокчейне'
    },
    
    // Статус транзакции
    status: {
      type: DataTypes.ENUM(
        'PENDING',        // Ожидает отправки
        'SCHEDULED',      // Запланирована
        'BROADCASTING',   // Отправляется в сеть
        'SENT',          // Отправлена, ожидает подтверждений
        'CONFIRMED',     // Подтверждена
        'FAILED',        // Ошибка отправки
        'CANCELLED'      // Отменена
      ),
      allowNull: false,
      defaultValue: 'PENDING',
      comment: 'Текущий статус исходящей транзакции'
    },
    
    // Количество попыток отправки
    retry_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 5 // Максимум 5 попыток
      },
      comment: 'Количество попыток отправки транзакции'
    },
    
    // Последняя ошибка
    last_error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Последняя ошибка при отправке транзакции'
    },
    
    // Комиссия за транзакцию
    network_fee: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Комиссия сети за транзакцию'
    },
    
    // Приоритет транзакции
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
      allowNull: false,
      defaultValue: 'MEDIUM',
      comment: 'Приоритет обработки транзакции'
    },
    
    // Номер блока подтверждения
    block_number: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Номер блока в котором подтверждена транзакция'
    },
    
    // Хеш блока подтверждения
    block_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'Хеш блока в котором подтверждена транзакция'
    },
    
    // Позиция в блоке
    transaction_index: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Позиция транзакции в блоке'
    },
    
    // Дополнительные данные транзакции
    transaction_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Дополнительные данные транзакции (nonce, gasPrice и т.д.)'
    }
  }, {
    // Настройки таблицы
    tableName: 'output_transactions',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['mix_request_id']
      },
      {
        fields: ['output_address']
      },
      {
        fields: ['tx_hash'],
        unique: true,
        where: {
          tx_hash: { [sequelize.Sequelize.Op.ne]: null }
        }
      },
      {
        fields: ['currency', 'status']
      },
      {
        fields: ['scheduled_at']
      },
      {
        fields: ['status', 'retry_count']
      },
      {
        fields: ['confirmations', 'status']
      },
      {
        fields: ['block_number']
      },
      {
        fields: ['priority', 'scheduled_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeUpdate: (outputTx, options) => {
        // Установка времени отправки при смене статуса
        if (outputTx.changed('status')) {
          if (outputTx.status === 'SENT' && !outputTx.sent_at) {
            outputTx.sent_at = new Date();
          }
        }
        
        // Увеличение счетчика попыток при ошибке
        if (outputTx.changed('status') && outputTx.status === 'FAILED') {
          outputTx.retry_count += 1;
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Ожидающие отправки
      pending: {
        where: {
          status: ['PENDING', 'SCHEDULED'],
          scheduled_at: {
            [sequelize.Sequelize.Op.lte]: new Date()
          }
        }
      },
      
      // Отправленные но не подтвержденные
      unconfirmed: {
        where: {
          status: 'SENT',
          confirmations: {
            [sequelize.Sequelize.Op.lt]: 6 // Минимум подтверждений
          }
        }
      },
      
      // Подтвержденные транзакции
      confirmed: {
        where: {
          status: 'CONFIRMED'
        }
      },
      
      // Неудачные транзакции
      failed: {
        where: {
          status: 'FAILED'
        }
      },
      
      // По валюте
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // По приоритету
      byPriority: (priority) => ({
        where: { priority }
      }),
      
      // Требующие повторной отправки
      needsRetry: {
        where: {
          status: 'FAILED',
          retry_count: {
            [sequelize.Sequelize.Op.lt]: 5
          }
        }
      }
    }
  });
  
  // Ассоциации с другими моделями
  OutputTransaction.associate = (models) => {
    // Связь с запросом на микширование (многие к одному)
    OutputTransaction.belongsTo(models.MixRequest, {
      foreignKey: 'mix_request_id',
      as: 'mixRequest'
    });
    
    // Связь с блокчейн транзакциями (один к одному)
    OutputTransaction.hasOne(models.BlockchainTransaction, {
      foreignKey: 'tx_hash',
      sourceKey: 'tx_hash',
      as: 'blockchainTransaction'
    });
  };
  
  // Методы экземпляра
  OutputTransaction.prototype.canRetry = function() {
    return this.status === 'FAILED' && this.retry_count < 5;
  };
  
  OutputTransaction.prototype.isConfirmed = function() {
    const requiredConfirmations = {
      'BTC': 6,
      'ETH': 12,
      'USDT_ERC20': 12,
      'USDT_TRC20': 20,
      'SOL': 32
    };
    
    return this.confirmations >= (requiredConfirmations[this.currency] || 6);
  };
  
  OutputTransaction.prototype.markAsSent = async function(txHash, blockData = {}) {
    this.status = 'SENT';
    this.tx_hash = txHash;
    this.sent_at = new Date();
    
    if (blockData.blockNumber) this.block_number = blockData.blockNumber;
    if (blockData.blockHash) this.block_hash = blockData.blockHash;
    if (blockData.transactionIndex !== undefined) this.transaction_index = blockData.transactionIndex;
    
    await this.save();
  };
  
  OutputTransaction.prototype.markAsFailed = async function(error) {
    this.status = 'FAILED';
    this.last_error = error.message || error.toString();
    this.retry_count += 1;
    await this.save();
  };
  
  OutputTransaction.prototype.updateConfirmations = async function(confirmations) {
    this.confirmations = confirmations;
    
    if (this.isConfirmed() && this.status === 'SENT') {
      this.status = 'CONFIRMED';
    }
    
    await this.save();
  };
  
  OutputTransaction.prototype.calculatePriority = function() {
    const now = new Date();
    const scheduledTime = new Date(this.scheduled_at);
    const delayMinutes = (now - scheduledTime) / (1000 * 60);
    
    if (delayMinutes > 120) return 'URGENT';
    if (delayMinutes > 60) return 'HIGH';
    if (delayMinutes > 30) return 'MEDIUM';
    return 'LOW';
  };
  
  // Статические методы
  OutputTransaction.findPendingTransactions = function(limit = 50) {
    return this.scope('pending').findAll({
      limit,
      order: [['priority', 'DESC'], ['scheduled_at', 'ASC']]
    });
  };
  
  OutputTransaction.findUnconfirmedTransactions = function() {
    return this.scope('unconfirmed').findAll({
      order: [['sent_at', 'ASC']]
    });
  };
  
  OutputTransaction.findFailedTransactions = function() {
    return this.scope(['failed', 'needsRetry']).findAll({
      order: [['updated_at', 'ASC']]
    });
  };
  
  OutputTransaction.getStatusStats = async function() {
    const result = await this.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      group: ['status']
    });
    
    return result.reduce((acc, item) => {
      acc[item.status] = {
        count: parseInt(item.get('count')),
        total_amount: parseFloat(item.get('total_amount')) || 0
      };
      return acc;
    }, {});
  };
  
  OutputTransaction.getCurrencyStats = async function() {
    const result = await this.findAll({
      attributes: [
        'currency',
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['currency', 'status']
    });
    
    const stats = {};
    result.forEach(item => {
      const currency = item.currency;
      const status = item.status;
      const count = parseInt(item.get('count'));
      
      if (!stats[currency]) stats[currency] = {};
      stats[currency][status] = count;
    });
    
    return stats;
  };
  
  // Планирование транзакции с задержкой
  OutputTransaction.scheduleTransaction = async function(data, delayMinutes = 0) {
    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes);
    
    return this.create({
      ...data,
      scheduled_at: scheduledAt,
      status: delayMinutes > 0 ? 'SCHEDULED' : 'PENDING'
    });
  };
  
  return OutputTransaction;
};