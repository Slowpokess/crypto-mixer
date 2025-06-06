/**
 * Модель MonitoredAddress - отслеживаемые адреса в блокчейне
 * Используется для мониторинга входящих транзакций на депозитные адреса
 */

module.exports = (sequelize, DataTypes) => {
  const MonitoredAddress = sequelize.define('MonitoredAddress', {
    // Уникальный идентификатор записи
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор записи мониторинга'
    },
    
    // Тип криптовалюты
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты для мониторинга'
    },
    
    // Отслеживаемый адрес
    address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [20, 128]
      },
      comment: 'Адрес для отслеживания входящих транзакций'
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
    
    // Статус мониторинга
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Статус активности мониторинга адреса'
    },
    
    // Флаг обнаружения транзакции
    detected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг обнаружения входящей транзакции'
    },
    
    // Время обнаружения транзакции
    detected_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время обнаружения первой входящей транзакции'
    },
    
    // Последний проверенный блок
    last_checked_block: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'Номер последнего проверенного блока'
    },
    
    // Время последней проверки
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последней проверки адреса'
    },
    
    // Количество проверок
    check_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Количество выполненных проверок адреса'
    },
    
    // Интервал проверки в секундах
    check_interval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: {
        min: 10,
        max: 3600
      },
      comment: 'Интервал проверки адреса в секундах'
    },
    
    // Время истечения мониторинга
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Время окончания мониторинга адреса'
    },
    
    // Минимальная сумма для срабатывания
    min_amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Минимальная сумма транзакции для срабатывания'
    },
    
    // Обнаруженные транзакции (кеш)
    detected_transactions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Список обнаруженных транзакций (кеш)'
    },
    
    // Общая обнаруженная сумма
    total_detected_amount: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Общая сумма обнаруженных транзакций'
    },
    
    // Статистика мониторинга
    monitoring_stats: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        total_checks: 0,
        successful_checks: 0,
        failed_checks: 0,
        last_error: null,
        average_response_time: 0
      },
      comment: 'Статистика мониторинга адреса'
    },
    
    // Настройки уведомлений
    notification_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        webhook_url: null,
        email_notifications: false,
        telegram_notifications: false
      },
      comment: 'Настройки уведомлений о событиях'
    }
  }, {
    // Настройки таблицы
    tableName: 'monitored_addresses',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['currency', 'address'],
        unique: true
      },
      {
        fields: ['mix_request_id'],
        unique: true
      },
      {
        fields: ['active', 'currency']
      },
      {
        fields: ['detected', 'active']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['last_checked_at']
      },
      {
        fields: ['currency', 'active', 'last_checked_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeCreate: (monitoredAddress, options) => {
        // Установка времени истечения (24 часа по умолчанию)
        if (!monitoredAddress.expires_at) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          monitoredAddress.expires_at = expiresAt;
        }
      },
      
      beforeUpdate: (monitoredAddress, options) => {
        // Обновление времени обнаружения
        if (monitoredAddress.changed('detected') && monitoredAddress.detected && !monitoredAddress.detected_at) {
          monitoredAddress.detected_at = new Date();
        }
        
        // Обновление статистики
        if (monitoredAddress.changed('last_checked_at')) {
          const stats = monitoredAddress.monitoring_stats || {};
          stats.total_checks = (stats.total_checks || 0) + 1;
          monitoredAddress.monitoring_stats = stats;
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Активные адреса
      active: {
        where: { 
          active: true,
          expires_at: {
            [sequelize.Sequelize.Op.gt]: new Date()
          }
        }
      },
      
      // Обнаруженные транзакции
      detected: {
        where: { detected: true }
      },
      
      // Неактивные/просроченные
      expired: {
        where: {
          [sequelize.Sequelize.Op.or]: [
            { active: false },
            {
              expires_at: {
                [sequelize.Sequelize.Op.lt]: new Date()
              }
            }
          ]
        }
      },
      
      // По валюте
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // Требующие проверки
      needsCheck: {
        where: {
          active: true,
          expires_at: {
            [sequelize.Sequelize.Op.gt]: new Date()
          },
          [sequelize.Sequelize.Op.or]: [
            { last_checked_at: null },
            {
              last_checked_at: {
                [sequelize.Sequelize.Op.lt]: sequelize.literal('NOW() - INTERVAL \'1 second\' * check_interval')
              }
            }
          ]
        }
      }
    }
  });
  
  // Ассоциации с другими моделями
  MonitoredAddress.associate = (models) => {
    // Связь с запросом на микширование (многие к одному)
    MonitoredAddress.belongsTo(models.MixRequest, {
      foreignKey: 'mix_request_id',
      as: 'mixRequest'
    });
  };
  
  // Методы экземпляра
  MonitoredAddress.prototype.isExpired = function() {
    return new Date() > this.expires_at || !this.active;
  };
  
  MonitoredAddress.prototype.needsCheck = function() {
    if (this.isExpired()) return false;
    
    if (!this.last_checked_at) return true;
    
    const now = new Date();
    const lastCheck = new Date(this.last_checked_at);
    const intervalMs = this.check_interval * 1000;
    
    return (now - lastCheck) >= intervalMs;
  };
  
  MonitoredAddress.prototype.markAsChecked = async function(blockNumber = null) {
    this.last_checked_at = new Date();
    this.check_count += 1;
    
    if (blockNumber) {
      this.last_checked_block = blockNumber;
    }
    
    // Обновление статистики
    const stats = this.monitoring_stats || {};
    stats.total_checks = this.check_count;
    stats.successful_checks = (stats.successful_checks || 0) + 1;
    this.monitoring_stats = stats;
    
    await this.save();
  };
  
  MonitoredAddress.prototype.markAsDetected = async function(transactions = []) {
    this.detected = true;
    this.detected_at = new Date();
    this.detected_transactions = transactions;
    
    // Подсчет общей суммы
    const totalAmount = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    this.total_detected_amount = totalAmount;
    
    await this.save();
  };
  
  MonitoredAddress.prototype.updateCheckError = async function(error) {
    const stats = this.monitoring_stats || {};
    stats.failed_checks = (stats.failed_checks || 0) + 1;
    stats.last_error = error.message || error.toString();
    stats.last_error_time = new Date().toISOString();
    
    this.monitoring_stats = stats;
    await this.save();
  };
  
  MonitoredAddress.prototype.addDetectedTransaction = async function(transaction) {
    const transactions = this.detected_transactions || [];
    
    // Проверка на дублирование
    const exists = transactions.some(tx => tx.hash === transaction.hash);
    if (exists) return false;
    
    transactions.push(transaction);
    this.detected_transactions = transactions;
    
    // Обновление общей суммы
    this.total_detected_amount = parseFloat(this.total_detected_amount) + parseFloat(transaction.amount || 0);
    
    // Отметка как обнаруженный
    if (!this.detected) {
      this.detected = true;
      this.detected_at = new Date();
    }
    
    await this.save();
    return true;
  };
  
  MonitoredAddress.prototype.deactivate = async function() {
    this.active = false;
    await this.save();
  };
  
  // Статические методы
  MonitoredAddress.findActiveByAddress = function(address, currency) {
    return this.scope('active').findOne({
      where: { address, currency }
    });
  };
  
  MonitoredAddress.findNeedingCheck = function(currency = null, limit = 100) {
    const scope = ['needsCheck'];
    if (currency) {
      scope.push({ method: ['byCurrency', currency] });
    }
    
    return this.scope(scope).findAll({
      limit,
      order: [
        ['last_checked_at', 'ASC'],
        ['created_at', 'ASC']
      ]
    });
  };
  
  MonitoredAddress.getActiveCount = async function(currency = null) {
    const where = {
      active: true,
      expires_at: {
        [sequelize.Sequelize.Op.gt]: new Date()
      }
    };
    
    if (currency) where.currency = currency;
    
    return this.count({ where });
  };
  
  MonitoredAddress.getDetectionStats = async function() {
    const result = await this.findAll({
      attributes: [
        'currency',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN detected = true THEN 1 END')), 'detected_count'],
        [sequelize.fn('SUM', sequelize.col('total_detected_amount')), 'total_amount']
      ],
      group: ['currency']
    });
    
    return result.reduce((acc, item) => {
      const currency = item.currency;
      const total = parseInt(item.get('total'));
      const detected = parseInt(item.get('detected_count')) || 0;
      const amount = parseFloat(item.get('total_amount')) || 0;
      
      acc[currency] = {
        total,
        detected,
        detection_rate: total > 0 ? ((detected / total) * 100).toFixed(2) : 0,
        total_amount: amount
      };
      
      return acc;
    }, {});
  };
  
  MonitoredAddress.cleanupExpired = async function() {
    const expiredAddresses = await this.scope('expired').findAll();
    
    for (const address of expiredAddresses) {
      await address.deactivate();
    }
    
    return expiredAddresses.length;
  };
  
  // Создание мониторинга с настройками по умолчанию
  MonitoredAddress.createMonitoring = async function(data, transaction = null) {
    const defaultSettings = {
      check_interval: 30,
      min_amount: 0,
      notification_settings: {
        webhook_url: null,
        email_notifications: false,
        telegram_notifications: false
      },
      monitoring_stats: {
        total_checks: 0,
        successful_checks: 0,
        failed_checks: 0,
        last_error: null,
        average_response_time: 0
      }
    };
    
    return this.create({
      ...defaultSettings,
      ...data
    }, { transaction });
  };
  
  return MonitoredAddress;
};