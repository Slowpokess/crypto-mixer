/**
 * Основной модуль базы данных для crypto-mixer
 * Управляет подключением, моделями и транзакциями
 */

const { Sequelize, DataTypes } = require('sequelize');
const databaseConfig = require('../config/database');

// Создание единого экземпляра Sequelize для всего приложения
const sequelize = databaseConfig.createConnection();

// Объект для хранения всех моделей
const db = {};

// Импорт всех моделей (будут добавлены после создания)
const models = [
  'MixRequest',
  'DepositAddress', 
  'OutputTransaction',
  'Wallet',
  'MonitoredAddress',
  'TransactionPool',
  'BlockchainTransaction',
  'SystemConfig',
  'AuditLog'
];

// Динамическая загрузка моделей
models.forEach(modelName => {
  try {
    const model = require(`./models/${modelName}`)(sequelize, DataTypes);
    db[model.name] = model;
  } catch (error) {
    console.warn(`⚠️  Модель ${modelName} не найдена, будет создана позже`);
  }
});

// Установка ассоциаций между моделями
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Добавление экземпляра sequelize и класса Sequelize в объект db
db.sequelize = sequelize;
db.Sequelize = Sequelize;

/**
 * Инициализация базы данных
 * Создает таблицы и выполняет миграции при необходимости
 */
db.initialize = async () => {
  try {
    console.log('🔄 Инициализация базы данных...');
    
    // Проверка подключения
    await sequelize.authenticate();
    console.log('✅ Подключение к базе данных установлено');
    
    // Синхронизация моделей (только для разработки)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Синхронизация моделей завершена');
    }
    
    console.log('🎉 База данных успешно инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    throw error;
  }
};

/**
 * Закрытие соединения с базой данных
 */
db.close = async () => {
  try {
    await sequelize.close();
    console.log('✅ Соединение с базой данных закрыто');
  } catch (error) {
    console.error('❌ Ошибка закрытия соединения:', error);
    throw error;
  }
};

/**
 * Проверка здоровья базы данных
 * Возвращает статус подключения и базовую статистику
 */
db.healthCheck = async () => {
  try {
    // Тест подключения
    await sequelize.authenticate();
    
    // Получение информации о соединениях
    const [results] = await sequelize.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    
    return {
      status: 'healthy',
      database: sequelize.config.database,
      connections: results[0],
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Выполнение транзакции с автоматическим откатом при ошибке
 */
db.transaction = async (callback) => {
  const transaction = await sequelize.transaction();
  
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Утилиты для работы с запросами
 */
db.utils = {
  /**
   * Безопасное выполнение сырого SQL запроса
   */
  rawQuery: async (query, replacements = {}) => {
    try {
      return await sequelize.query(query, {
        replacements,
        type: Sequelize.QueryTypes.SELECT
      });
    } catch (error) {
      console.error('❌ Ошибка выполнения SQL запроса:', error);
      throw error;
    }
  },
  
  /**
   * Получение статистики по таблице
   */
  getTableStats: async (tableName) => {
    const [results] = await sequelize.query(`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE tablename = :tableName
    `, {
      replacements: { tableName },
      type: Sequelize.QueryTypes.SELECT
    });
    
    return results;
  },
  
  /**
   * Очистка старых записей из таблицы
   */
  cleanupOldRecords: async (tableName, dateField, olderThanDays) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const [results] = await sequelize.query(`
      DELETE FROM ${tableName} 
      WHERE ${dateField} < :cutoffDate
    `, {
      replacements: { cutoffDate },
      type: Sequelize.QueryTypes.DELETE
    });
    
    return results;
  }
};

// Обработка graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Получен сигнал SIGINT, закрытие соединения с БД...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Получен сигнал SIGTERM, закрытие соединения с БД...');
  await db.close();
  process.exit(0);
});

module.exports = db;