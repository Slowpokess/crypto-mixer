/**
 * Конфигурация подключения к базе данных для crypto-mixer backend
 * Поддерживает различные окружения: development, production, test
 * Использует переменные окружения для безопасного хранения учетных данных
 */

import { Sequelize, Options, Transaction } from 'sequelize';

// Определение типов для конфигурации базы данных
interface PoolConfig {
  max: number;
  min: number;
  acquire: number;
  idle: number;
  evict?: number;
}

interface DialectOptions {
  ssl?: boolean | {
    require: boolean;
    rejectUnauthorized: boolean;
  };
  connectTimeout: number;
  requestTimeout: number;
}

interface DefineOptions {
  timestamps: boolean;
  createdAt: string;
  updatedAt: string;
  underscored: boolean;
  freezeTableName: boolean;
}

interface SyncOptions {
  force: boolean;
  alter: boolean;
}

interface DatabaseConfig extends Options {
  host?: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  dialect: 'postgres';
  logging: boolean | ((sql: string, timing?: number) => void);
  pool: PoolConfig;
  dialectOptions: DialectOptions;
  define: DefineOptions;
  transactionType?: typeof Transaction.TYPES[keyof typeof Transaction.TYPES];
  isolationLevel: Transaction.ISOLATION_LEVELS;
  sync: SyncOptions;
  benchmark?: boolean;
  logQueryParameters?: boolean;
}

interface AllConfigs {
  development: DatabaseConfig;
  test: DatabaseConfig;
  production: DatabaseConfig;
}

// Определение текущего окружения
const NODE_ENV: string = process.env.NODE_ENV || 'development';

// Базовая конфигурация для всех окружений
const baseConfig: Omit<DatabaseConfig, 'host' | 'database' | 'username' | 'password'> = {
  dialect: 'postgres',
  logging: NODE_ENV === 'development' ? console.log : false,
  
  // Настройки пула соединений для оптимальной производительности
  pool: {
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '') || 20,      // Максимальное количество соединений
    min: parseInt(process.env.DB_MIN_CONNECTIONS || '') || 5,       // Минимальное количество соединений
    acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT || '') || 30000,  // Таймаут получения соединения
    idle: parseInt(process.env.DB_IDLE_TIMEOUT || '') || 10000,     // Время простоя соединения
    evict: parseInt(process.env.DB_EVICT_TIMEOUT || '') || 60000,   // Время удаления неактивных соединений
  },
  
  // Настройки для продакшена
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false  // Для самоподписанных сертификатов
    } : false,
    
    // Настройки таймаутов для стабильности соединения
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '') || 60000,
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '') || 30000,
  },
  
  // Параметры запросов
  define: {
    timestamps: true,           // Автоматическое добавление createdAt и updatedAt
    createdAt: 'created_at',    // Стандартизация имен полей
    updatedAt: 'updated_at',
    underscored: true,          // Использование snake_case для имен полей
    freezeTableName: true,      // Отключение плюрализации имен таблиц
  },
  
  // Настройки транзакций
  transactionType: Transaction.TYPES.IMMEDIATE,
  isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  
  // Настройки синхронизации (отключены для продакшена)
  sync: {
    force: false,
    alter: NODE_ENV === 'development'
  },
  
  port: parseInt(process.env.DB_PORT || '') || 5432,
};

// Конфигурации для различных окружений
const config: AllConfigs = {
  development: {
    ...baseConfig,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '') || 5432,
    database: process.env.DB_NAME || 'cryptomixer_dev',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    logging: console.log,
    
    // Расширенное логирование для разработки
    benchmark: true,
    logQueryParameters: true,
  },
  
  test: {
    ...baseConfig,
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '') || 5432,
    database: process.env.TEST_DB_NAME || 'cryptomixer_test',
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'password',
    logging: false,
    
    // Настройки для тестирования
    pool: {
      max: 5,
      min: 1,
      acquire: 10000,
      idle: 5000
    }
  },
  
  production: {
    ...baseConfig,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '') || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    logging: false,
    
    // Продакшен настройки для максимальной стабильности
    pool: {
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '') || 50,
      min: parseInt(process.env.DB_MIN_CONNECTIONS || '') || 10,
      acquire: 60000,
      idle: 30000,
      evict: 120000
    },
    
    // Настройки безопасности для продакшена
    dialectOptions: {
      ...baseConfig.dialectOptions,
      ssl: {
        require: true,
        rejectUnauthorized: true
      }
    },
    
    // Отключение опасных операций в продакшене
    sync: {
      force: false,
      alter: false
    }
  }
};

// Валидация обязательных переменных окружения для продакшена
if (NODE_ENV === 'production') {
  const requiredEnvVars: string[] = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingVars: string[] = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingVars.length > 0) {
    throw new Error(`Отсутствуют обязательные переменные окружения для БД: ${missingVars.join(', ')}`);
  }
}

// Функция создания подключения
const createConnection = (): Sequelize => {
  const currentConfig: DatabaseConfig = config[NODE_ENV as keyof AllConfigs];
  
  // Создание экземпляра Sequelize с текущей конфигурацией
  const sequelize = new Sequelize(
    currentConfig.database!,
    currentConfig.username!,
    currentConfig.password!,
    currentConfig
  );
  
  // Тестирование подключения при создании
  sequelize.authenticate()
    .then(() => {
      console.log(`✅ Подключение к БД установлено успешно (${NODE_ENV})`);
    })
    .catch(err => {
      console.error('❌ Ошибка подключения к БД:', err);
      process.exit(1);
    });
  
  return sequelize;
};

// Экспорт конфигурации для текущего окружения
const currentConfig: DatabaseConfig = config[NODE_ENV as keyof AllConfigs];

// Экспорт всех конфигураций для использования в других модулях
const allConfigs: AllConfigs = config;

export default currentConfig;
export { allConfigs as all, createConnection };
