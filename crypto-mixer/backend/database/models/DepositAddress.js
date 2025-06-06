/**
 * Модель DepositAddress - управление адресами для депозитов
 * Содержит информацию о сгенерированных адресах для получения депозитов
 */

const crypto = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const DepositAddress = sequelize.define('DepositAddress', {
    // Уникальный идентификатор записи
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор записи адреса депозита'
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
    
    // Тип криптовалюты
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты адреса'
    },
    
    // Адрес для депозита
    address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [20, 128],
        isValidAddress(value) {
          // Базовая валидация адресов по длине и формату
          const validators = {
            'BTC': /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
            'ETH': /^0x[a-fA-F0-9]{40}$/,
            'USDT_ERC20': /^0x[a-fA-F0-9]{40}$/,
            'USDT_TRC20': /^T[A-Za-z1-9]{33}$/,
            'SOL': /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
          };
          
          const pattern = validators[this.currency];
          if (pattern && !pattern.test(value)) {
            throw new Error(`Неверный формат адреса для валюты ${this.currency}`);
          }
        }
      },
      comment: 'Адрес для получения депозита'
    },
    
    // Зашифрованный приватный ключ
    private_key_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      },
      comment: 'Зашифрованный приватный ключ адреса'
    },
    
    // Вектор инициализации для шифрования
    encryption_iv: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'Вектор инициализации для расшифровки приватного ключа'
    },
    
    // Статус использования адреса
    used: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг использования адреса (получен ли депозит)'
    },
    
    // Время первого использования
    first_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время первого получения средств на адрес'
    },
    
    // Путь деривации для HD кошельков
    derivation_path: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        isValidPath(value) {
          if (value && !/^m(\/\d+'?)*$/.test(value)) {
            throw new Error('Неверный формат пути деривации');
          }
        }
      },
      comment: 'Путь деривации для HD кошельков (BIP44/BIP49/BIP84)'
    },
    
    // Индекс адреса в последовательности генерации
    address_index: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      },
      comment: 'Индекс адреса в последовательности генерации'
    },
    
    // Дополнительные метаданные
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Дополнительные метаданные адреса'
    }
  }, {
    // Настройки таблицы
    tableName: 'deposit_addresses',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['mix_request_id'],
        unique: true // Один адрес на запрос
      },
      {
        fields: ['address'],
        unique: true
      },
      {
        fields: ['currency', 'used']
      },
      {
        fields: ['currency', 'address_index']
      },
      {
        fields: ['created_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeCreate: (depositAddress, options) => {
        // Генерация IV для шифрования если не задан
        if (!depositAddress.encryption_iv) {
          depositAddress.encryption_iv = crypto.randomBytes(16).toString('hex');
        }
      },
      
      beforeUpdate: (depositAddress, options) => {
        // Установка времени первого использования
        if (depositAddress.changed('used') && depositAddress.used && !depositAddress.first_used_at) {
          depositAddress.first_used_at = new Date();
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Неиспользованные адреса
      unused: {
        where: { used: false }
      },
      
      // Использованные адреса
      used: {
        where: { used: true }
      },
      
      // По типу валюты
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // Недавно созданные
      recent: {
        where: {
          created_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }
    }
  });
  
  // Ассоциации с другими моделями
  DepositAddress.associate = (models) => {
    // Связь с запросом на микширование (многие к одному)
    DepositAddress.belongsTo(models.MixRequest, {
      foreignKey: 'mix_request_id',
      as: 'mixRequest'
    });
    
    // Связь с отслеживаемыми адресами (один к одному)
    DepositAddress.hasOne(models.MonitoredAddress, {
      foreignKey: 'address',
      sourceKey: 'address',
      as: 'monitoredAddress'
    });
  };
  
  // Методы экземпляра
  DepositAddress.prototype.encryptPrivateKey = function(privateKey, encryptionKey) {
    try {
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
      cipher.update(this.encryption_iv, 'hex', 'hex');
      
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      this.private_key_encrypted = encrypted;
      return encrypted;
    } catch (error) {
      throw new Error(`Ошибка шифрования приватного ключа: ${error.message}`);
    }
  };
  
  DepositAddress.prototype.decryptPrivateKey = function(encryptionKey) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      decipher.update(this.encryption_iv, 'hex', 'hex');
      
      let decrypted = decipher.update(this.private_key_encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Ошибка расшифровки приватного ключа: ${error.message}`);
    }
  };
  
  DepositAddress.prototype.markAsUsed = async function() {
    this.used = true;
    this.first_used_at = new Date();
    await this.save();
  };
  
  DepositAddress.prototype.isValidForCurrency = function() {
    const validators = {
      'BTC': /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
      'ETH': /^0x[a-fA-F0-9]{40}$/,
      'USDT_ERC20': /^0x[a-fA-F0-9]{40}$/,
      'USDT_TRC20': /^T[A-Za-z1-9]{33}$/,
      'SOL': /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
    };
    
    const pattern = validators[this.currency];
    return pattern ? pattern.test(this.address) : false;
  };
  
  // Статические методы
  DepositAddress.findByAddress = function(address) {
    return this.findOne({ where: { address } });
  };
  
  DepositAddress.findUnusedByCurrency = function(currency, limit = 10) {
    return this.scope(['unused', { method: ['byCurrency', currency] }])
      .findAll({
        limit,
        order: [['created_at', 'ASC']]
      });
  };
  
  DepositAddress.generateNextIndex = async function(currency) {
    const lastAddress = await this.findOne({
      where: { currency },
      order: [['address_index', 'DESC']],
      attributes: ['address_index']
    });
    
    return lastAddress ? (lastAddress.address_index || 0) + 1 : 0;
  };
  
  DepositAddress.getUsageStats = async function() {
    const result = await this.findAll({
      attributes: [
        'currency',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN used = true THEN 1 END')), 'used_count']
      ],
      group: ['currency']
    });
    
    return result.reduce((acc, item) => {
      const currency = item.currency;
      const total = parseInt(item.get('total'));
      const used = parseInt(item.get('used_count')) || 0;
      
      acc[currency] = {
        total,
        used,
        unused: total - used,
        usage_percentage: total > 0 ? ((used / total) * 100).toFixed(2) : 0
      };
      
      return acc;
    }, {});
  };
  
  // Создание адреса с автоматическим шифрованием
  DepositAddress.createSecure = async function(data, encryptionKey, transaction = null) {
    const { privateKey, ...addressData } = data;
    
    // Создание записи без приватного ключа
    const address = await this.create(addressData, { transaction });
    
    // Шифрование и сохранение приватного ключа
    if (privateKey) {
      address.encryptPrivateKey(privateKey, encryptionKey);
      await address.save({ transaction });
    }
    
    return address;
  };
  
  return DepositAddress;
};