#!/usr/bin/env ts-node

import { BlockchainManager } from './blockchain/manager';
import { TransactionMonitor } from './monitors/transaction.monitor';
import { Logger } from './utils/logger';

/**
 * Интеграционные тесты для проверки работы с реальными блокчейн нодами
 * 
 * Этот скрипт тестирует:
 * - Подключение к реальным нодам всех поддерживаемых блокчейнов
 * - Генерацию адресов
 * - Получение балансов
 * - Валидацию адресов  
 * - Получение информации о блоках и транзакциях
 * - Мониторинг транзакций
 */

const logger = new Logger('IntegrationTest');

interface TestResults {
  [currency: string]: {
    connected: boolean;
    addressGeneration: boolean;
    balanceCheck: boolean;
    addressValidation: boolean;
    blockInfo: boolean;
    healthCheck: boolean;
    errors: string[];
  };
}

async function runIntegrationTests(): Promise<void> {
  logger.info('🚀 Запуск интеграционных тестов блокчейн интеграции...');
  
  const results: TestResults = {};
  const blockchainManager = new BlockchainManager({
    enableSecureGeneration: false // Используем legacy режим для тестов
  });

  try {
    // Инициализируем менеджер блокчейнов
    logger.info('📡 Инициализация блокчейн менеджера...');
    await blockchainManager.initialize();
    
    const supportedCurrencies = blockchainManager.getSupportedCurrencies();
    logger.info(`💰 Поддерживаемые валюты: ${supportedCurrencies.join(', ')}`);

    // Тестируем каждую валюту
    for (const currency of supportedCurrencies) {
      logger.info(`\n🔍 Тестирование ${currency}...`);
      results[currency] = await testCurrency(blockchainManager, currency);
    }

    // Тестируем мониторинг транзакций
    logger.info('\n📊 Тестирование мониторинга транзакций...');
    await testTransactionMonitoring(blockchainManager);

    // Выводим результаты
    printTestResults(results);

  } catch (error) {
    logger.error('❌ Критическая ошибка интеграционных тестов:', error as Error);
  } finally {
    await blockchainManager.shutdown();
  }
}

async function testCurrency(
  blockchainManager: BlockchainManager, 
  currency: string
): Promise<TestResults[string]> {
  const result: TestResults[string] = {
    connected: false,
    addressGeneration: false,
    balanceCheck: false,
    addressValidation: false,
    blockInfo: false,
    healthCheck: false,
    errors: []
  };

  // Тест 1: Проверка подключения
  try {
    const healthStatus = await blockchainManager.getClientHealth(currency);
    result.connected = healthStatus?.connected || false;
    result.healthCheck = true;
    logger.info(`✅ ${currency}: Проверка состояния пройдена`);
  } catch (error) {
    result.errors.push(`Health check: ${(error as Error).message}`);
    logger.error(`❌ ${currency}: Ошибка проверки состояния:`, error as Error);
  }

  // Тест 2: Генерация адреса
  let testAddress = '';
  try {
    const addressInfo = await blockchainManager.generateAddress(currency);
    testAddress = addressInfo.address;
    result.addressGeneration = true;
    logger.info(`✅ ${currency}: Адрес сгенерирован: ${testAddress.substring(0, 15)}...`);
  } catch (error) {
    result.errors.push(`Address generation: ${(error as Error).message}`);
    logger.error(`❌ ${currency}: Ошибка генерации адреса:`, error as Error);
  }

  // Тест 3: Валидация адреса
  if (testAddress) {
    try {
      const isValid = await blockchainManager.validateAddress(currency, testAddress);
      result.addressValidation = isValid;
      logger.info(`${isValid ? '✅' : '❌'} ${currency}: Валидация адреса: ${isValid}`);
    } catch (error) {
      result.errors.push(`Address validation: ${(error as Error).message}`);
      logger.error(`❌ ${currency}: Ошибка валидации адреса:`, error as Error);
    }
  }

  // Тест 4: Получение баланса
  if (testAddress) {
    try {
      const balance = await blockchainManager.getBalance(currency, testAddress);
      result.balanceCheck = true;
      logger.info(`✅ ${currency}: Баланс получен: ${balance}`);
    } catch (error) {
      result.errors.push(`Balance check: ${(error as Error).message}`);
      logger.error(`❌ ${currency}: Ошибка получения баланса:`, error as Error);
    }
  }

  // Тест 5: Получение информации о блоке
  try {
    const latestBlock = await blockchainManager.getLatestBlock(currency);
    result.blockInfo = !!latestBlock;
    
    let blockHeight = 'unknown';
    if (currency === 'BTC') {
      blockHeight = latestBlock.height?.toString() || 'unknown';
    } else if (currency === 'ETH') {
      blockHeight = latestBlock.number?.toString() || 'unknown';
    } else if (currency === 'SOL') {
      blockHeight = latestBlock.parentSlot?.toString() || 'unknown';
    } else if (currency === 'TRX') {
      blockHeight = latestBlock.block_header?.raw_data?.number?.toString() || 'unknown';
    }
    
    logger.info(`✅ ${currency}: Информация о блоке получена, высота: ${blockHeight}`);
  } catch (error) {
    result.errors.push(`Block info: ${(error as Error).message}`);
    logger.error(`❌ ${currency}: Ошибка получения информации о блоке:`, error as Error);
  }

  return result;
}

async function testTransactionMonitoring(blockchainManager: BlockchainManager): Promise<void> {
  try {
    // Создаем монитор транзакций с тестовой конфигурацией
    const monitor = new TransactionMonitor({
      pollInterval: 5000, // 5 секунд для быстрого тестирования
      maxRetries: 2,
      batchSize: 10,
      currencies: ['BTC', 'ETH', 'SOL', 'TRX']
    });

    // Запускаем мониторинг
    await monitor.start();
    logger.info('✅ Мониторинг транзакций запущен');

    // Добавляем тестовые адреса для мониторинга
    const testAddresses = {
      BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Genesis block address
      ETH: '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe', // Ethereum Foundation
      SOL: '11111111111111111111111111111111', // System program
      TRX: 'TLsV52sRDL79HXGGm9yzwKibbQWkQy6Pl' // Tron Foundation
    };

    for (const [currency, address] of Object.entries(testAddresses)) {
      try {
        monitor.addAdvancedAddressMonitoring(currency, address);
        logger.info(`✅ Добавлен адрес ${currency} для мониторинга: ${address.substring(0, 15)}...`);
      } catch (error) {
        logger.error(`❌ Ошибка добавления адреса ${currency} для мониторинга:`, error as Error);
      }
    }

    // Получаем статистику мониторинга
    const stats = monitor.getMonitoringStats();
    logger.info('📈 Статистика мониторинга:', stats);

    // Даем мониторингу поработать несколько секунд
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Получаем обновленную статистику
    const updatedStats = monitor.getMonitoringStats();
    logger.info('📈 Обновленная статистика мониторинга:', updatedStats);

    // Останавливаем мониторинг
    await monitor.stop();
    logger.info('✅ Мониторинг транзакций остановлен');

  } catch (error) {
    logger.error('❌ Ошибка тестирования мониторинга транзакций:', error as Error);
  }
}

function printTestResults(results: TestResults): void {
  logger.info('\n📋 РЕЗУЛЬТАТЫ ИНТЕГРАЦИОННЫХ ТЕСТОВ');
  logger.info('=' .repeat(50));

  let totalTests = 0;
  let passedTests = 0;
  
  for (const [currency, result] of Object.entries(results)) {
    logger.info(`\n💰 ${currency}:`);
    
    const tests = [
      { name: 'Подключение', passed: result.connected },
      { name: 'Генерация адреса', passed: result.addressGeneration },
      { name: 'Проверка баланса', passed: result.balanceCheck },
      { name: 'Валидация адреса', passed: result.addressValidation },
      { name: 'Информация о блоке', passed: result.blockInfo },
      { name: 'Health Check', passed: result.healthCheck }
    ];
    
    for (const test of tests) {
      totalTests++;
      if (test.passed) {
        passedTests++;
        logger.info(`  ✅ ${test.name}`);
      } else {
        logger.info(`  ❌ ${test.name}`);
      }
    }
    
    if (result.errors.length > 0) {
      logger.info(`  🐛 Ошибки:`);
      result.errors.forEach(error => {
        logger.info(`    - ${error}`);
      });
    }
  }

  logger.info('\n📊 ИТОГОВАЯ СТАТИСТИКА:');
  logger.info(`Всего тестов: ${totalTests}`);
  logger.info(`Пройдено: ${passedTests}`);
  logger.info(`Провалено: ${totalTests - passedTests}`);
  logger.info(`Успешность: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    logger.info('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
  } else {
    logger.info('⚠️  Некоторые тесты провалились. Проверьте конфигурацию нод.');
  }
}

// Запускаем тесты только если скрипт вызван напрямую
if (require.main === module) {
  runIntegrationTests().catch(error => {
    logger.error('💥 Критическая ошибка:', error);
    process.exit(1);
  });
}

export { runIntegrationTests };