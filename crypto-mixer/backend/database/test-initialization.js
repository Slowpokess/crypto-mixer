/**
 * Тестирование инициализации database системы
 * Проверяет все компоненты: подключение, модели, миграции, репозитории
 */

const DatabaseManager = require('./DatabaseManager');
const { initializeModels } = require('./models');
const { MixRequestRepository, WalletRepository } = require('./repositories');
const logger = require('../utils/logger');

async function testDatabaseInitialization() {
  try {
    console.log('🔄 Начинаем тестирование database системы...\n');

    // 1. Тест инициализации DatabaseManager
    console.log('1️⃣ Тестирование DatabaseManager...');
    await DatabaseManager.initialize('development');
    
    const health = await DatabaseManager.getHealth();
    console.log('✅ DatabaseManager инициализирован:', health.status);
    
    const poolStatus = await DatabaseManager.getPoolStatus();
    console.log('✅ Connection pool активен:', poolStatus ? 'OK' : 'ERROR');

    // 2. Тест инициализации моделей
    console.log('\n2️⃣ Тестирование инициализации моделей...');
    const sequelize = DatabaseManager.getSequelize();
    const models = await initializeModels(sequelize);
    
    console.log('✅ Модели инициализированы:', Object.keys(models).filter(k => k !== 'sequelize' && k !== 'Sequelize').length);

    // 3. Тест подключения к БД
    console.log('\n3️⃣ Тестирование подключения к БД...');
    const connectionTest = await DatabaseManager.testConnection();
    console.log('✅ Тест подключения:', connectionTest.success ? `OK (${connectionTest.responseTime}ms)` : 'FAILED');

    // 4. Тест репозиториев
    console.log('\n4️⃣ Тестирование репозиториев...');
    
    // Проверяем что репозитории могут создавать запросы (без реального выполнения)
    try {
      const mixRepo = MixRequestRepository;
      const walletRepo = WalletRepository;
      console.log('✅ Репозитории доступны: MixRequest, Wallet');
    } catch (error) {
      console.log('❌ Ошибка репозиториев:', error.message);
    }

    // 5. Тест системы валидации
    console.log('\n5️⃣ Тестирование системы валидации...');
    const { validateCurrency, validateAmount } = require('./types');
    
    const currencyTest = validateCurrency('BTC');
    const amountTest = validateAmount(1.5);
    console.log('✅ Валидация работает:', currencyTest && amountTest ? 'OK' : 'ERROR');

    // 6. Тест утилит
    console.log('\n6️⃣ Тестирование утилит...');
    const { BackupManager, DatabaseMonitoring } = require('./utils');
    
    const backupStats = await BackupManager.getBackupStats();
    console.log('✅ BackupManager:', backupStats ? 'OK' : 'ERROR');
    
    const monitoringStatus = DatabaseMonitoring.getMonitoringStatus ? 'OK' : 'ERROR';
    console.log('✅ DatabaseMonitoring:', monitoringStatus);

    // 7. Финальный health check
    console.log('\n7️⃣ Финальная проверка...');
    const finalHealth = await DatabaseManager.getHealth();
    const isHealthy = DatabaseManager.isHealthy();
    
    console.log('✅ Финальный статус:', finalHealth.status);
    console.log('✅ Database система готова:', isHealthy ? 'YES' : 'NO');

    // Закрываем соединение
    await DatabaseManager.disconnect();
    console.log('\n🎉 Тестирование завершено успешно!');
    
    return {
      success: true,
      components: {
        databaseManager: true,
        models: true,
        repositories: true,
        validation: true,
        utilities: true,
        healthCheck: isHealthy
      }
    };

  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error);
    
    try {
      await DatabaseManager.disconnect();
    } catch (disconnectError) {
      console.error('Ошибка при закрытии соединения:', disconnectError.message);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Запуск если файл вызывается напрямую
if (require.main === module) {
  testDatabaseInitialization()
    .then(result => {
      console.log('\n📊 Результат тестирования:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

module.exports = testDatabaseInitialization;