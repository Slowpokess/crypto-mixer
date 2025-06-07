#!/usr/bin/env npx ts-node

/**
 * Демонстрация Enterprise Backup & Disaster Recovery System
 * 
 * Этот скрипт демонстрирует все возможности интегрированной системы backup:
 * - Создание и настройка системы
 * - Выполнение backup операций
 * - Мониторинг и алертинг
 * - Disaster recovery процедуры
 * - Web dashboard
 */

import { 
  createIntegratedBackupSystem, 
  DEFAULT_CONFIGS, 
  BackupUtils,
  BACKUP_CONSTANTS
} from '../utils/backup';
import { enhancedDbLogger } from '../utils/logger';

/**
 * Главная функция демонстрации
 */
async function demonstrateBackupSystem(): Promise<void> {
  console.log('🚀 Демонстрация Enterprise Backup & Disaster Recovery System\n');

  try {
    // ========== ЭТАП 1: СОЗДАНИЕ И НАСТРОЙКА СИСТЕМЫ ==========
    console.log('📋 Этап 1: Создание и настройка системы');
    
    // Генерация рекомендуемой конфигурации для development
    const config = BackupUtils.generateRecommendedConfig('development');
    
    // Валидация конфигурации
    const validation = BackupUtils.validateConfig(config);
    if (!validation.valid) {
      console.error('❌ Ошибки конфигурации:', validation.errors);
      return;
    }
    console.log('✅ Конфигурация валидна');

    // Создание интегрированной системы
    const backupSystem = createIntegratedBackupSystem(config);
    console.log('✅ Система backup создана');

    // Инициализация всех компонентов
    console.log('🔧 Инициализация компонентов...');
    await backupSystem.initialize();
    console.log('✅ Все компоненты инициализированы\n');

    // ========== ЭТАП 2: ПРОВЕРКА СТАТУСА СИСТЕМЫ ==========
    console.log('📊 Этап 2: Проверка статуса системы');
    
    const systemStatus = backupSystem.getSystemStatus();
    console.log('📈 Общий статус:', systemStatus.overall);
    console.log('🔧 Компоненты:', systemStatus.components);
    console.log('⏱️ Время работы:', BackupUtils.formatDuration(systemStatus.uptime));
    console.log('🚨 Ошибки:', systemStatus.errors.length);
    
    if (systemStatus.errors.length > 0) {
      console.log('❌ Найденные ошибки:');
      systemStatus.errors.forEach(error => console.log(`  - ${error}`));
    }
    console.log();

    // ========== ЭТАП 3: ДЕМОНСТРАЦИЯ BACKUP ОПЕРАЦИЙ ==========
    console.log('💾 Этап 3: Демонстрация backup операций');
    
    // Создание тестового backup
    console.log('📦 Создание полного backup...');
    const backupReport = await backupSystem.createBackup({ priority: 'high' });
    
    console.log('✅ Backup создан:', {
      id: backupReport.id,
      status: backupReport.status,
      duration: BackupUtils.formatDuration(backupReport.duration),
      size: BackupUtils.formatSize(backupReport.totalSize),
      compressionRatio: `${(backupReport.compressionRatio * 100).toFixed(1)}%`,
      components: backupReport.componentsSuccessful
    });
    console.log();

    // ========== ЭТАП 4: МОНИТОРИНГ И МЕТРИКИ ==========
    console.log('📊 Этап 4: Мониторинг и метрики');
    
    // Получение dashboard данных
    const monitoring = (backupSystem as any).monitoring;
    if (monitoring) {
      const dashboardData = monitoring.getDashboardData();
      
      console.log('📊 Текущие метрики:');
      console.log(`  • Общий статус: ${dashboardData.status}`);
      console.log(`  • Всего backup: ${dashboardData.summary.totalBackups}`);
      console.log(`  • Успешность: ${dashboardData.summary.successRate.toFixed(1)}%`);
      console.log(`  • Использование диска: ${dashboardData.summary.diskUsagePercent.toFixed(1)}%`);
      console.log(`  • Активные алерты: ${dashboardData.summary.activeAlerts}`);
      console.log(`  • Последний backup: ${dashboardData.summary.lastBackupTime.toLocaleString()}`);
    }
    console.log();

    // ========== ЭТАП 5: ТЕСТИРОВАНИЕ АЛЕРТОВ ==========
    console.log('🚨 Этап 5: Тестирование системы алертов');
    
    if (monitoring) {
      // Создание тестового алерта
      const alertId = await monitoring.createAlert({
        severity: 'warning',
        category: 'backup',
        title: 'Тестовый алерт демонстрации',
        description: 'Это тестовый алерт для демонстрации работы системы уведомлений',
        source: 'backup_demo',
        tags: ['demo', 'test'],
        metadata: {
          component: 'demo_system',
          threshold: 100,
          currentValue: 150
        }
      });
      
      console.log('✅ Тестовый алерт создан:', alertId);
      
      // Подтверждение алерта
      await new Promise(resolve => setTimeout(resolve, 1000));
      const acknowledged = await monitoring.acknowledgeAlert(alertId, 'demo_user');
      console.log('✅ Алерт подтвержден:', acknowledged);
      
      // Разрешение алерта
      await new Promise(resolve => setTimeout(resolve, 1000));
      const resolved = await monitoring.resolveAlert(alertId, 'demo_user');
      console.log('✅ Алерт разрешен:', resolved);
    }
    console.log();

    // ========== ЭТАП 6: DISASTER RECOVERY ==========
    console.log('🔄 Этап 6: Тестирование Disaster Recovery');
    
    // Получение доступных планов восстановления
    const drManager = (backupSystem as any).drManager;
    if (drManager) {
      const drStatus = drManager.getSystemStatus();
      console.log('🏥 Статус Disaster Recovery:');
      console.log(`  • Мониторинг: ${drStatus.isMonitoring ? 'активен' : 'неактивен'}`);
      console.log(`  • Активные восстановления: ${drStatus.activeRecoveries.length}`);
      console.log(`  • Последние катастрофы: ${drStatus.recentDisasters.length}`);
      
      // Выполнение dry-run восстановления
      console.log('🧪 Выполнение тестового восстановления (dry-run)...');
      try {
        const recoveryExecution = await backupSystem.performRecovery(
          'application_crash_recovery', 
          { dryRun: true }
        );
        
        console.log('✅ Тестовое восстановление выполнено:', {
          id: recoveryExecution.id,
          status: recoveryExecution.status,
          duration: BackupUtils.formatDuration(recoveryExecution.totalDuration || 0),
          completedSteps: recoveryExecution.completedSteps.length,
          errors: recoveryExecution.errors.length
        });
      } catch (error) {
        console.log('⚠️ Ошибка тестового восстановления:', error);
      }
    }
    console.log();

    // ========== ЭТАП 7: WEB DASHBOARD ==========
    console.log('🖥️ Этап 7: Web Dashboard');
    
    const dashboard = (backupSystem as any).dashboard;
    if (dashboard) {
      const dashboardStatus = dashboard.getStatus();
      if (dashboardStatus.isRunning) {
        console.log('✅ Dashboard запущен и доступен по адресу:', dashboardStatus.url);
        console.log('📊 Доступные API endpoints:');
        console.log('  • GET /api/dashboard - Данные dashboard');
        console.log('  • GET /api/backups - Список backup');
        console.log('  • GET /api/alerts - Список алертов');
        console.log('  • GET /api/status - Статус системы');
        console.log('  • GET /api/metrics - Метрики производительности');
        console.log('  • POST /api/backup/start - Запуск backup');
        console.log('  • POST /api/recovery/manual - Мануальное восстановление');
      } else {
        console.log('❌ Dashboard не запущен');
      }
    }
    console.log();

    // ========== ЭТАП 8: ДЕМОНСТРАЦИЯ УТИЛИТ ==========
    console.log('🛠️ Этап 8: Полезные утилиты');
    
    console.log('📏 Форматирование размеров:');
    console.log(`  • 1024 bytes = ${BackupUtils.formatSize(1024)}`);
    console.log(`  • 1048576 bytes = ${BackupUtils.formatSize(1048576)}`);
    console.log(`  • 1073741824 bytes = ${BackupUtils.formatSize(1073741824)}`);
    
    console.log('⏱️ Форматирование времени:');
    console.log(`  • 30 секунд = ${BackupUtils.formatDuration(30)}`);
    console.log(`  • 3600 секунд = ${BackupUtils.formatDuration(3600)}`);
    console.log(`  • 86400 секунд = ${BackupUtils.formatDuration(86400)}`);
    
    console.log('📅 Следующий backup:');
    const nextBackup = BackupUtils.getNextBackupTime('0 2 * * *');
    console.log(`  • Запланирован на: ${nextBackup.toLocaleString()}`);
    
    console.log('🏷️ Доступные константы:');
    console.log(`  • Типы backup: ${Object.values(BACKUP_CONSTANTS.BACKUP_TYPES).join(', ')}`);
    console.log(`  • Статусы: ${Object.values(BACKUP_CONSTANTS.BACKUP_STATUSES).join(', ')}`);
    console.log(`  • Приоритеты: ${Object.values(BACKUP_CONSTANTS.COMPONENT_PRIORITIES).join(', ')}`);
    console.log();

    // ========== ЭТАП 9: ФИНАЛЬНАЯ СТАТИСТИКА ==========
    console.log('📈 Этап 9: Финальная статистика');
    
    const finalStatus = backupSystem.getSystemStatus();
    console.log('🎯 Итоговые результаты демонстрации:');
    console.log(`  • Общий статус системы: ${finalStatus.overall}`);
    console.log(`  • Время работы: ${BackupUtils.formatDuration(finalStatus.uptime)}`);
    console.log(`  • Активные компоненты: ${Object.values(finalStatus.components).filter(s => s === 'running').length}/4`);
    console.log(`  • Обнаружено ошибок: ${finalStatus.errors.length}`);
    
    if (monitoring) {
      const finalDashboard = monitoring.getDashboardData();
      console.log(`  • Выполнено backup: ${finalDashboard.summary.totalBackups}`);
      console.log(`  • Успешность: ${finalDashboard.summary.successRate.toFixed(1)}%`);
      console.log(`  • Активные алерты: ${finalDashboard.summary.activeAlerts}`);
    }
    console.log();

    // ========== ОЖИДАНИЕ И ОСТАНОВКА ==========
    console.log('⏳ Система будет работать 30 секунд для демонстрации...');
    console.log('💡 За это время вы можете открыть dashboard в браузере');
    
    if (dashboard?.getStatus().isRunning) {
      console.log(`🌐 Dashboard: ${dashboard.getStatus().url}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('🛑 Остановка системы...');
    await backupSystem.stop();
    console.log('✅ Система остановлена');

  } catch (error) {
    console.error('❌ Ошибка в демонстрации:', error);
    process.exit(1);
  }
}

/**
 * Демонстрация различных конфигураций
 */
async function demonstrateConfigurations(): Promise<void> {
  console.log('\n🔧 Демонстрация различных конфигураций:\n');

  // Development конфигурация
  console.log('👨‍💻 Development конфигурация:');
  const devConfig = DEFAULT_CONFIGS.DEVELOPMENT;
  console.log(`  • Backup каждые: ${devConfig.backup.schedule.incremental}`);
  console.log(`  • Сжатие: ${devConfig.backup.compression.enabled ? 'включено' : 'отключено'}`);
  console.log(`  • Шифрование: ${devConfig.backup.encryption.enabled ? 'включено' : 'отключено'}`);
  console.log(`  • Auto-recovery: ${devConfig.disasterRecovery.autoRecovery.enabled ? 'включено' : 'отключено'}`);
  console.log(`  • Dashboard: ${devConfig.dashboard.enabled ? 'включен' : 'отключен'}`);

  // Production конфигурация
  console.log('\n🏭 Production конфигурация:');
  const prodConfig = DEFAULT_CONFIGS.PRODUCTION;
  console.log(`  • Backup каждые: ${prodConfig.backup.schedule.incremental}`);
  console.log(`  • Сжатие: ${prodConfig.backup.compression.enabled ? 'включено' : 'отключено'} (уровень ${prodConfig.backup.compression.level})`);
  console.log(`  • Шифрование: ${prodConfig.backup.encryption.enabled ? 'включено' : 'отключено'} (${prodConfig.backup.encryption.algorithm})`);
  console.log(`  • Auto-recovery: ${prodConfig.disasterRecovery.autoRecovery.enabled ? 'включено' : 'отключено'}`);
  console.log(`  • Retention: ${prodConfig.backup.storage.local.retention.daily}д/${prodConfig.backup.storage.local.retention.weekly}н/${prodConfig.backup.storage.local.retention.monthly}м`);

  // Testing конфигурация
  console.log('\n🧪 Testing конфигурация:');
  const testConfig = DEFAULT_CONFIGS.TESTING;
  console.log(`  • Backup: ${testConfig.backup.enabled ? 'включен' : 'отключен'} (но не по расписанию)`);
  console.log(`  • Мониторинг: ${testConfig.monitoring.enabled ? 'включен' : 'отключен'}`);
  console.log(`  • Auto-start: ${testConfig.integration.autoStart ? 'включен' : 'отключен'}`);
  console.log(`  • Retention: минимальный (${testConfig.backup.storage.local.retention.daily} день)`);
}

/**
 * Демонстрация best practices
 */
function demonstrateBestPractices(): void {
  console.log('\n📚 Best Practices для Enterprise Backup System:\n');

  console.log('🔒 Безопасность:');
  console.log('  • Всегда включайте шифрование в production');
  console.log('  • Используйте сильные ключи шифрования (256-bit)');
  console.log('  • Регулярно ротируйте ключи шифрования');
  console.log('  • Храните backup в изолированном окружении');
  console.log('  • Ограничивайте доступ к backup только необходимым пользователям');

  console.log('\n📊 Мониторинг:');
  console.log('  • Настройте алерты на критические события');
  console.log('  • Регулярно проверяйте целостность backup');
  console.log('  • Мониторьте место на диске');
  console.log('  • Отслеживайте производительность backup операций');
  console.log('  • Используйте dashboard для визуального контроля');

  console.log('\n🔄 Disaster Recovery:');
  console.log('  • Регулярно тестируйте процедуры восстановления');
  console.log('  • Документируйте все recovery планы');
  console.log('  • Автоматизируйте критические recovery процедуры');
  console.log('  • Настройте escalation для критических алертов');
  console.log('  • Поддерживайте актуальные контакты для экстренных ситуаций');

  console.log('\n⚡ Производительность:');
  console.log('  • Оптимизируйте расписание backup для минимизации нагрузки');
  console.log('  • Используйте инкрементальные backup между полными');
  console.log('  • Настройте подходящий уровень сжатия');
  console.log('  • Распределяйте backup операции по времени');
  console.log('  • Мониторьте использование ресурсов во время backup');

  console.log('\n📋 Операционные процедуры:');
  console.log('  • Задокументируйте все процедуры');
  console.log('  • Обучите команду работе с системой');
  console.log('  • Проводите регулярные drill упражнения');
  console.log('  • Ведите log всех операций');
  console.log('  • Регулярно обновляйте конфигурацию');
}

// Главная точка входа
async function main(): Promise<void> {
  try {
    // Инициализация логирования
    const { initializeLoggingSystems } = await import('../utils/logger');
    initializeLoggingSystems();

    console.log('🔐 Enterprise Backup & Disaster Recovery System');
    console.log('===============================================\n');

    // Демонстрация конфигураций
    await demonstrateConfigurations();

    // Best practices
    demonstrateBestPractices();

    // Основная демонстрация
    await demonstrateBackupSystem();

    console.log('\n🎉 Демонстрация завершена успешно!');
    console.log('\n📖 Дополнительная информация:');
    console.log('  • Документация: ./utils/backup/README.md');
    console.log('  • Конфигурация: ./utils/backup/config/');
    console.log('  • Логи: ./logs/backup/');
    console.log('  • Dashboard: http://localhost:3030');

  } catch (error) {
    console.error('\n❌ Ошибка в демонстрации:', error);
    process.exit(1);
  }
}

// Запуск демонстрации
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { demonstrateBackupSystem, demonstrateConfigurations, demonstrateBestPractices };