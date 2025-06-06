/**
 * Модель MixRequest - основная таблица запросов на микширование криптовалют
 * Содержит всю информацию о процессе микширования от создания до завершения
 */

module.exports = (sequelize, DataTypes) => {
  const MixRequest = sequelize.define('MixRequest', {
    // Уникальный идентификатор запроса (UUID)
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор запроса на микширование'
    },
    
    // Идентификатор пользовательской сессии
    session_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      validate: {
        len: [10, 64],
        notEmpty: true
      },
      comment: 'Идентификатор пользовательской сессии'
    },
    
    // Тип криптовалюты для микширования
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты для микширования'
    },
    
    // Сумма для микширования (в наименьших единицах)
    amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Сумма для микширования в наименьших единицах валюты'
    },
    
    // Комиссия сервиса (в процентах)
    fee: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.5,
      validate: {
        min: 0,
        max: 10
      },
      comment: 'Комиссия сервиса в процентах'
    },
    
    // Общая сумма включая комиссию
    total_amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Общая сумма включая комиссию'
    },
    
    // Адрес для депозита
    deposit_address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [20, 128]
      },
      comment: 'Адрес для внесения депозита'
    },
    
    // Выходные адреса в формате JSON
    output_addresses: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        isValidOutputAddresses(value) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error('output_addresses должен быть массивом с минимум одним адресом');
          }
          
          value.forEach((addr, index) => {
            if (!addr.address || !addr.percentage) {
              throw new Error(`Неверный формат адреса в позиции ${index}`);
            }
            if (addr.percentage <= 0 || addr.percentage > 100) {
              throw new Error(`Неверный процент для адреса в позиции ${index}`);
            }
          });
          
          const totalPercentage = value.reduce((sum, addr) => sum + addr.percentage, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error('Сумма процентов должна равняться 100%');
          }
        }
      },
      comment: 'Выходные адреса с процентным распределением в формате JSON'
    },
    
    // Задержка перед отправкой (в часах)
    delay_hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 168 // Максимум неделя
      },
      comment: 'Задержка перед отправкой в часах'
    },
    
    // Текущий статус микширования
    status: {
      type: DataTypes.ENUM(
        'PENDING_DEPOSIT',    // Ожидание депозита
        'DEPOSIT_RECEIVED',   // Депозит получен
        'PROCESSING',         // Обработка
        'MIXING',            // Процесс микширования
        'SENDING',           // Отправка на выходные адреса
        'COMPLETED',         // Завершено успешно
        'FAILED',            // Ошибка
        'EXPIRED'            // Истек срок
      ),
      allowNull: false,
      defaultValue: 'PENDING_DEPOSIT',
      comment: 'Текущий статус запроса на микширование'
    },
    
    // Количество подтверждений транзакции
    confirmations: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Количество подтверждений входящей транзакции'
    },
    
    // Хеш транзакции депозита
    deposit_tx_hash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true,
      comment: 'Хеш транзакции депозита в блокчейне'
    },
    
    // Время истечения запроса
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Время истечения запроса на микширование'
    },
    
    // Время завершения микширования
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время завершения процесса микширования'
    }
  }, {
    // Настройки таблицы
    tableName: 'mix_requests',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации запросов
    indexes: [
      {
        fields: ['session_id'],
        unique: true
      },
      {
        fields: ['currency', 'status']
      },
      {
        fields: ['deposit_address'],
        unique: true
      },
      {
        fields: ['deposit_tx_hash'],
        unique: true,
        where: {
          deposit_tx_hash: { [sequelize.Sequelize.Op.ne]: null }
        }
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['status', 'created_at']
      }
    ],
    
    // Хуки модели для автоматических операций
    hooks: {
      beforeCreate: (mixRequest, options) => {
        // Автоматическое вычисление общей суммы
        const amount = parseFloat(mixRequest.amount);
        const fee = parseFloat(mixRequest.fee);
        mixRequest.total_amount = amount + (amount * fee / 100);
        
        // Установка времени истечения (24 часа по умолчанию)
        if (!mixRequest.expires_at) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          mixRequest.expires_at = expiresAt;
        }
      },
      
      beforeUpdate: (mixRequest, options) => {
        // Установка времени завершения при смене статуса на COMPLETED
        if (mixRequest.changed('status') && mixRequest.status === 'COMPLETED') {
          mixRequest.completed_at = new Date();
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Активные запросы (не завершенные и не истекшие)
      active: {
        where: {
          status: {
            [sequelize.Sequelize.Op.notIn]: ['COMPLETED', 'FAILED', 'EXPIRED']
          },
          expires_at: {
            [sequelize.Sequelize.Op.gt]: new Date()
          }
        }
      },
      
      // Завершенные запросы
      completed: {
        where: {
          status: 'COMPLETED'
        }
      },
      
      // Просроченные запросы
      expired: {
        where: {
          [sequelize.Sequelize.Op.or]: [
            { status: 'EXPIRED' },
            {
              expires_at: {
                [sequelize.Sequelize.Op.lt]: new Date()
              },
              status: {
                [sequelize.Sequelize.Op.notIn]: ['COMPLETED', 'FAILED']
              }
            }
          ]
        }
      },
      
      // Запросы по определенной валюте
      byCurrency: (currency) => ({
        where: { currency }
      })
    }
  });
  
  // Ассоциации с другими моделями
  MixRequest.associate = (models) => {
    // Связь с депозитными адресами (один к одному)
    MixRequest.hasOne(models.DepositAddress, {
      foreignKey: 'mix_request_id',
      as: 'depositAddressDetails'
    });
    
    // Связь с исходящими транзакциями (один ко многим)
    MixRequest.hasMany(models.OutputTransaction, {
      foreignKey: 'mix_request_id',
      as: 'outputTransactions'
    });
    
    // Связь с отслеживаемыми адресами (один ко многим)
    MixRequest.hasMany(models.MonitoredAddress, {
      foreignKey: 'mix_request_id',
      as: 'monitoredAddresses'
    });
    
    // Связь с записями в пуле транзакций (один ко многим)
    MixRequest.hasMany(models.TransactionPool, {
      foreignKey: 'source_mix_request_id',
      as: 'poolEntries'
    });
  };
  
  // Методы экземпляра
  MixRequest.prototype.isExpired = function() {
    return new Date() > this.expires_at;
  };
  
  MixRequest.prototype.canBeProcessed = function() {
    return this.status === 'DEPOSIT_RECEIVED' && !this.isExpired();
  };
  
  MixRequest.prototype.calculateFeeAmount = function() {
    const amount = parseFloat(this.amount);
    const fee = parseFloat(this.fee);
    return amount * fee / 100;
  };
  
  MixRequest.prototype.getOutputAmount = function() {
    return parseFloat(this.amount);
  };
  
  // Статические методы
  MixRequest.findBySessionId = function(sessionId) {
    return this.findOne({ where: { session_id: sessionId } });
  };
  
  MixRequest.findActiveByAddress = function(depositAddress) {
    return this.scope('active').findOne({ 
      where: { deposit_address: depositAddress } 
    });
  };
  
  MixRequest.countByStatus = async function() {
    const result = await this.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });
    
    return result.reduce((acc, item) => {
      acc[item.status] = parseInt(item.get('count'));
      return acc;
    }, {});
  };
  
  return MixRequest;
};