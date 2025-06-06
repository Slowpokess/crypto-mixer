/**
 * Модель TransactionPool - пул транзакций для микширования
 * Содержит средства различных пользователей для перемешивания между собой
 */

module.exports = (sequelize, DataTypes) => {
  const TransactionPool = sequelize.define('TransactionPool', {
    // Уникальный идентификатор записи в пуле
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор записи в пуле транзакций'
    },
    
    // Тип криптовалюты
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты в пуле'
    },
    
    // Сумма в пуле
    amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Сумма средств в пуле для микширования'
    },
    
    // Идентификатор исходного запроса на микширование
    source_mix_request_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'mix_requests',
        key: 'id'
      },
      onDelete: 'CASCADE',
      comment: 'Идентификатор исходного запроса на микширование'
    },
    
    // Время добавления в пул
    added_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Время добавления средств в пул'
    },
    
    // Флаг использования средств из пула
    used: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг использования средств из пула для микширования'
    },
    
    // Время использования
    used_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время использования средств из пула'
    },
    
    // Приоритет использования
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      validate: {
        min: 1,
        max: 1000
      },
      comment: 'Приоритет использования средств (1-1000, меньше = выше приоритет)'
    },
    
    // Размер чанка для микширования
    chunk_size: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Размер чанка для разбивки на более мелкие суммы'
    },
    
    // Тип пула
    pool_type: {
      type: DataTypes.ENUM('STANDARD', 'HIGH_VOLUME', 'PREMIUM', 'EXPRESS'),
      allowNull: false,
      defaultValue: 'STANDARD',
      comment: 'Тип пула определяющий алгоритм микширования'
    },
    
    // Время ожидания в пуле (в минутах)
    max_wait_time: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
      validate: {
        min: 5,
        max: 1440 // Максимум сутки
      },
      comment: 'Максимальное время ожидания в пуле в минутах'
    },
    
    // Время истечения нахождения в пуле
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Время истечения нахождения средств в пуле'
    },
    
    // Идентификатор группы микширования
    mixing_group_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Идентификатор группы для совместного микширования'
    },
    
    // Метаданные для алгоритмов микширования
    mixing_metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        algorithm: 'coinjoin',
        mixing_rounds: 1,
        min_participants: 3,
        anonymity_set_size: 0
      },
      comment: 'Метаданные для алгоритмов микширования'
    },
    
    // Статистика использования
    usage_stats: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        times_mixed: 0,
        last_mixed_at: null,
        total_mixed_amount: 0,
        mixing_efficiency: 0
      },
      comment: 'Статистика использования средств из пула'
    },
    
    // Связанные исходящие транзакции
    output_transactions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Список связанных исходящих транзакций'
    },
    
    // Стратегия распределения
    distribution_strategy: {
      type: DataTypes.ENUM('EQUAL', 'WEIGHTED', 'RANDOM', 'OPTIMIZED'),
      allowNull: false,
      defaultValue: 'OPTIMIZED',
      comment: 'Стратегия распределения средств при микшировании'
    }
  }, {
    // Настройки таблицы
    tableName: 'transaction_pool',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['currency', 'used']
      },
      {
        fields: ['source_mix_request_id']
      },
      {
        fields: ['currency', 'pool_type', 'used']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['mixing_group_id']
      },
      {
        fields: ['priority', 'added_at']
      },
      {
        fields: ['currency', 'amount', 'used']
      },
      {
        fields: ['added_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeCreate: (poolEntry, options) => {
        // Установка времени истечения
        if (!poolEntry.expires_at) {
          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + poolEntry.max_wait_time);
          poolEntry.expires_at = expiresAt;
        }
      },
      
      beforeUpdate: (poolEntry, options) => {
        // Установка времени использования
        if (poolEntry.changed('used') && poolEntry.used && !poolEntry.used_at) {
          poolEntry.used_at = new Date();
          
          // Обновление статистики
          const stats = poolEntry.usage_stats || {};
          stats.times_mixed = (stats.times_mixed || 0) + 1;
          stats.last_mixed_at = new Date().toISOString();
          poolEntry.usage_stats = stats;
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Неиспользованные записи
      unused: {
        where: { 
          used: false,
          expires_at: {
            [sequelize.Sequelize.Op.gt]: new Date()
          }
        }
      },
      
      // Использованные записи
      used: {
        where: { used: true }
      },
      
      // Просроченные записи
      expired: {
        where: {
          expires_at: {
            [sequelize.Sequelize.Op.lt]: new Date()
          },
          used: false
        }
      },
      
      // По валюте
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // По типу пула
      byPoolType: (poolType) => ({
        where: { pool_type: poolType }
      }),
      
      // Готовые для микширования
      readyForMixing: {
        where: {
          used: false,
          expires_at: {
            [sequelize.Sequelize.Op.gt]: new Date()
          }
        },
        order: [['priority', 'ASC'], ['added_at', 'ASC']]
      },
      
      // Большие объемы
      highVolume: {
        where: {
          pool_type: 'HIGH_VOLUME'
        }
      }
    }
  });
  
  // Ассоциации с другими моделями
  TransactionPool.associate = (models) => {
    // Связь с запросом на микширование (многие к одному)
    TransactionPool.belongsTo(models.MixRequest, {
      foreignKey: 'source_mix_request_id',
      as: 'sourceMixRequest'
    });
  };
  
  // Методы экземпляра
  TransactionPool.prototype.isExpired = function() {
    return new Date() > this.expires_at;
  };
  
  TransactionPool.prototype.isAvailable = function() {
    return !this.used && !this.isExpired();
  };
  
  TransactionPool.prototype.markAsUsed = async function(outputTransactions = []) {
    this.used = true;
    this.used_at = new Date();
    this.output_transactions = outputTransactions;
    
    // Обновление статистики
    const stats = this.usage_stats || {};
    stats.times_mixed = (stats.times_mixed || 0) + 1;
    stats.last_mixed_at = new Date().toISOString();
    stats.total_mixed_amount = (stats.total_mixed_amount || 0) + parseFloat(this.amount);
    
    this.usage_stats = stats;
    await this.save();
  };
  
  TransactionPool.prototype.updateMixingMetadata = async function(metadata) {
    this.mixing_metadata = {
      ...this.mixing_metadata,
      ...metadata
    };
    await this.save();
  };
  
  TransactionPool.prototype.extendExpiration = async function(additionalMinutes) {
    const newExpiration = new Date(this.expires_at);
    newExpiration.setMinutes(newExpiration.getMinutes() + additionalMinutes);
    this.expires_at = newExpiration;
    await this.save();
  };
  
  TransactionPool.prototype.calculateMixingEfficiency = function() {
    const stats = this.usage_stats || {};
    const timeInPool = this.used_at ? 
      (new Date(this.used_at) - new Date(this.added_at)) / (1000 * 60) : 
      (new Date() - new Date(this.added_at)) / (1000 * 60);
    
    // Эффективность = (1 / время_в_пуле_в_минутах) * 100
    return Math.min(100, Math.max(0, (60 / Math.max(1, timeInPool)) * 100));
  };
  
  // Статические методы
  TransactionPool.findAvailableForMixing = function(currency, minAmount = 0, poolType = null, limit = 100) {
    const where = {
      currency,
      used: false,
      expires_at: {
        [sequelize.Sequelize.Op.gt]: new Date()
      }
    };
    
    if (minAmount > 0) {
      where.amount = {
        [sequelize.Sequelize.Op.gte]: minAmount
      };
    }
    
    if (poolType) {
      where.pool_type = poolType;
    }
    
    return this.findAll({
      where,
      limit,
      order: [['priority', 'ASC'], ['added_at', 'ASC']]
    });
  };
  
  TransactionPool.findMixingGroup = function(currency, targetAmount, groupSize = 5) {
    return this.findAll({
      where: {
        currency,
        used: false,
        expires_at: {
          [sequelize.Sequelize.Op.gt]: new Date()
        },
        amount: {
          [sequelize.Sequelize.Op.between]: [targetAmount * 0.8, targetAmount * 1.2]
        }
      },
      limit: groupSize,
      order: [['priority', 'ASC'], ['added_at', 'ASC']]
    });
  };
  
  TransactionPool.getTotalLiquidity = async function(currency = null, poolType = null) {
    const where = {
      used: false,
      expires_at: {
        [sequelize.Sequelize.Op.gt]: new Date()
      }
    };
    
    if (currency) where.currency = currency;
    if (poolType) where.pool_type = poolType;
    
    const result = await this.findAll({
      where,
      attributes: [
        'currency',
        'pool_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'avg_amount']
      ],
      group: ['currency', 'pool_type']
    });
    
    const liquidity = {};
    result.forEach(item => {
      const curr = item.currency;
      const type = item.pool_type;
      
      if (!liquidity[curr]) liquidity[curr] = {};
      
      liquidity[curr][type] = {
        count: parseInt(item.get('count')),
        total_amount: parseFloat(item.get('total_amount')) || 0,
        average_amount: parseFloat(item.get('avg_amount')) || 0
      };
    });
    
    return liquidity;
  };
  
  TransactionPool.getPoolStats = async function() {
    const result = await this.findAll({
      attributes: [
        'currency',
        'used',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
      ],
      group: ['currency', 'used']
    });
    
    const stats = {};
    result.forEach(item => {
      const currency = item.currency;
      const used = item.used;
      const count = parseInt(item.get('count'));
      const amount = parseFloat(item.get('total_amount')) || 0;
      
      if (!stats[currency]) stats[currency] = { used: {}, unused: {} };
      
      const status = used ? 'used' : 'unused';
      stats[currency][status] = { count, amount };
    });
    
    return stats;
  };
  
  TransactionPool.cleanupExpired = async function() {
    const expiredEntries = await this.scope('expired').findAll();
    const deletedCount = expiredEntries.length;
    
    // Удаление просроченных записей
    await this.destroy({
      where: {
        expires_at: {
          [sequelize.Sequelize.Op.lt]: new Date()
        },
        used: false
      }
    });
    
    return deletedCount;
  };
  
  // Создание группы для микширования
  TransactionPool.createMixingGroup = async function(entries, groupId = null) {
    if (!groupId) {
      groupId = require('uuid').v4();
    }
    
    const updatedEntries = [];
    for (const entry of entries) {
      entry.mixing_group_id = groupId;
      await entry.save();
      updatedEntries.push(entry);
    }
    
    return updatedEntries;
  };
  
  // Оптимизация пула для лучшего микширования
  TransactionPool.optimizePool = async function(currency) {
    const availableEntries = await this.scope(['unused', { method: ['byCurrency', currency] }])
      .findAll({
        order: [['amount', 'ASC']]
      });
    
    // Группировка по размерам для оптимального микширования
    const sizeGroups = {};
    availableEntries.forEach(entry => {
      const sizeCategory = this.categorizeByAmount(parseFloat(entry.amount));
      if (!sizeGroups[sizeCategory]) sizeGroups[sizeCategory] = [];
      sizeGroups[sizeCategory].push(entry);
    });
    
    return sizeGroups;
  };
  
  // Категоризация по размеру суммы
  TransactionPool.categorizeByAmount = function(amount) {
    if (amount < 0.001) return 'micro';
    if (amount < 0.01) return 'small';
    if (amount < 0.1) return 'medium';
    if (amount < 1) return 'large';
    return 'whale';
  };
  
  return TransactionPool;
};