/**
 * Модель Wallet - управление кошельками системы микширования
 * Содержит информацию о горячих, холодных и буферных кошельках
 */

const crypto = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const Wallet = sequelize.define('Wallet', {
    // Уникальный идентификатор кошелька
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор кошелька системы'
    },
    
    // Тип криптовалюты кошелька
    currency: {
      type: DataTypes.ENUM('BTC', 'ETH', 'USDT_ERC20', 'USDT_TRC20', 'SOL'),
      allowNull: false,
      comment: 'Тип криптовалюты кошелька'
    },
    
    // Адрес кошелька
    address: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [20, 128],
        isValidAddress(value) {
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
      comment: 'Публичный адрес кошелька'
    },
    
    // Зашифрованный приватный ключ
    private_key_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      },
      comment: 'Зашифрованный приватный ключ кошелька'
    },
    
    // Вектор инициализации для шифрования
    encryption_iv: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'Вектор инициализации для расшифровки ключа'
    },
    
    // Тип кошелька
    wallet_type: {
      type: DataTypes.ENUM('HOT', 'COLD', 'BUFFER'),
      allowNull: false,
      comment: 'Тип кошелька (горячий/холодный/буферный)'
    },
    
    // Текущий баланс (кешированное значение)
    balance: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Текущий баланс кошелька (кешированное значение)'
    },
    
    // Зарезервированный баланс
    reserved_balance: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Зарезервированный баланс для планируемых транзакций'
    },
    
    // Время последнего использования
    last_used: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последнего использования кошелька'
    },
    
    // Время последнего обновления баланса
    balance_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Время последнего обновления баланса'
    },
    
    // Статус активности кошелька
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Статус активности кошелька'
    },
    
    // Приоритет использования (чем меньше число, тем выше приоритет)
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      validate: {
        min: 1,
        max: 1000
      },
      comment: 'Приоритет использования кошелька (1-1000)'
    },
    
    // Максимальный баланс для автоматического управления
    max_balance: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Максимальный баланс для автоматического управления'
    },
    
    // Минимальный баланс для операций
    min_balance: {
      type: DataTypes.DECIMAL(30, 18),
      allowNull: true,
      validate: {
        min: 0,
        isDecimal: true
      },
      comment: 'Минимальный баланс для проведения операций'
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
      comment: 'Путь деривации для HD кошельков'
    },
    
    // Публичный ключ (для некоторых валют)
    public_key: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Публичный ключ кошелька'
    },
    
    // Дополнительные метаданные
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Дополнительные метаданные кошелька'
    },
    
    // Настройки безопасности
    security_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        multi_sig: false,
        requires_confirmation: false,
        max_daily_amount: null,
        whitelist_only: false
      },
      comment: 'Настройки безопасности кошелька'
    }
  }, {
    // Настройки таблицы
    tableName: 'wallets',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['address'],
        unique: true
      },
      {
        fields: ['currency', 'wallet_type']
      },
      {
        fields: ['currency', 'active']
      },
      {
        fields: ['wallet_type', 'active', 'priority']
      },
      {
        fields: ['balance']
      },
      {
        fields: ['last_used']
      },
      {
        fields: ['currency', 'balance'],
        where: {
          active: true
        }
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeCreate: (wallet, options) => {
        // Генерация IV для шифрования если не задан
        if (!wallet.encryption_iv) {
          wallet.encryption_iv = crypto.randomBytes(16).toString('hex');
        }
      },
      
      beforeUpdate: (wallet, options) => {
        // Обновление времени использования
        if (wallet.changed('balance') || wallet.changed('reserved_balance')) {
          wallet.last_used = new Date();
          
          if (wallet.changed('balance')) {
            wallet.balance_updated_at = new Date();
          }
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // Активные кошельки
      active: {
        where: { active: true }
      },
      
      // По типу кошелька
      byType: (walletType) => ({
        where: { wallet_type: walletType }
      }),
      
      // По валюте
      byCurrency: (currency) => ({
        where: { currency }
      }),
      
      // Горячие кошельки
      hot: {
        where: { 
          wallet_type: 'HOT',
          active: true
        }
      },
      
      // Холодные кошельки  
      cold: {
        where: { 
          wallet_type: 'COLD',
          active: true
        }
      },
      
      // Буферные кошельки
      buffer: {
        where: { 
          wallet_type: 'BUFFER',
          active: true
        }
      },
      
      // С достаточным балансом
      withBalance: (minAmount) => ({
        where: {
          balance: {
            [sequelize.Sequelize.Op.gte]: minAmount
          }
        }
      }),
      
      // Требующие пополнения
      needsFunding: {
        where: {
          [sequelize.Sequelize.Op.and]: [
            sequelize.literal('balance < min_balance'),
            { min_balance: { [sequelize.Sequelize.Op.ne]: null } }
          ]
        }
      }
    }
  });
  
  // Ассоциации (пока нет прямых связей, но могут быть добавлены)
  Wallet.associate = (models) => {
    // Возможные будущие связи с транзакциями и другими сущностями
  };
  
  // Методы экземпляра
  Wallet.prototype.encryptPrivateKey = function(privateKey, encryptionKey) {
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
  
  Wallet.prototype.decryptPrivateKey = function(encryptionKey) {
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
  
  Wallet.prototype.getAvailableBalance = function() {
    return parseFloat(this.balance) - parseFloat(this.reserved_balance);
  };
  
  Wallet.prototype.canSend = function(amount) {
    const available = this.getAvailableBalance();
    return available >= parseFloat(amount) && this.active;
  };
  
  Wallet.prototype.reserveBalance = async function(amount) {
    const available = this.getAvailableBalance();
    if (available < parseFloat(amount)) {
      throw new Error('Недостаточно средств для резервирования');
    }
    
    this.reserved_balance = parseFloat(this.reserved_balance) + parseFloat(amount);
    await this.save();
  };
  
  Wallet.prototype.releaseReserve = async function(amount) {
    this.reserved_balance = Math.max(0, parseFloat(this.reserved_balance) - parseFloat(amount));
    await this.save();
  };
  
  Wallet.prototype.updateBalance = async function(newBalance) {
    this.balance = newBalance;
    this.balance_updated_at = new Date();
    this.last_used = new Date();
    await this.save();
  };
  
  Wallet.prototype.needsFunding = function() {
    return this.min_balance && parseFloat(this.balance) < parseFloat(this.min_balance);
  };
  
  Wallet.prototype.isOverLimit = function() {
    return this.max_balance && parseFloat(this.balance) > parseFloat(this.max_balance);
  };
  
  // Статические методы
  Wallet.findByCurrency = function(currency, walletType = null) {
    const where = { currency, active: true };
    if (walletType) where.wallet_type = walletType;
    
    return this.findAll({
      where,
      order: [['priority', 'ASC'], ['balance', 'DESC']]
    });
  };
  
  Wallet.findBestWalletForAmount = async function(currency, amount, walletType = 'HOT') {
    return this.findOne({
      where: {
        currency,
        wallet_type: walletType,
        active: true,
        [sequelize.Sequelize.Op.and]: [
          sequelize.literal(`(balance - reserved_balance) >= ${amount}`)
        ]
      },
      order: [['priority', 'ASC'], ['balance', 'DESC']]
    });
  };
  
  Wallet.getTotalBalance = async function(currency, walletType = null) {
    const where = { currency, active: true };
    if (walletType) where.wallet_type = walletType;
    
    const result = await this.findAll({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('balance')), 'total_balance'],
        [sequelize.fn('SUM', sequelize.col('reserved_balance')), 'total_reserved']
      ]
    });
    
    return {
      total: parseFloat(result[0].get('total_balance')) || 0,
      reserved: parseFloat(result[0].get('total_reserved')) || 0,
      available: (parseFloat(result[0].get('total_balance')) || 0) - (parseFloat(result[0].get('total_reserved')) || 0)
    };
  };
  
  Wallet.getBalanceStats = async function() {
    const result = await this.findAll({
      attributes: [
        'currency',
        'wallet_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('balance')), 'total_balance'],
        [sequelize.fn('SUM', sequelize.col('reserved_balance')), 'total_reserved']
      ],
      where: { active: true },
      group: ['currency', 'wallet_type']
    });
    
    const stats = {};
    result.forEach(item => {
      const currency = item.currency;
      const walletType = item.wallet_type;
      
      if (!stats[currency]) stats[currency] = {};
      
      stats[currency][walletType] = {
        count: parseInt(item.get('count')),
        total_balance: parseFloat(item.get('total_balance')) || 0,
        reserved_balance: parseFloat(item.get('total_reserved')) || 0,
        available_balance: (parseFloat(item.get('total_balance')) || 0) - (parseFloat(item.get('total_reserved')) || 0)
      };
    });
    
    return stats;
  };
  
  Wallet.createSecure = async function(data, encryptionKey, transaction = null) {
    const { privateKey, ...walletData } = data;
    
    // Создание записи без приватного ключа
    const wallet = await this.create(walletData, { transaction });
    
    // Шифрование и сохранение приватного ключа
    if (privateKey) {
      wallet.encryptPrivateKey(privateKey, encryptionKey);
      await wallet.save({ transaction });
    }
    
    return wallet;
  };
  
  return Wallet;
};