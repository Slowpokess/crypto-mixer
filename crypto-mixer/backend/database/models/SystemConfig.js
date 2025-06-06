/**
 * Модель SystemConfig - конфигурация системы микширования
 * Хранит настройки, параметры и конфигурационные данные системы
 */

module.exports = (sequelize, DataTypes) => {
  const SystemConfig = sequelize.define('SystemConfig', {
    // Ключ конфигурации (первичный ключ)
    key: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100],
        is: /^[a-zA-Z0-9._-]+$/ // Только безопасные символы
      },
      comment: 'Уникальный ключ конфигурационного параметра'
    },
    
    // Значение конфигурации в формате JSON
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Значение конфигурационного параметра в формате JSON'
    },
    
    // Описание параметра
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Описание назначения конфигурационного параметра'
    },
    
    // Категория конфигурации
    category: {
      type: DataTypes.ENUM(
        'MIXING',         // Настройки микширования
        'SECURITY',       // Настройки безопасности
        'BLOCKCHAIN',     // Настройки блокчейна
        'FEES',           // Настройки комиссий
        'LIMITS',         // Лимиты и ограничения
        'NOTIFICATIONS',  // Настройки уведомлений
        'MONITORING',     // Настройки мониторинга
        'PERFORMANCE',    // Настройки производительности
        'MAINTENANCE',    // Настройки обслуживания
        'SYSTEM'          // Системные настройки
      ),
      allowNull: false,
      defaultValue: 'SYSTEM',
      comment: 'Категория конфигурационного параметра'
    },
    
    // Тип данных значения
    value_type: {
      type: DataTypes.ENUM('STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY'),
      allowNull: false,
      defaultValue: 'STRING',
      comment: 'Тип данных значения для валидации'
    },
    
    // Является ли параметр критичным для работы системы
    is_critical: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг критичности параметра для работы системы'
    },
    
    // Требует ли изменение перезапуска системы
    requires_restart: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Требует ли изменение параметра перезапуска системы'
    },
    
    // Доступен ли параметр только для чтения
    read_only: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг доступности параметра только для чтения'
    },
    
    // Зашифрован ли параметр
    encrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг шифрования значения параметра'
    },
    
    // Валидационные правила для значения
    validation_rules: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Правила валидации для значения параметра'
    },
    
    // Значение по умолчанию
    default_value: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Значение параметра по умолчанию'
    },
    
    // Время последнего изменения
    last_modified_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Идентификатор пользователя, изменившего параметр'
    },
    
    // Версия конфигурации
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Версия конфигурационного параметра'
    },
    
    // Теги для группировки и поиска
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Теги для группировки и поиска параметров'
    },
    
    // Окружение где применяется конфигурация
    environment: {
      type: DataTypes.ENUM('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'),
      allowNull: false,
      defaultValue: 'ALL',
      comment: 'Окружение где применяется конфигурация'
    }
  }, {
    // Настройки таблицы
    tableName: 'system_config',
    timestamps: true,
    underscored: true,
    
    // Индексы для оптимизации
    indexes: [
      {
        fields: ['category']
      },
      {
        fields: ['is_critical']
      },
      {
        fields: ['environment']
      },
      {
        fields: ['category', 'environment']
      },
      {
        fields: ['updated_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeUpdate: (config, options) => {
        // Увеличение версии при изменении значения
        if (config.changed('value')) {
          config.version += 1;
        }
        
        // Запрет изменения read-only параметров
        if (config.read_only && config.changed('value')) {
          throw new Error(`Параметр ${config.key} доступен только для чтения`);
        }
      },
      
      beforeDestroy: (config, options) => {
        // Запрет удаления критичных параметров
        if (config.is_critical) {
          throw new Error(`Нельзя удалить критичный параметр ${config.key}`);
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // По категории
      byCategory: (category) => ({
        where: { category }
      }),
      
      // Критичные параметры
      critical: {
        where: { is_critical: true }
      },
      
      // Требующие перезапуска
      requiresRestart: {
        where: { requires_restart: true }
      },
      
      // По окружению
      byEnvironment: (environment) => ({
        where: {
          [sequelize.Sequelize.Op.or]: [
            { environment },
            { environment: 'ALL' }
          ]
        }
      }),
      
      // Зашифрованные
      encrypted: {
        where: { encrypted: true }
      },
      
      // Недавно измененные
      recentlyModified: (hours = 24) => ({
        where: {
          updated_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
          }
        }
      })
    }
  });
  
  // Ассоциации (пока нет)
  SystemConfig.associate = (models) => {
    // Возможные связи будут добавлены позже
  };
  
  // Методы экземпляра
  SystemConfig.prototype.getValue = function() {
    // Возвращает типизированное значение
    switch (this.value_type) {
      case 'NUMBER':
        return typeof this.value === 'number' ? this.value : parseFloat(this.value);
      case 'BOOLEAN':
        return typeof this.value === 'boolean' ? this.value : Boolean(this.value);
      case 'STRING':
        return typeof this.value === 'string' ? this.value : String(this.value);
      case 'OBJECT':
      case 'ARRAY':
      default:
        return this.value;
    }
  };
  
  SystemConfig.prototype.setValue = async function(newValue, modifiedBy = null) {
    // Валидация типа
    if (!this.validateType(newValue)) {
      throw new Error(`Неверный тип значения для параметра ${this.key}. Ожидается: ${this.value_type}`);
    }
    
    // Валидация по правилам
    if (!this.validateValue(newValue)) {
      throw new Error(`Значение не прошло валидацию для параметра ${this.key}`);
    }
    
    this.value = newValue;
    this.last_modified_by = modifiedBy;
    await this.save();
  };
  
  SystemConfig.prototype.validateType = function(value) {
    switch (this.value_type) {
      case 'STRING':
        return typeof value === 'string';
      case 'NUMBER':
        return typeof value === 'number' && !isNaN(value);
      case 'BOOLEAN':
        return typeof value === 'boolean';
      case 'OBJECT':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'ARRAY':
        return Array.isArray(value);
      default:
        return true;
    }
  };
  
  SystemConfig.prototype.validateValue = function(value) {
    const rules = this.validation_rules || {};
    
    // Проверка минимального значения для чисел
    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      return false;
    }
    
    // Проверка максимального значения для чисел
    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      return false;
    }
    
    // Проверка длины для строк
    if (rules.minLength !== undefined && typeof value === 'string' && value.length < rules.minLength) {
      return false;
    }
    
    if (rules.maxLength !== undefined && typeof value === 'string' && value.length > rules.maxLength) {
      return false;
    }
    
    // Проверка регулярного выражения для строк
    if (rules.pattern && typeof value === 'string' && !new RegExp(rules.pattern).test(value)) {
      return false;
    }
    
    // Проверка списка допустимых значений
    if (rules.enum && Array.isArray(rules.enum) && !rules.enum.includes(value)) {
      return false;
    }
    
    return true;
  };
  
  SystemConfig.prototype.resetToDefault = async function() {
    if (this.default_value !== null && this.default_value !== undefined) {
      this.value = this.default_value;
      await this.save();
    }
  };
  
  SystemConfig.prototype.addTag = async function(tag) {
    const tags = this.tags || [];
    if (!tags.includes(tag)) {
      tags.push(tag);
      this.tags = tags;
      await this.save();
    }
  };
  
  SystemConfig.prototype.removeTag = async function(tag) {
    const tags = this.tags || [];
    const index = tags.indexOf(tag);
    if (index > -1) {
      tags.splice(index, 1);
      this.tags = tags;
      await this.save();
    }
  };
  
  // Статические методы
  SystemConfig.get = async function(key, defaultValue = null) {
    const config = await this.findByPk(key);
    return config ? config.getValue() : defaultValue;
  };
  
  SystemConfig.set = async function(key, value, options = {}) {
    const [config, created] = await this.findOrCreate({
      where: { key },
      defaults: {
        key,
        value,
        value_type: this.inferType(value),
        category: options.category || 'SYSTEM',
        description: options.description,
        ...options
      }
    });
    
    if (!created) {
      await config.setValue(value, options.modifiedBy);
    }
    
    return config;
  };
  
  SystemConfig.inferType = function(value) {
    if (typeof value === 'string') return 'STRING';
    if (typeof value === 'number') return 'NUMBER';
    if (typeof value === 'boolean') return 'BOOLEAN';
    if (Array.isArray(value)) return 'ARRAY';
    if (typeof value === 'object') return 'OBJECT';
    return 'STRING';
  };
  
  SystemConfig.getByCategory = function(category, environment = 'ALL') {
    return this.scope([
      { method: ['byCategory', category] },
      { method: ['byEnvironment', environment] }
    ]).findAll({
      order: [['key', 'ASC']]
    });
  };
  
  SystemConfig.getCriticalConfigs = function() {
    return this.scope('critical').findAll({
      order: [['key', 'ASC']]
    });
  };
  
  SystemConfig.getMixingConfig = async function() {
    const configs = await this.getByCategory('MIXING');
    const result = {};
    
    configs.forEach(config => {
      result[config.key] = config.getValue();
    });
    
    return result;
  };
  
  SystemConfig.getSecurityConfig = async function() {
    const configs = await this.getByCategory('SECURITY');
    const result = {};
    
    configs.forEach(config => {
      result[config.key] = config.getValue();
    });
    
    return result;
  };
  
  SystemConfig.initializeDefaults = async function() {
    const defaults = [
      // Настройки микширования
      {
        key: 'mixing.min_amount_btc',
        value: 0.001,
        value_type: 'NUMBER',
        category: 'MIXING',
        description: 'Минимальная сумма для микширования BTC',
        validation_rules: { min: 0.0001, max: 10 }
      },
      {
        key: 'mixing.max_amount_btc',
        value: 100,
        value_type: 'NUMBER',
        category: 'MIXING',
        description: 'Максимальная сумма для микширования BTC',
        validation_rules: { min: 0.001, max: 1000 }
      },
      {
        key: 'mixing.default_fee_percentage',
        value: 0.5,
        value_type: 'NUMBER',
        category: 'FEES',
        description: 'Комиссия по умолчанию в процентах',
        validation_rules: { min: 0.1, max: 5 }
      },
      {
        key: 'mixing.pool_size_target',
        value: 10,
        value_type: 'NUMBER',
        category: 'MIXING',
        description: 'Целевой размер пула для микширования',
        validation_rules: { min: 3, max: 100 }
      },
      
      // Настройки безопасности
      {
        key: 'security.session_timeout',
        value: 3600,
        value_type: 'NUMBER',
        category: 'SECURITY',
        description: 'Время жизни сессии в секундах',
        validation_rules: { min: 300, max: 86400 }
      },
      {
        key: 'security.max_attempts',
        value: 5,
        value_type: 'NUMBER',
        category: 'SECURITY',
        description: 'Максимальное количество попыток операции',
        validation_rules: { min: 1, max: 10 }
      },
      
      // Настройки блокчейна
      {
        key: 'blockchain.btc_confirmations',
        value: 6,
        value_type: 'NUMBER',
        category: 'BLOCKCHAIN',
        description: 'Требуемое количество подтверждений для BTC',
        validation_rules: { min: 1, max: 20 }
      },
      {
        key: 'blockchain.eth_confirmations',
        value: 12,
        value_type: 'NUMBER',
        category: 'BLOCKCHAIN',
        description: 'Требуемое количество подтверждений для ETH',
        validation_rules: { min: 1, max: 50 }
      },
      
      // Настройки мониторинга
      {
        key: 'monitoring.check_interval',
        value: 30,
        value_type: 'NUMBER',
        category: 'MONITORING',
        description: 'Интервал проверки адресов в секундах',
        validation_rules: { min: 10, max: 300 }
      }
    ];
    
    for (const config of defaults) {
      await this.findOrCreate({
        where: { key: config.key },
        defaults: config
      });
    }
    
    return defaults.length;
  };
  
  SystemConfig.exportConfig = async function(category = null) {
    const where = {};
    if (category) where.category = category;
    
    const configs = await this.findAll({ where });
    const result = {};
    
    configs.forEach(config => {
      result[config.key] = {
        value: config.getValue(),
        category: config.category,
        description: config.description,
        version: config.version
      };
    });
    
    return result;
  };
  
  SystemConfig.importConfig = async function(configData, modifiedBy = null) {
    const results = [];
    
    for (const [key, data] of Object.entries(configData)) {
      try {
        const config = await this.set(key, data.value, {
          category: data.category,
          description: data.description,
          modifiedBy
        });
        results.push({ key, status: 'success', config });
      } catch (error) {
        results.push({ key, status: 'error', error: error.message });
      }
    }
    
    return results;
  };
  
  return SystemConfig;
};