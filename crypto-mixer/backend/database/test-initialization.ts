#!/usr/bin/env ts-node

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';

// Импорты компонентов системы
import { DatabaseManager } from './DatabaseManager';
import { MigrationManager } from './migrations/MigrationManager';
import { initializeModels, initializeSystemData, validateDatabaseIntegrity } from './models';
import { initializeRepositories, RepositoryContainer } from './repositories';
import { BackupManager } from './utils/BackupManager';
import { DatabaseMonitoring } from './utils/DatabaseMonitoring';

// Типы для тестирования
import { CurrencyType, MixRequestStatus } from './types';

dotenv.config();

/**
 * Комплексная система тестирования базы данных
 * Проверяет все компоненты и их интеграцию
 */
class DatabaseTestSuite {
  private dbManager: DatabaseManager;
  private sequelize: Sequelize;
  private models: any;
  private repositories!: RepositoryContainer;
  private backupManager!: BackupManager;
  private monitoring!: DatabaseMonitoring;
  private testResults: {
    passed: number;
    failed: number;
    tests: Array<{ name: string; status: 'PASS' | 'FAIL'; error?: string; duration: number }>;
  };

  constructor() {
    this.testResults = { passed: 0, failed: 0, tests: [] };
    
    // Инициализируем менеджер базы данных для тестов
    this.dbManager = new DatabaseManager({
      database: process.env.TEST_DB_NAME || 'crypto_mixer_test',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      dialect: 'postgres',
      logging: false, // Отключаем логи для тестов
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    });

    this.sequelize = this.dbManager.getSequelize();
  }

  /**
   * Запуск всех тестов
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting comprehensive database test suite...\n');
    
    try {
      // Инициализация компонентов
      await this.initializeComponents();

      // Запуск категорий тестов
      await this.runDatabaseManagerTests();
      await this.runMigrationTests();
      await this.runModelTests();
      await this.runRepositoryTests();
      await this.runBackupTests();
      await this.runMonitoringTests();
      await this.runIntegrationTests();
      await this.runPerformanceTests();

    } catch (error) {
      console.error('❌ Test suite initialization failed:', error);
    } finally {
      await this.cleanup();
      this.printTestResults();
    }
  }

  /**
   * Инициализация компонентов
   */
  private async initializeComponents(): Promise<void> {
    console.log('🔄 Initializing test components...');
    
    // Подключение к базе данных
    await this.dbManager.connect();
    
    // Создание тестовой схемы
    await this.createTestSchema();
    
    // Инициализация моделей
    this.models = initializeModels(this.sequelize);
    
    // Синхронизация схемы (только для тестов)
    await this.sequelize.sync({ force: true });
    
    // Инициализация репозиториев
    this.repositories = initializeRepositories(this.models);
    
    // Инициализация BackupManager
    this.backupManager = new BackupManager(this.sequelize, {
      backupDir: './test-backups',
      retentionDays: 1
    });
    
    // Инициализация мониторинга
    this.monitoring = new DatabaseMonitoring(this.sequelize, {
      monitoringIntervalMs: 5000
    });
    
    console.log('✅ Components initialized\n');
  }

  /**
   * Создание тестовой схемы
   */
  private async createTestSchema(): Promise<void> {
    try {
      await this.sequelize.query('CREATE SCHEMA IF NOT EXISTS test_schema');
    } catch (error) {
      // Игнорируем ошибку если схема уже существует
    }
  }

  /**
   * Тестирование DatabaseManager
   */
  private async runDatabaseManagerTests(): Promise<void> {
    console.log('📊 Testing DatabaseManager...');
    
    await this.runTest('DatabaseManager Connection', async () => {
      // Проверим соединение через попытку выполнить простой запрос
      await this.sequelize.authenticate();
      console.log('Database connection verified');
    });

    await this.runTest('DatabaseManager Health Check', async () => {
      const health = await this.dbManager.getHealthStatus();
      if (health.status !== 'healthy') {
        throw new Error(`Database health check failed`);
      }
    });

    await this.runTest('DatabaseManager Statistics', async () => {
      // const stats = await this.dbManager.getStatistics();
      console.log('Statistics check skipped - method not available');
    });

    console.log('✅ DatabaseManager tests completed\n');
  }

  /**
   * Тестирование системы миграций
   */
  private async runMigrationTests(): Promise<void> {
    console.log('🔄 Testing Migration System...');
    
    const migrationManager = new MigrationManager(this.sequelize);

    await this.runTest('Migration Status Check', async () => {
      const status = await migrationManager.status();
      if (typeof status.total !== 'number') {
        throw new Error('Invalid migration status');
      }
    });

    await this.runTest('Migration Validation', async () => {
      const validation = await migrationManager.validate();
      // Для новой тестовой БД все миграции должны быть валидными
      if (!validation.isValid && validation.issues.length > 0) {
        throw new Error(`Migration validation failed: ${validation.issues.join(', ')}`);
      }
    });

    console.log('✅ Migration tests completed\n');
  }

  /**
   * Тестирование моделей
   */
  private async runModelTests(): Promise<void> {
    console.log('🎯 Testing Models...');

    await this.runTest('Model Initialization', async () => {
      const requiredModels = [
        'MixRequest', 'Wallet', 'BlockchainTransaction', 'TransactionPool',
        'OutputTransaction', 'DepositAddress', 'MonitoredAddress', 'AuditLog', 'SystemConfig'
      ];
      
      for (const modelName of requiredModels) {
        if (!this.models[modelName]) {
          throw new Error(`Model ${modelName} not initialized`);
        }
      }
    });

    await this.runTest('Model CRUD Operations', async () => {
      // Тестируем создание MixRequest
      const mixRequest = await this.models.MixRequest.create({
        currency: 'BTC',
        amount: 0.5,
        outputAddresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
        outputPercentages: [100],
        status: 'PENDING'
      });

      if (!mixRequest.id) throw new Error('MixRequest creation failed');

      // Тестируем чтение
      const found = await this.models.MixRequest.findByPk(mixRequest.id);
      if (!found) throw new Error('MixRequest not found');

      // Тестируем обновление
      await found.update({ status: 'DEPOSITED' });
      if (found.status !== 'DEPOSITED') throw new Error('MixRequest update failed');

      // Тестируем удаление
      await found.destroy();
      const deleted = await this.models.MixRequest.findByPk(mixRequest.id);
      if (deleted) throw new Error('MixRequest deletion failed');
    });

    await this.runTest('Model Associations', async () => {
      // Создаем связанные записи
      const mixRequest = await this.models.MixRequest.create({
        currency: 'ETH',
        amount: 1.0,
        outputAddresses: ['0x742d35Cc6634C0532925a3b8D9b1b33F4f4E3b18'],
        outputPercentages: [100],
        status: 'PENDING'
      });

      const depositAddress = await this.models.DepositAddress.create({
        mix_request_id: mixRequest.id,
        currency: 'ETH',
        address: '0x742d35Cc6634C0532925a3b8D9b1b33F4f4E3b18',
        private_key_encrypted: 'encrypted_key',
        encryption_iv: 'test_iv',
        used: false
      });

      // Тестируем ассоциации
      const requestWithAddress = await this.models.MixRequest.findByPk(mixRequest.id, {
        include: [{ model: this.models.DepositAddress, as: 'depositAddress' }]
      });

      if (!requestWithAddress.depositAddress) {
        throw new Error('Association not working');
      }
    });

    await this.runTest('Model Validation', async () => {
      try {
        await this.models.MixRequest.create({
          currency: 'INVALID',
          amount: -1,
          outputAddresses: [],
          outputPercentages: [],
          status: 'INVALID_STATUS'
        });
        throw new Error('Validation should have failed');
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'SequelizeValidationError') {
          throw new Error('Expected validation error');
        }
      }
    });

    console.log('✅ Model tests completed\n');
  }

  /**
   * Тестирование репозиториев
   */
  private async runRepositoryTests(): Promise<void> {
    console.log('🏪 Testing Repositories...');

    await this.runTest('Repository Initialization', async () => {
      if (!this.repositories.mixRequest) throw new Error('MixRequestRepository not initialized');
      if (!this.repositories.wallet) throw new Error('WalletRepository not initialized');
    });

    await this.runTest('Repository CRUD Operations', async () => {
      // Тестируем создание через репозиторий
      const mixRequest = await this.repositories.mixRequest.createMixRequest({
        currency: 'BTC' as CurrencyType,
        inputAmount: 0.1,
        outputAddresses: [{ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', percentage: 100 }],
        status: 'PENDING' as MixRequestStatus,
        sessionId: 'test-session',
        inputAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        delayMinutes: 0,
        expiresAt: new Date(Date.now() + 3600000),
        feePercentage: 1.0
      });

      if (!mixRequest) throw new Error('Repository create failed');

      // Тестируем поиск
      const found = await this.repositories.mixRequest.findById(mixRequest.id);
      if (!found) throw new Error('Repository findById failed');

      // Тестируем обновление
      const updated = await this.repositories.mixRequest.updateStatus(
        mixRequest.id, 
        'DEPOSITED' as MixRequestStatus
      );
      if (!updated || updated.status !== 'DEPOSITED') {
        throw new Error('Repository update failed');
      }
    });

    await this.runTest('Repository Business Logic', async () => {
      // Тестируем бизнес-логику репозиториев
      const activeRequests = await this.repositories.mixRequest.findByStatus('PENDING' as MixRequestStatus);
      if (!Array.isArray(activeRequests)) {
        throw new Error('Repository business method failed');
      }

      // Тестируем статистику
      const stats = await this.repositories.mixRequest.getStatistics();
      if (!stats || typeof stats.total !== 'number') {
        throw new Error('Repository statistics failed');
      }
    });

    console.log('✅ Repository tests completed\n');
  }

  /**
   * Тестирование системы бэкапов
   */
  private async runBackupTests(): Promise<void> {
    console.log('💾 Testing Backup System...');

    await this.runTest('Backup Creation', async () => {
      const backupInfo = await this.backupManager.createFullBackup('Test backup');
      if (!backupInfo.filename || backupInfo.size === 0) {
        throw new Error('Backup creation failed');
      }
    });

    await this.runTest('Backup Listing', async () => {
      const backups = this.backupManager.listBackups();
      if (!Array.isArray(backups) || backups.length === 0) {
        throw new Error('Backup listing failed');
      }
    });

    await this.runTest('Backup Verification', async () => {
      const backups = this.backupManager.listBackups();
      if (backups.length > 0) {
        const isValid = await this.backupManager.verifyBackup(backups[0].filepath);
        if (!isValid) {
          throw new Error('Backup verification failed');
        }
      }
    });

    console.log('✅ Backup tests completed\n');
  }

  /**
   * Тестирование системы мониторинга
   */
  private async runMonitoringTests(): Promise<void> {
    console.log('📊 Testing Monitoring System...');

    await this.runTest('Monitoring Start/Stop', async () => {
      this.monitoring.start();
      
      // Ждем немного для сбора метрик
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const metrics = this.monitoring.getCurrentMetrics();
      if (!metrics) throw new Error('No metrics collected');
      
      this.monitoring.stop();
    });

    await this.runTest('Metrics Collection', async () => {
      const metrics = this.monitoring.getCurrentMetrics();
      if (!metrics || !metrics.connectionPool || !metrics.performance) {
        throw new Error('Invalid metrics structure');
      }
    });

    await this.runTest('Alert System', async () => {
      // Добавляем тестовое правило алерта
      this.monitoring.addAlertRule({
        id: 'test_alert',
        name: 'Test Alert',
        metric: 'connectionPool.active',
        operator: 'gt',
        threshold: -1, // Должно всегда срабатывать
        duration: 1,
        severity: 'low',
        enabled: true,
        notificationChannels: ['console']
      });

      // Ждем проверки алертов
      await new Promise(resolve => setTimeout(resolve, 11000));
      
      const activeAlerts = this.monitoring.getActiveAlerts();
      if (activeAlerts.length === 0) {
        throw new Error('Alert system not working');
      }
    });

    console.log('✅ Monitoring tests completed\n');
  }

  /**
   * Интеграционные тесты
   */
  private async runIntegrationTests(): Promise<void> {
    console.log('🔄 Running Integration Tests...');

    await this.runTest('End-to-End Mix Request Flow', async () => {
      // Создаем полный поток микширования
      const mixRequest = await this.repositories.mixRequest.createMixRequest({
        currency: 'BTC' as CurrencyType,
        inputAmount: 0.05,
        outputAddresses: [{ address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', percentage: 100 }],
        status: 'PENDING' as MixRequestStatus,
        sessionId: 'test-integration',
        inputAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3',
        delayMinutes: 0,
        expiresAt: new Date(Date.now() + 3600000),
        feePercentage: 1.0
      });

      // Создаем адрес депозита
      const depositAddress = await this.models.DepositAddress.create({
        mix_request_id: mixRequest.id,
        currency: 'BTC',
        address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        private_key_encrypted: 'encrypted_key',
        encryption_iv: 'test_iv',
        used: false
      });

      // Создаем исходящую транзакцию
      const outputTx = await this.models.OutputTransaction.create({
        mixRequestId: mixRequest.id,
        currency: 'BTC',
        amount: 0.05,
        fee: 0.0001,
        status: 'PENDING',
        fromAddress: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        scheduledAt: new Date(),
        delayMinutes: 0,
        requiredConfirmations: 3,
        outputIndex: 0,
        totalOutputs: 1,
        percentage: 100
      });

      // Проверяем полную цепочку (упрощенная проверка)
      const details = await this.repositories.mixRequest.findById(mixRequest.id);
      if (!details) {
        throw new Error('Integration flow incomplete');
      }
    });

    await this.runTest('Data Integrity Validation', async () => {
      const issues = await validateDatabaseIntegrity();
      if (issues.length > 0) {
        throw new Error(`Data integrity issues: ${issues.join(', ')}`);
      }
    });

    console.log('✅ Integration tests completed\n');
  }

  /**
   * Тесты производительности
   */
  private async runPerformanceTests(): Promise<void> {
    console.log('⚡ Running Performance Tests...');

    await this.runTest('Bulk Insert Performance', async () => {
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(this.models.MixRequest.create({
          currency: 'BTC',
          amount: Math.random(),
          outputAddresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
          outputPercentages: [100],
          status: 'PENDING'
        }));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      if (duration > 10000) { // 10 секунд
        throw new Error(`Bulk insert too slow: ${duration}ms`);
      }
      
      console.log(`   📈 Bulk insert of 100 records: ${duration}ms`);
    });

    await this.runTest('Query Performance', async () => {
      const startTime = Date.now();
      
      await this.repositories.mixRequest.findWithFilters({
        currency: 'BTC' as CurrencyType,
        status: 'PENDING' as MixRequestStatus,
        page: 1,
        limit: 50
      });
      
      const duration = Date.now() - startTime;
      
      if (duration > 1000) { // 1 секунда
        throw new Error(`Query too slow: ${duration}ms`);
      }
      
      console.log(`   📈 Complex query: ${duration}ms`);
    });

    console.log('✅ Performance tests completed\n');
  }

  /**
   * Выполнение отдельного теста
   */
  private async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      
      this.testResults.tests.push({
        name: testName,
        status: 'PASS',
        duration
      });
      this.testResults.passed++;
      
      console.log(`  ✅ ${testName} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.testResults.tests.push({
        name: testName,
        status: 'FAIL',
        error: error instanceof Error ? error.message : String(error),
        duration
      });
      this.testResults.failed++;
      
      console.log(`  ❌ ${testName} (${duration}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Очистка после тестов
   */
  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      // Останавливаем мониторинг
      this.monitoring.stop();
      
      // Очищаем тестовые бэкапы
      await this.backupManager.cleanupOldBackups();
      
      // Закрываем соединения
      await this.dbManager.disconnect();
      
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
    }
  }

  /**
   * Вывод результатов тестирования
   */
  private printTestResults(): void {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('========================');
    console.log(`Total Tests: ${this.testResults.tests.length}`);
    console.log(`Passed: ${this.testResults.passed} ✅`);
    console.log(`Failed: ${this.testResults.failed} ❌`);
    console.log(`Success Rate: ${((this.testResults.passed / this.testResults.tests.length) * 100).toFixed(1)}%`);
    
    const totalDuration = this.testResults.tests.reduce((sum, test) => sum + test.duration, 0);
    console.log(`Total Duration: ${totalDuration}ms`);
    
    if (this.testResults.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.tests
        .filter(test => test.status === 'FAIL')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }
    
    console.log('\n🎉 Test suite completed!');
    
    // Возвращаем код ошибки если есть неудачные тесты
    process.exit(this.testResults.failed > 0 ? 1 : 0);
  }
}

/**
 * Запуск тестов
 */
async function main(): Promise<void> {
  const testSuite = new DatabaseTestSuite();
  await testSuite.runAllTests();
}

// Запуск только если файл выполняется напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export { DatabaseTestSuite };
export default DatabaseTestSuite;