/**
 * Модель AuditLog - журнал аудита системы микширования
 * Записывает все важные события и действия в системе для безопасности и анализа
 */

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    // Уникальный идентификатор записи
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      comment: 'Уникальный идентификатор записи аудита'
    },
    
    // Тип события
    event_type: {
      type: DataTypes.ENUM(
        'MIX_REQUEST_CREATED',     // Создание запроса на микширование
        'MIX_REQUEST_UPDATED',     // Обновление запроса
        'MIX_REQUEST_COMPLETED',   // Завершение микширования
        'MIX_REQUEST_FAILED',      // Ошибка микширования
        'DEPOSIT_RECEIVED',        // Получение депозита
        'TRANSACTION_SENT',        // Отправка транзакции
        'WALLET_CREATED',          // Создание кошелька
        'WALLET_ACCESSED',         // Доступ к кошельку
        'CONFIG_CHANGED',          // Изменение конфигурации
        'SECURITY_ALERT',          // Предупреждение безопасности
        'SYSTEM_STARTUP',          // Запуск системы
        'SYSTEM_SHUTDOWN',         // Остановка системы
        'LOGIN_ATTEMPT',           // Попытка входа
        'API_ACCESS',              // Доступ к API
        'DATABASE_OPERATION',      // Операция с БД
        'BLOCKCHAIN_EVENT',        // Событие блокчейна
        'MIXING_POOL_EVENT',       // События пула микширования
        'MONITORING_EVENT',        // События мониторинга
        'ERROR_EVENT',             // Системная ошибка
        'ADMIN_ACTION'             // Административное действие
      ),
      allowNull: false,
      comment: 'Тип зарегистрированного события'
    },
    
    // Данные события в формате JSON
    event_data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Данные события в формате JSON'
    },
    
    // IP адрес источника события
    ip_address: {
      type: DataTypes.INET,
      allowNull: true,
      comment: 'IP адрес источника события'
    },
    
    // User Agent для веб-запросов
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User Agent браузера/клиента'
    },
    
    // Идентификатор сессии
    session_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Идентификатор пользовательской сессии'
    },
    
    // Идентификатор пользователя (если применимо)
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Идентификатор пользователя'
    },
    
    // Сервис или компонент системы
    service_name: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Название сервиса или компонента'
    },
    
    // Уровень важности события
    severity: {
      type: DataTypes.ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'INFO',
      comment: 'Уровень важности события'
    },
    
    // Статус операции
    operation_status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILURE', 'PENDING', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'SUCCESS',
      comment: 'Статус выполнения операции'
    },
    
    // Длительность операции в миллисекундах
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      },
      comment: 'Длительность операции в миллисекундах'
    },
    
    // Дополнительные метаданные
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Дополнительные метаданные события'
    },
    
    // Контекст операции
    operation_context: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Контекст выполнения операции'
    },
    
    // Предыдущее состояние (для операций изменения)
    previous_state: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Предыдущее состояние объекта'
    },
    
    // Новое состояние (для операций изменения)
    new_state: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Новое состояние объекта'
    },
    
    // Сообщение об ошибке (если есть)
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Сообщение об ошибке'
    },
    
    // Стек ошибки (для отладки)
    error_stack: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Стек вызовов ошибки'
    },
    
    // Связанные объекты
    related_objects: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Связанные объекты и их идентификаторы'
    },
    
    // Теги для группировки и поиска
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Теги для группировки и поиска записей'
    },
    
    // Хеш для обнаружения изменений
    integrity_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'Хеш для проверки целостности записи'
    }
  }, {
    // Настройки таблицы
    tableName: 'audit_log',
    timestamps: true,
    underscored: true,
    
    // Партиционирование по дате (рекомендуется для больших объемов)
    
    // Индексы для оптимизации запросов
    indexes: [
      {
        fields: ['event_type', 'created_at']
      },
      {
        fields: ['severity', 'created_at']
      },
      {
        fields: ['operation_status']
      },
      {
        fields: ['session_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['service_name', 'event_type']
      },
      {
        fields: ['ip_address']
      },
      {
        fields: ['created_at']
      },
      // Композитные индексы для частых запросов
      {
        fields: ['event_type', 'operation_status', 'created_at']
      },
      {
        fields: ['severity', 'service_name', 'created_at']
      }
    ],
    
    // Хуки модели
    hooks: {
      beforeCreate: (auditLog, options) => {
        // Генерация хеша целостности
        if (!auditLog.integrity_hash) {
          auditLog.integrity_hash = auditLog.generateIntegrityHash();
        }
        
        // Автоматическое определение сервиса если не указан
        if (!auditLog.service_name && options.service) {
          auditLog.service_name = options.service;
        }
      }
    },
    
    // Scopes для удобных запросов
    scopes: {
      // По типу события
      byEventType: (eventType) => ({
        where: { event_type: eventType }
      }),
      
      // По уровню важности
      bySeverity: (severity) => ({
        where: { severity }
      }),
      
      // Критичные события
      critical: {
        where: { severity: 'CRITICAL' }
      },
      
      // Ошибки
      errors: {
        where: { 
          severity: ['ERROR', 'CRITICAL'],
          operation_status: 'FAILURE'
        }
      },
      
      // По сессии
      bySession: (sessionId) => ({
        where: { session_id: sessionId }
      }),
      
      // По пользователю
      byUser: (userId) => ({
        where: { user_id: userId }
      }),
      
      // По сервису
      byService: (serviceName) => ({
        where: { service_name: serviceName }
      }),
      
      // За период времени
      byDateRange: (startDate, endDate) => ({
        where: {
          created_at: {
            [sequelize.Sequelize.Op.between]: [startDate, endDate]
          }
        }
      }),
      
      // Недавние события
      recent: (hours = 24) => ({
        where: {
          created_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
          }
        }
      }),
      
      // События безопасности
      security: {
        where: {
          event_type: [
            'SECURITY_ALERT',
            'LOGIN_ATTEMPT', 
            'WALLET_ACCESSED',
            'CONFIG_CHANGED',
            'ADMIN_ACTION'
          ]
        }
      }
    }
  });
  
  // Ассоциации (пока нет прямых связей)
  AuditLog.associate = (models) => {
    // Возможные связи будут добавлены позже
  };
  
  // Методы экземпляра
  AuditLog.prototype.generateIntegrityHash = function() {
    const crypto = require('crypto');
    const data = JSON.stringify({
      event_type: this.event_type,
      event_data: this.event_data,
      created_at: this.created_at,
      session_id: this.session_id
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  };
  
  AuditLog.prototype.verifyIntegrity = function() {
    const expectedHash = this.generateIntegrityHash();
    return this.integrity_hash === expectedHash;
  };
  
  AuditLog.prototype.isSensitive = function() {
    const sensitiveEvents = [
      'WALLET_CREATED',
      'WALLET_ACCESSED',
      'CONFIG_CHANGED',
      'SECURITY_ALERT',
      'ADMIN_ACTION'
    ];
    
    return sensitiveEvents.includes(this.event_type);
  };
  
  AuditLog.prototype.addTag = async function(tag) {
    const tags = this.tags || [];
    if (!tags.includes(tag)) {
      tags.push(tag);
      this.tags = tags;
      await this.save();
    }
  };
  
  // Статические методы
  AuditLog.logEvent = async function(eventType, eventData, context = {}) {
    const logEntry = {
      event_type: eventType,
      event_data: eventData,
      ip_address: context.ip_address,
      user_agent: context.user_agent,
      session_id: context.session_id,
      user_id: context.user_id,
      service_name: context.service_name,
      severity: context.severity || 'INFO',
      operation_status: context.operation_status || 'SUCCESS',
      duration_ms: context.duration_ms,
      metadata: context.metadata || {},
      operation_context: context.operation_context || {},
      previous_state: context.previous_state,
      new_state: context.new_state,
      error_message: context.error_message,
      error_stack: context.error_stack,
      related_objects: context.related_objects || {},
      tags: context.tags || []
    };
    
    return this.create(logEntry);
  };
  
  AuditLog.logMixingEvent = async function(eventType, mixRequestId, eventData, context = {}) {
    return this.logEvent(eventType, {
      mix_request_id: mixRequestId,
      ...eventData
    }, {
      ...context,
      service_name: 'mixing-engine',
      related_objects: {
        mix_request: mixRequestId,
        ...context.related_objects
      }
    });
  };
  
  AuditLog.logSecurityEvent = async function(eventType, eventData, context = {}) {
    return this.logEvent(eventType, eventData, {
      ...context,
      severity: 'WARNING',
      service_name: 'security',
      tags: ['security', ...(context.tags || [])]
    });
  };
  
  AuditLog.logError = async function(error, context = {}) {
    return this.logEvent('ERROR_EVENT', {
      error_name: error.name,
      error_message: error.message
    }, {
      ...context,
      severity: 'ERROR',
      operation_status: 'FAILURE',
      error_message: error.message,
      error_stack: error.stack
    });
  };
  
  AuditLog.getEventStats = async function(hours = 24) {
    const result = await this.findAll({
      where: {
        created_at: {
          [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
        }
      },
      attributes: [
        'event_type',
        'severity',
        'operation_status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['event_type', 'severity', 'operation_status']
    });
    
    const stats = {};
    result.forEach(item => {
      const eventType = item.event_type;
      const severity = item.severity;
      const status = item.operation_status;
      const count = parseInt(item.get('count'));
      
      if (!stats[eventType]) stats[eventType] = {};
      if (!stats[eventType][severity]) stats[eventType][severity] = {};
      
      stats[eventType][severity][status] = count;
    });
    
    return stats;
  };
  
  AuditLog.getSecuritySummary = async function(hours = 24) {
    const securityEvents = await this.scope(['security', { method: ['recent', hours] }])
      .findAll({
        order: [['created_at', 'DESC']]
      });
    
    const summary = {
      total_events: securityEvents.length,
      critical_events: securityEvents.filter(e => e.severity === 'CRITICAL').length,
      failed_operations: securityEvents.filter(e => e.operation_status === 'FAILURE').length,
      unique_ips: [...new Set(securityEvents.map(e => e.ip_address).filter(ip => ip))].length,
      event_types: {}
    };
    
    securityEvents.forEach(event => {
      const type = event.event_type;
      summary.event_types[type] = (summary.event_types[type] || 0) + 1;
    });
    
    return summary;
  };
  
  AuditLog.findSuspiciousActivity = async function(hours = 24) {
    // Поиск подозрительной активности
    const suspiciousPatterns = await this.findAll({
      where: {
        created_at: {
          [sequelize.Sequelize.Op.gte]: new Date(Date.now() - hours * 60 * 60 * 1000)
        },
        [sequelize.Sequelize.Op.or]: [
          { severity: 'CRITICAL' },
          { operation_status: 'FAILURE' },
          {
            event_type: [
              'SECURITY_ALERT',
              'LOGIN_ATTEMPT',
              'ADMIN_ACTION'
            ]
          }
        ]
      },
      order: [['created_at', 'DESC']]
    });
    
    // Группировка по IP адресам для выявления атак
    const ipActivity = {};
    suspiciousPatterns.forEach(event => {
      if (event.ip_address) {
        if (!ipActivity[event.ip_address]) {
          ipActivity[event.ip_address] = [];
        }
        ipActivity[event.ip_address].push(event);
      }
    });
    
    return {
      suspicious_events: suspiciousPatterns,
      ip_activity: ipActivity,
      high_risk_ips: Object.entries(ipActivity)
        .filter(([ip, events]) => events.length > 5)
        .map(([ip, events]) => ({ ip, event_count: events.length }))
    };
  };
  
  // Очистка старых записей
  AuditLog.cleanup = async function(olderThanDays = 90, keepSecurity = true) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const where = {
      created_at: {
        [sequelize.Sequelize.Op.lt]: cutoffDate
      }
    };
    
    // Сохранение записей безопасности дольше
    if (keepSecurity) {
      where.event_type = {
        [sequelize.Sequelize.Op.notIn]: [
          'SECURITY_ALERT',
          'LOGIN_ATTEMPT',
          'WALLET_ACCESSED',
          'CONFIG_CHANGED',
          'ADMIN_ACTION'
        ]
      };
    }
    
    const deletedCount = await this.destroy({ where });
    return deletedCount;
  };
  
  // Экспорт для анализа
  AuditLog.exportForAnalysis = async function(startDate, endDate, eventTypes = null) {
    const where = {
      created_at: {
        [sequelize.Sequelize.Op.between]: [startDate, endDate]
      }
    };
    
    if (eventTypes && Array.isArray(eventTypes)) {
      where.event_type = eventTypes;
    }
    
    const events = await this.findAll({
      where,
      order: [['created_at', 'ASC']],
      attributes: { exclude: ['error_stack', 'integrity_hash'] } // Исключаем технические поля
    });
    
    return events.map(event => ({
      timestamp: event.created_at,
      event_type: event.event_type,
      severity: event.severity,
      status: event.operation_status,
      service: event.service_name,
      ip_address: event.ip_address,
      session_id: event.session_id,
      data: event.event_data,
      duration: event.duration_ms
    }));
  };
  
  return AuditLog;
};