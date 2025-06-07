"use strict";
/**
 * Конфигурация подключения к базе данных для crypto-mixer backend
 * Поддерживает различные окружения: development, production, test
 * Использует переменные окружения для безопасного хранения учетных данных
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConnection = exports.all = void 0;
const sequelize_1 = require("sequelize");
// Определение текущего окружения
const NODE_ENV = process.env.NODE_ENV || 'development';
// Базовая конфигурация для всех окружений
const baseConfig = {
    dialect: 'postgres',
    logging: NODE_ENV === 'development' ? console.log : false,
    // Настройки пула соединений для оптимальной производительности
    pool: {
        max: parseInt(process.env.DB_MAX_CONNECTIONS || '') || 20, // Максимальное количество соединений
        min: parseInt(process.env.DB_MIN_CONNECTIONS || '') || 5, // Минимальное количество соединений
        acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT || '') || 30000, // Таймаут получения соединения
        idle: parseInt(process.env.DB_IDLE_TIMEOUT || '') || 10000, // Время простоя соединения
        evict: parseInt(process.env.DB_EVICT_TIMEOUT || '') || 60000, // Время удаления неактивных соединений
    },
    // Настройки для продакшена
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true' ? {
            require: true,
            rejectUnauthorized: false // Для самоподписанных сертификатов
        } : false,
        // Настройки таймаутов для стабильности соединения
        connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '') || 60000,
        requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '') || 30000,
    },
    // Параметры запросов
    define: {
        timestamps: true, // Автоматическое добавление createdAt и updatedAt
        createdAt: 'created_at', // Стандартизация имен полей
        updatedAt: 'updated_at',
        underscored: true, // Использование snake_case для имен полей
        freezeTableName: true, // Отключение плюрализации имен таблиц
    },
    // Настройки транзакций
    transactionType: sequelize_1.Transaction.TYPES.IMMEDIATE,
    isolationLevel: sequelize_1.Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    // Настройки синхронизации (отключены для продакшена)
    sync: {
        force: false,
        alter: NODE_ENV === 'development'
    },
    port: parseInt(process.env.DB_PORT || '') || 5432,
};
// Конфигурации для различных окружений
const config = {
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
    const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingVars.length > 0) {
        throw new Error(`Отсутствуют обязательные переменные окружения для БД: ${missingVars.join(', ')}`);
    }
}
// Функция создания подключения
const createConnection = () => {
    const currentConfig = config[NODE_ENV];
    // Создание экземпляра Sequelize с текущей конфигурацией
    const sequelize = new sequelize_1.Sequelize(currentConfig.database, currentConfig.username, currentConfig.password, currentConfig);
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
exports.createConnection = createConnection;
// Экспорт конфигурации для текущего окружения
const currentConfig = config[NODE_ENV];
// Экспорт всех конфигураций для использования в других модулях
const allConfigs = config;
exports.all = allConfigs;
exports.default = currentConfig;
//# sourceMappingURL=database.js.map