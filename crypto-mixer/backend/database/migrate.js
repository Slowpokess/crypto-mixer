#!/usr/bin/env node

/**
 * CLI утилита для управления миграциями базы данных
 * Использование: node migrate.js [command] [options]
 */

const MigrationManager = require('./migrations');
const databaseConfig = require('../config/database');

// Создание подключения к базе данных
const sequelize = databaseConfig.createConnection();
const migrationManager = new MigrationManager(sequelize);

// Обработка аргументов командной строки
const args = process.argv.slice(2);
const command = args[0];

async function runCommand() {
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        console.log('🚀 Запуск миграций...');
        await migrationManager.migrate();
        break;

      case 'down':
      case 'rollback':
        const steps = parseInt(args[1]) || 1;
        console.log(`🔄 Откат ${steps} миграций...`);
        await migrationManager.rollback(steps);
        break;

      case 'status':
        console.log('📊 Получение статуса миграций...');
        await migrationManager.status();
        break;

      case 'create':
        const migrationName = args[1];
        if (!migrationName) {
          console.error('❌ Ошибка: Необходимо указать название миграции');
          console.log('Пример: node migrate.js create "add user table"');
          process.exit(1);
        }
        const filepath = migrationManager.createMigration(migrationName);
        console.log(`✅ Создана миграция: ${filepath}`);
        break;

      case 'validate':
        console.log('🔍 Проверка целостности миграций...');
        const issues = await migrationManager.validateMigrations();
        
        if (issues.length === 0) {
          console.log('✅ Все миграции валидны');
        } else {
          console.log('❌ Найдены проблемы:');
          issues.forEach(issue => {
            console.log(`  - ${issue.version}: ${issue.message} (${issue.type})`);
          });
          process.exit(1);
        }
        break;

      case 'init':
        console.log('🔧 Инициализация системы миграций...');
        await migrationManager.initializeMigrationTable();
        console.log('✅ Система миграций инициализирована');
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.error(`❌ Неизвестная команда: ${command}`);
        showHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Ошибка выполнения команды:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Стек ошибки:', error.stack);
    }
    
    process.exit(1);
  } finally {
    // Закрытие соединения с БД
    await sequelize.close();
  }
}

function showHelp() {
  console.log(`
🗄️  Система управления миграциями Crypto Mixer

Использование:
  node migrate.js <command> [options]

Команды:
  up, migrate           Применить все ожидающие миграции
  down, rollback [n]    Откатить последние n миграций (по умолчанию 1)
  status               Показать статус всех миграций
  create <name>        Создать новую миграцию
  validate             Проверить целостность миграций
  init                 Инициализировать систему миграций
  help                 Показать эту справку

Примеры:
  node migrate.js up                    # Применить все миграции
  node migrate.js down 2                # Откатить последние 2 миграции
  node migrate.js create "add indexes"  # Создать новую миграцию
  node migrate.js status                # Показать статус
  node migrate.js validate              # Проверить целостность

Переменные окружения:
  NODE_ENV             Окружение (development/production)
  DB_HOST              Хост базы данных
  DB_PORT              Порт базы данных
  DB_NAME              Имя базы данных
  DB_USER              Пользователь БД
  DB_PASSWORD          Пароль БД

Примеры переменных окружения:
  NODE_ENV=development DB_NAME=cryptomixer_dev node migrate.js up
  NODE_ENV=production node migrate.js status
`);
}

// Обработка сигналов завершения
process.on('SIGINT', async () => {
  console.log('\n🔄 Получен сигнал прерывания, закрытие соединения...');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Получен сигнал завершения, закрытие соединения...');
  await sequelize.close();
  process.exit(0);
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанная ошибка Promise:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанное исключение:', error);
  process.exit(1);
});

// Запуск команды
if (require.main === module) {
  runCommand();
}

module.exports = { migrationManager, sequelize };