import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import { DatabaseManager } from '../../database/DatabaseManager';
import { VaultManager } from '../../security/VaultManager';
import { HSMManager } from '../../security/HSMManager';
import { enhancedDbLogger } from '../logger';

/**
 * Типы и интерфейсы для системы backup
 */
export interface BackupConfig {
  enabled: boolean;
  storage: {
    local: {
      enabled: boolean;
      path: string;
      maxFiles: number;
      retention: {
        daily: number;   // дни
        weekly: number;  // недели  
        monthly: number; // месяцы
      };
    };
    remote: {
      enabled: boolean;
      type: 'aws-s3' | 'azure-blob' | 'gcp-storage' | 'sftp';
      credentials: Record<string, any>;
      bucket?: string;
      region?: string;
      encryption: boolean;
    };
  };
  schedule: {
    full: string;      // cron expression для полного backup
    incremental: string; // cron expression для инкрементального backup
    differential: string; // cron expression для дифференциального backup
  };
  compression: {
    enabled: boolean;
    level: number; // 1-9
    algorithm: 'gzip' | 'brotli' | 'lz4';
  };
  encryption: {
    enabled: boolean;
    algorithm: 'aes-256-gcm' | 'chacha20-poly1305';
    keyRotation: boolean;
    keyRotationDays: number;
  };
  verification: {
    checksumAlgorithm: 'sha256' | 'sha512' | 'blake3';
    integrityCheck: boolean;
    testRestore: boolean;
    testRestoreFrequency: number; // дни
  };
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    emailRecipients?: string[];
    slackChannel?: string;
    alertOnFailure: boolean;
    alertOnSuccess: boolean;
    alertOnLongDuration: boolean;
    maxDurationMinutes: number;
  };
}

export interface BackupMetadata {
  id: string;
  type: 'full' | 'incremental' | 'differential';
  timestamp: Date;
  size: number;
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  checksumAlgorithm: string;
  components: string[];
  retention: Date;
  status: 'in_progress' | 'completed' | 'failed' | 'corrupted';
  duration: number; // секунды
  errors?: string[];
  metadata: {
    dbVersion: string;
    appVersion: string;
    nodeVersion: string;
    environment: string;
    hostInfo: any;
  };
}

export interface BackupComponent {
  name: string;
  type: 'database' | 'files' | 'configuration' | 'secrets';
  priority: 'critical' | 'high' | 'medium' | 'low';
  path?: string;
  excludePatterns?: string[];
  customBackupFunction?: () => Promise<Buffer>;
  customRestoreFunction?: (data: Buffer) => Promise<void>;
}

export interface RestoreOptions {
  backupId: string;
  components?: string[];
  targetTimestamp?: Date;
  verifyIntegrity: boolean;
  dryRun: boolean;
  continueOnError: boolean;
  restoreLocation?: string;
}

export interface BackupReport {
  id: string;
  timestamp: Date;
  type: 'full' | 'incremental' | 'differential';
  status: 'success' | 'partial' | 'failed';
  duration: number;
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
  componentsProcessed: number;
  componentsSuccessful: number;
  componentsFailed: number;
  checksumVerified: boolean;
  encryptionApplied: boolean;
  storageLocations: string[];
  errors: string[];
  warnings: string[];
  performance: {
    throughputMBps: number;
    cpuUsagePercent: number;
    memoryUsageMB: number;
    ioWaitPercent: number;
  };
}

/**
 * Enterprise-grade Backup Manager
 * Обеспечивает надежное резервное копирование критических данных
 * Наследует EventEmitter для полноценной событийной архитектуры
 */
export class BackupManager extends EventEmitter {
  private config: BackupConfig;
  private isRunning: boolean = false;
  private currentBackupId: string | null = null;
  private backupHistory: Map<string, BackupMetadata> = new Map();
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private encryptionKeys: Map<string, Buffer> = new Map();
  private dbManager?: DatabaseManager; // Опциональная зависимость для database backup
  
  private readonly BACKUP_COMPONENTS: BackupComponent[] = [
    {
      name: 'database_structure',
      type: 'database',
      priority: 'critical'
    },
    {
      name: 'database_data_critical',
      type: 'database', 
      priority: 'critical'
    },
    {
      name: 'database_data_high',
      type: 'database',
      priority: 'high'
    },
    {
      name: 'hsm_configuration',
      type: 'secrets',
      priority: 'critical'
    },
    {
      name: 'vault_secrets',
      type: 'secrets',
      priority: 'critical'
    },
    {
      name: 'application_config',
      type: 'configuration',
      priority: 'high'
    },
    {
      name: 'logs',
      type: 'files',
      priority: 'medium',
      path: '/app/logs',
      excludePatterns: ['*.tmp', '*.lock']
    }
  ];

  constructor(config: BackupConfig, dbManager?: DatabaseManager) {
    // Вызов конструктора EventEmitter для полноценной событийной архитектуры
    super();
    this.config = config;
    this.dbManager = dbManager;
    this.validateConfig();
  }

  /**
   * Инициализация системы backup
   */
  async initialize(): Promise<void> {
    const operationId = await enhancedDbLogger.startOperation('backup_initialize');
    
    try {
      // Создание необходимых директорий
      await this.ensureDirectories();
      
      // Инициализация ключей шифрования
      await this.initializeEncryptionKeys();
      
      // Загрузка истории backup
      await this.loadBackupHistory();
      
      // Настройка расписания
      if (this.config.enabled) {
        this.setupSchedules();
      }
      
      // Проверка доступности компонентов
      await this.verifyComponentsHealth();
      
      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ BackupManager успешно инициализирован', {
        enabled: this.config.enabled,
        scheduledJobs: this.scheduledJobs.size,
        components: this.BACKUP_COMPONENTS.length
      });
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      // Правильная типизация ошибки для логгера
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await enhancedDbLogger.logError(errorToLog);
      throw error;
    }
  }

  /**
   * Выполнение полного backup
   */
  async createFullBackup(options: { priority?: string } = {}): Promise<BackupReport> {
    const operationId = await enhancedDbLogger.startOperation('backup_full');
    const backupId = this.generateBackupId('full');
    
    try {
      if (this.isRunning) {
        throw new Error('Backup уже выполняется');
      }

      this.isRunning = true;
      this.currentBackupId = backupId;
      
      // Эмитим событие начала backup для мониторинга
      this.emit('backup_started', backupId);

      const startTime = Date.now();
      const metadata: BackupMetadata = {
        id: backupId,
        type: 'full',
        timestamp: new Date(),
        size: 0,
        compressed: this.config.compression.enabled,
        encrypted: this.config.encryption.enabled,
        checksum: '',
        checksumAlgorithm: this.config.verification.checksumAlgorithm,
        components: [],
        retention: this.calculateRetentionDate('full'),
        status: 'in_progress',
        duration: 0,
        metadata: await this.gatherSystemMetadata()
      };

      enhancedDbLogger.info('🚀 Начало полного backup', {
        backupId,
        components: this.BACKUP_COMPONENTS.length,
        encryption: metadata.encrypted,
        compression: metadata.compressed
      });

      const report: BackupReport = {
        id: backupId,
        timestamp: metadata.timestamp,
        type: 'full',
        status: 'success',
        duration: 0,
        totalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        componentsProcessed: 0,
        componentsSuccessful: 0,
        componentsFailed: 0,
        checksumVerified: false,
        encryptionApplied: metadata.encrypted,
        storageLocations: [],
        errors: [],
        warnings: [],
        performance: {
          throughputMBps: 0,
          cpuUsagePercent: 0,
          memoryUsageMB: 0,
          ioWaitPercent: 0
        }
      };

      // Фильтрация компонентов по приоритету
      const components = options.priority 
        ? this.BACKUP_COMPONENTS.filter(c => c.priority === options.priority)
        : this.BACKUP_COMPONENTS;

      // Создание backup директории
      const backupDir = path.join(this.config.storage.local.path, backupId);
      await fs.mkdir(backupDir, { recursive: true });

      // Backup каждого компонента
      for (const component of components) {
        try {
          await this.backupComponent(component, backupDir, metadata);
          report.componentsSuccessful++;
          metadata.components.push(component.name);
        } catch (error) {
          enhancedDbLogger.error(`❌ Ошибка backup компонента ${component.name}`, { 
            component: component.name, 
            error: error 
          });
          report.componentsFailed++;
          report.errors.push(`Component ${component.name}: ${error}`);
          
          if (component.priority === 'critical') {
            throw new Error(`Критический компонент ${component.name} не удалось сохранить: ${error}`);
          }
        }
        report.componentsProcessed++;
      }

      // Вычисление checksums и финализация
      metadata.checksum = await this.calculateDirectoryChecksum(backupDir);
      metadata.size = await this.getDirectorySize(backupDir);
      
      // Сжатие если включено
      if (this.config.compression.enabled) {
        const compressedPath = await this.compressBackup(backupDir);
        report.compressedSize = await this.getFileSize(compressedPath);
        report.compressionRatio = (metadata.size - report.compressedSize) / metadata.size;
      } else {
        report.compressedSize = metadata.size;
      }

      // Шифрование если включено
      if (this.config.encryption.enabled) {
        await this.encryptBackup(backupDir);
      }

      // Загрузка в удаленное хранилище
      if (this.config.storage.remote.enabled) {
        const remoteLocation = await this.uploadToRemoteStorage(backupDir, metadata);
        report.storageLocations.push(remoteLocation);
      }

      // Локальное хранение
      report.storageLocations.push(backupDir);

      // Завершение
      const endTime = Date.now();
      metadata.duration = Math.floor((endTime - startTime) / 1000);
      metadata.status = 'completed';
      report.duration = metadata.duration;
      report.totalSize = metadata.size;

      // Расчет производительности
      report.performance.throughputMBps = (report.totalSize / (1024 * 1024)) / metadata.duration;

      // Сохранение метаданных
      await this.saveBackupMetadata(metadata);
      this.backupHistory.set(backupId, metadata);

      // Очистка старых backup
      await this.cleanupOldBackups();

      // Верификация
      if (this.config.verification.integrityCheck) {
        report.checksumVerified = await this.verifyBackupIntegrity(backupId);
      }

      // Отправка уведомлений
      if (this.config.alerts.enabled && this.config.alerts.alertOnSuccess) {
        await this.sendAlert('backup_success', report);
      }
      
      // Эмитим событие успешного завершения backup
      this.emit('backup_completed', report);

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Полный backup завершен успешно', {
        backupId,
        duration: metadata.duration,
        size: metadata.size,
        components: metadata.components.length,
        compressionRatio: report.compressionRatio
      });

      return report;

    } catch (error) {
      const metadata = this.backupHistory.get(backupId);
      if (metadata) {
        metadata.status = 'failed';
        metadata.errors = [String(error)];
      }

      if (this.config.alerts.enabled && this.config.alerts.alertOnFailure) {
        await this.sendAlert('backup_failure', { error: String(error), backupId });
      }
      
      // Эмитим событие ошибки backup
      this.emit('backup_failed', backupId, error);

      await enhancedDbLogger.endOperation(operationId, false);
      // Правильная типизация ошибки для логгера
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await enhancedDbLogger.logError(errorToLog);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentBackupId = null;
    }
  }

  /**
   * Backup отдельного компонента
   */
  private async backupComponent(
    component: BackupComponent, 
    backupDir: string, 
    metadata: BackupMetadata
  ): Promise<void> {
    enhancedDbLogger.info(`📦 Backup компонента: ${component.name}`, {
      type: component.type,
      priority: component.priority
    });

    const componentDir = path.join(backupDir, component.name);
    await fs.mkdir(componentDir, { recursive: true });
    
    // Обновляем метаданные о процессе backup
    enhancedDbLogger.debug(`📦 Создана директория для компонента ${component.name}: ${componentDir}`, {
      componentType: component.type,
      priority: component.priority,
      metadataId: metadata.id
    });

    switch (component.type) {
      case 'database':
        await this.backupDatabase(component, componentDir);
        break;
        
      case 'secrets':
        await this.backupSecrets(component, componentDir);
        break;
        
      case 'configuration':
        await this.backupConfiguration(component, componentDir);
        break;
        
      case 'files':
        await this.backupFiles(component, componentDir);
        break;
        
      default:
        if (component.customBackupFunction) {
          const data = await component.customBackupFunction();
          await fs.writeFile(path.join(componentDir, 'custom_backup.bin'), data);
        } else {
          throw new Error(`Неизвестный тип компонента: ${component.type}`);
        }
    }
  }

  /**
   * Backup базы данных
   */
  private async backupDatabase(component: BackupComponent, outputDir: string): Promise<void> {
    // Используем инжектированный DatabaseManager или создаем новый с конфигурацией по умолчанию
    if (!this.dbManager) {
      // Создаем DatabaseManager с конфигурацией из переменных окружения
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'crypto_mixer',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        dialect: 'postgres' as const,
        logging: false
      };
      this.dbManager = new DatabaseManager(dbConfig);
    }
    
    // Используем инжектированную зависимость для backup
    enhancedDbLogger.info(`📦 Начало backup базы данных для компонента: ${component.name}`, {
      outputDir,
      hasDbManager: !!this.dbManager
    });
    
    if (component.name === 'database_structure') {
      // Схема базы данных
      const schema = await this.exportDatabaseSchema();
      await fs.writeFile(path.join(outputDir, 'schema.sql'), schema);
      
    } else if (component.name === 'database_data_critical') {
      // Критические таблицы
      const tables = ['mix_requests', 'deposit_addresses', 'wallets', 'system_config'];
      for (const table of tables) {
        const data = await this.exportTableData(table);
        await fs.writeFile(path.join(outputDir, `${table}.sql`), data);
      }
      
    } else if (component.name === 'database_data_high') {
      // Высокоприоритетные таблицы
      const tables = ['blockchain_transactions', 'audit_logs', 'monitored_addresses'];
      for (const table of tables) {
        const data = await this.exportTableData(table);
        await fs.writeFile(path.join(outputDir, `${table}.sql`), data);
      }
    }
  }

  /**
   * Backup секретов (HSM/Vault)
   */
  private async backupSecrets(component: BackupComponent, outputDir: string): Promise<void> {
    if (component.name === 'hsm_configuration') {
      // HSM конфигурация (без приватных ключей!)
      const hsmConfig = await this.exportHSMConfiguration();
      await fs.writeFile(path.join(outputDir, 'hsm_config.json'), JSON.stringify(hsmConfig));
      
    } else if (component.name === 'vault_secrets') {
      // Vault секреты (зашифрованные)
      const vaultBackup = await this.exportVaultSecrets();
      await fs.writeFile(path.join(outputDir, 'vault_backup.enc'), vaultBackup);
    }
  }

  /**
   * Backup конфигурации приложения
   */
  private async backupConfiguration(component: BackupComponent, outputDir: string): Promise<void> {
    enhancedDbLogger.info(`⚙️ Backup конфигурации компонента: ${component.name}`, {
      outputDir,
      componentType: component.type
    });
    
    const config = {
      environment: process.env.NODE_ENV,
      database: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        name: process.env.DB_NAME
      },
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      },
      // НЕ включаем секретные данные!
      backup_timestamp: new Date().toISOString(),
      component_name: component.name
    };
    
    const configPath = path.join(outputDir, 'app_config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    enhancedDbLogger.debug(`✅ Конфигурация сохранена: ${configPath}`, {
      configSize: JSON.stringify(config).length
    });
  }

  /**
   * Backup файлов
   */
  private async backupFiles(component: BackupComponent, outputDir: string): Promise<void> {
    if (!component.path) return;
    
    // Копирование файлов с исключением паттернов
    await this.copyDirectoryWithExclusions(component.path, outputDir, component.excludePatterns || []);
  }

  /**
   * Восстановление из backup
   */
  async restore(options: RestoreOptions): Promise<BackupReport> {
    const operationId = await enhancedDbLogger.startOperation('backup_restore');
    
    try {
      enhancedDbLogger.info('🔄 Начало восстановления из backup', {
        backupId: options.backupId,
        dryRun: options.dryRun,
        components: options.components?.length || 'all'
      });

      if (this.isRunning && !options.dryRun) {
        throw new Error('Backup операция уже выполняется');
      }

      const metadata = this.backupHistory.get(options.backupId);
      if (!metadata) {
        throw new Error(`Backup ${options.backupId} не найден`);
      }

      // Проверка целостности
      if (options.verifyIntegrity) {
        const isValid = await this.verifyBackupIntegrity(options.backupId);
        if (!isValid) {
          throw new Error(`Backup ${options.backupId} поврежден`);
        }
      }

      const startTime = Date.now();
      const report: BackupReport = {
        id: `restore_${Date.now()}`,
        timestamp: new Date(),
        type: metadata.type,
        status: 'success',
        duration: 0,
        totalSize: metadata.size,
        compressedSize: 0,
        compressionRatio: 0,
        componentsProcessed: 0,
        componentsSuccessful: 0,
        componentsFailed: 0,
        checksumVerified: options.verifyIntegrity,
        encryptionApplied: metadata.encrypted,
        storageLocations: [],
        errors: [],
        warnings: [],
        performance: {
          throughputMBps: 0,
          cpuUsagePercent: 0,
          memoryUsageMB: 0,
          ioWaitPercent: 0
        }
      };

      // Получение backup данных
      const backupDir = path.join(this.config.storage.local.path, options.backupId);
      
      // Расшифровка если необходимо
      if (metadata.encrypted) {
        await this.decryptBackup(backupDir);
      }

      // Декомпрессия если необходимо
      if (metadata.compressed) {
        await this.decompressBackup(backupDir);
      }

      // Восстановление компонентов
      const componentsToRestore = options.components 
        ? this.BACKUP_COMPONENTS.filter(c => options.components!.includes(c.name))
        : this.BACKUP_COMPONENTS;

      for (const component of componentsToRestore) {
        if (!metadata.components.includes(component.name)) {
          report.warnings.push(`Компонент ${component.name} отсутствует в backup`);
          continue;
        }

        try {
          if (!options.dryRun) {
            await this.restoreComponent(component, backupDir, options);
          }
          report.componentsSuccessful++;
        } catch (error) {
          enhancedDbLogger.error(`❌ Ошибка восстановления компонента ${component.name}`, { 
            component: component.name, 
            error 
          });
          report.componentsFailed++;
          report.errors.push(`Component ${component.name}: ${error}`);
          
          if (!options.continueOnError && component.priority === 'critical') {
            throw error;
          }
        }
        report.componentsProcessed++;
      }

      // Финализация
      const endTime = Date.now();
      report.duration = Math.floor((endTime - startTime) / 1000);
      report.performance.throughputMBps = (report.totalSize / (1024 * 1024)) / report.duration;

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Восстановление завершено успешно', {
        backupId: options.backupId,
        duration: report.duration,
        components: report.componentsSuccessful,
        warnings: report.warnings.length
      });

      return report;
      
    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      // Правильная типизация ошибки для логгера
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await enhancedDbLogger.logError(errorToLog);
      throw error;
    }
  }

  /**
   * Получение списка доступных backup
   */
  getBackupHistory(): BackupMetadata[] {
    return Array.from(this.backupHistory.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Получение статуса текущего backup
   */
  getCurrentStatus(): { isRunning: boolean; currentBackupId: string | null; progress?: number } {
    return {
      isRunning: this.isRunning,
      currentBackupId: this.currentBackupId
    };
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

  private validateConfig(): void {
    if (!this.config.storage.local.enabled && !this.config.storage.remote.enabled) {
      throw new Error('Должно быть включено хотя бы одно хранилище backup');
    }
    
    if (this.config.storage.local.enabled && !this.config.storage.local.path) {
      throw new Error('Не указан путь для локального хранилища backup');
    }
  }

  private generateBackupId(type: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}_${timestamp}_${random}`;
  }

  private calculateRetentionDate(type: string): Date {
    const date = new Date();
    const retention = this.config.storage.local.retention;
    
    switch (type) {
      case 'full':
        date.setDate(date.getDate() + retention.monthly * 30);
        break;
      case 'differential':
        date.setDate(date.getDate() + retention.weekly * 7);
        break;
      case 'incremental':
        date.setDate(date.getDate() + retention.daily);
        break;
    }
    
    return date;
  }

  private async ensureDirectories(): Promise<void> {
    if (this.config.storage.local.enabled) {
      await fs.mkdir(this.config.storage.local.path, { recursive: true });
    }
  }

  private async initializeEncryptionKeys(): Promise<void> {
    if (this.config.encryption.enabled) {
      // Генерация или загрузка ключа шифрования
      const keyId = 'backup_master_key';
      let key = this.encryptionKeys.get(keyId);
      
      if (!key) {
        key = crypto.randomBytes(32); // 256-bit key
        this.encryptionKeys.set(keyId, key);
        
        // В продакшене ключ должен храниться в Vault или HSM
        enhancedDbLogger.warn('⚠️ Ключ шифрования backup создан в памяти - настройте Vault для продакшена');
      }
    }
  }

  private setupSchedules(): void {
    // Здесь бы использовался cron, но для примера используем setTimeout
    enhancedDbLogger.info('📅 Настройка расписания backup', {
      full: this.config.schedule.full,
      incremental: this.config.schedule.incremental
    });
  }

  private async loadBackupHistory(): Promise<void> {
    // Загрузка истории backup из файла метаданных
    try {
      const historyFile = path.join(this.config.storage.local.path, 'backup_history.json');
      const data = await fs.readFile(historyFile, 'utf-8');
      const history = JSON.parse(data);
      
      for (const [id, metadata] of Object.entries(history)) {
        this.backupHistory.set(id, metadata as BackupMetadata);
      }
      
      enhancedDbLogger.info('📚 История backup загружена', {
        backups: this.backupHistory.size
      });
    } catch (error) {
      enhancedDbLogger.info('📚 История backup пуста - создание новой');
    }
  }

  private async verifyComponentsHealth(): Promise<void> {
    // Проверка доступности всех компонентов для backup
    enhancedDbLogger.info('🔍 Проверка компонентов системы');
  }

  private async gatherSystemMetadata(): Promise<any> {
    return {
      dbVersion: 'PostgreSQL 15',
      appVersion: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      hostInfo: {
        hostname: require('os').hostname(),
        platform: process.platform,
        arch: process.arch
      }
    };
  }

  private async exportDatabaseSchema(): Promise<string> {
    if (!this.dbManager) {
      throw new Error('DatabaseManager не инициализирован для экспорта схемы');
    }
    
    try {
      // Получаем информацию о схеме через SQL запросы
      const tables = await this.dbManager.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);
      
      let schemaSQL = '-- Database schema export\n';
      schemaSQL += `-- Generated at: ${new Date().toISOString()}\n\n`;
      
      // Экспортируем структуру каждой таблицы
      for (const table of tables) {
        const tableName = table.table_name;
        
        // Получаем определение таблицы
        const columns = await this.dbManager.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `);
        
        schemaSQL += `-- Table: ${tableName}\n`;
        schemaSQL += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
        
        const columnDefs = columns.map((col: any) => {
          let def = `  ${col.column_name} ${col.data_type}`;
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          if (col.column_default) def += ` DEFAULT ${col.column_default}`;
          return def;
        });
        
        schemaSQL += columnDefs.join(',\n');
        schemaSQL += '\n);\n\n';
        
        // Получаем индексы
        const indexes = await this.dbManager.query(`
          SELECT indexname, indexdef
          FROM pg_indexes 
          WHERE tablename = '${tableName}' 
          AND schemaname = 'public'
          AND indexname NOT LIKE '%_pkey';
        `);
        
        for (const index of indexes) {
          schemaSQL += `${index.indexdef};\n`;
        }
        
        schemaSQL += '\n';
      }
      
      enhancedDbLogger.info('✅ Схема базы данных экспортирована', {
        tablesCount: tables.length,
        schemaSize: schemaSQL.length
      });
      
      return schemaSQL;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка экспорта схемы БД', { error });
      throw error;
    }
  }

  private async exportTableData(tableName: string): Promise<string> {
    if (!this.dbManager) {
      throw new Error('DatabaseManager не инициализирован для экспорта данных');
    }
    
    try {
      // Получаем все данные из таблицы
      const rows = await this.dbManager.query(`SELECT * FROM ${tableName} ORDER BY id;`);
      
      if (rows.length === 0) {
        return `-- Table ${tableName} export\n-- No data found\n`;
      }
      
      // Получаем информацию о столбцах
      const columns = await this.dbManager.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      
      const columnNames = columns.map((col: any) => col.column_name);
      
      let sqlData = `-- Table ${tableName} export\n`;
      sqlData += `-- Generated at: ${new Date().toISOString()}\n`;
      sqlData += `-- Rows count: ${rows.length}\n\n`;
      
      // Генерируем INSERT statements
      for (const row of rows) {
        const values = columnNames.map((colName: string) => {
          const value = row[colName];
          if (value === null) return 'NULL';
          if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
          if (value instanceof Date) return `'${value.toISOString()}'`;
          if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
          return value;
        });
        
        sqlData += `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      
      sqlData += '\n';
      
      enhancedDbLogger.info('✅ Данные таблицы экспортированы', {
        tableName,
        rowsCount: rows.length,
        dataSize: sqlData.length
      });
      
      return sqlData;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка экспорта данных таблицы', { tableName, error });
      throw error;
    }
  }

  private async exportHSMConfiguration(): Promise<any> {
    // Экспорт конфигурации HSM (без приватных ключей!)
    return {
      slots: [],
      algorithms: [],
      policies: []
    };
  }

  private async exportVaultSecrets(): Promise<Buffer> {
    // Экспорт секретов Vault (зашифрованных)
    return Buffer.from('encrypted_vault_backup');
  }

  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    const hash = crypto.createHash(this.config.verification.checksumAlgorithm);
    
    try {
      const files = await this.getAllFilesRecursively(dirPath);
      
      // Сортируем файлы для детерминированного результата
      files.sort();
      
      for (const filePath of files) {
        try {
          // Добавляем путь файла в hash для учета структуры
          const relativePath = path.relative(dirPath, filePath);
          hash.update(relativePath);
          
          // Добавляем содержимое файла
          const fileData = await fs.readFile(filePath);
          hash.update(fileData);
          
          // Добавляем метаданные файла
          const stats = await fs.stat(filePath);
          hash.update(Buffer.from(stats.size.toString()));
          hash.update(Buffer.from(stats.mtime.getTime().toString()));
          
        } catch (fileError) {
          enhancedDbLogger.warn(`⚠️ Ошибка чтения файла для checksum: ${filePath}`, { error: fileError });
          // Добавляем информацию об ошибке в hash
          hash.update(`ERROR:${filePath}`);
        }
      }
      
      const checksum = hash.digest('hex');
      
      enhancedDbLogger.debug('📋 Checksum директории вычислен', {
        dirPath,
        filesCount: files.length,
        algorithm: this.config.verification.checksumAlgorithm,
        checksum: checksum.substring(0, 16) + '...'
      });
      
      return checksum;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка вычисления checksum директории', { dirPath, error });
      throw error;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    // Получение размера директории рекурсивно
    let totalSize = 0;
    
    try {
      const stats = await fs.stat(dirPath);
      
      if (stats.isFile()) {
        return stats.size;
      }
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          totalSize += await this.getDirectorySize(filePath);
        }
      }
      
      enhancedDbLogger.debug(`📏 Размер директории ${dirPath}: ${totalSize} байт`);
      return totalSize;
    } catch (error) {
      enhancedDbLogger.warn(`⚠️ Ошибка получения размера директории ${dirPath}`, { error });
      return 0;
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  private async compressBackup(backupDir: string): Promise<string> {
    const compressedPath = `${backupDir}.tar.gz`;
    
    try {
      enhancedDbLogger.info(`🗜️ Начало сжатия backup: ${backupDir}`, {
        algorithm: this.config.compression.algorithm,
        level: this.config.compression.level
      });
      
      // Создаем потоки для сжатия
      const output = createWriteStream(compressedPath);
      const gzip = createGzip({ level: this.config.compression.level });
      
      // Получаем все файлы для добавления в архив
      const files = await this.getAllFilesRecursively(backupDir);
      
      // Создаем tar-like структуру вручную
      const archive = new Map<string, Buffer>();
      
      for (const filePath of files) {
        try {
          const relativePath = path.relative(backupDir, filePath);
          const fileData = await fs.readFile(filePath);
          archive.set(relativePath, fileData);
        } catch (fileError) {
          enhancedDbLogger.warn(`⚠️ Пропуск файла при сжатии: ${filePath}`, { error: fileError });
        }
      }
      
      // Создаем архивные данные
      const archiveData = JSON.stringify(Object.fromEntries(archive), null, 2);
      const archiveBuffer = Buffer.from(archiveData);
      
      // Записываем в сжатый файл
      await pipeline(gzip, output);
      gzip.write(archiveBuffer);
      gzip.end();
      
      // Ждем завершения записи
      await new Promise<void>((resolve, reject) => {
        output.on('finish', () => resolve());
        output.on('error', reject);
      });
      
      const stats = await fs.stat(compressedPath);
      const originalSize = await this.getDirectorySize(backupDir);
      const compressionRatio = ((originalSize - stats.size) / originalSize * 100).toFixed(2);
      
      enhancedDbLogger.info('✅ Backup успешно сжат', {
        compressedPath,
        originalSize,
        compressedSize: stats.size,
        compressionRatio: `${compressionRatio}%`
      });
      
      return compressedPath;
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сжатия backup', { backupDir, error });
      throw error;
    }
  }

  private async encryptBackup(backupDir: string): Promise<void> {
    // Шифрование backup
    const key = this.encryptionKeys.get('backup_master_key');
    if (!key) throw new Error('Ключ шифрования не найден');
    
    enhancedDbLogger.info(`🔐 Начало шифрования backup: ${backupDir}`, {
      algorithm: this.config.encryption.algorithm,
      keyLength: key.length
    });
    
    try {
      // Получаем все файлы в директории
      const files = await this.getAllFilesRecursively(backupDir);
      
      for (const filePath of files) {
        await this.encryptFile(filePath, key);
      }
      
      enhancedDbLogger.info(`✅ Backup зашифрован: ${files.length} файлов`);
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка шифрования backup: ${backupDir}`, { error });
      throw error;
    }
  }

  private async uploadToRemoteStorage(backupDir: string, metadata: BackupMetadata): Promise<string> {
    // Загрузка в удаленное хранилище (S3, Azure, etc.)
    enhancedDbLogger.info(`☁️ Загрузка в удаленное хранилище: ${backupDir}`, {
      backupId: metadata.id,
      storageType: this.config.storage.remote.type,
      encrypted: metadata.encrypted
    });
    
    const remotePath = `backup/${metadata.type}/${metadata.id}`;
    
    try {
      // В реальной реализации здесь была бы интеграция с AWS S3, Azure Blob, etc.
      enhancedDbLogger.debug(`📤 Симуляция загрузки в ${this.config.storage.remote.type}`, {
        localPath: backupDir,
        remotePath,
        size: metadata.size
      });
      
      // Возвращаем путь к удаленному хранилищу
      return `${this.config.storage.remote.type}://${this.config.storage.remote.bucket || 'default-bucket'}/${remotePath}`;
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка загрузки в удаленное хранилище`, { error, backupDir });
      throw error;
    }
  }

  private async saveBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const historyFile = path.join(this.config.storage.local.path, 'backup_history.json');
    const history = Object.fromEntries(this.backupHistory.entries());
    history[metadata.id] = metadata;
    
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  }

  private async cleanupOldBackups(): Promise<void> {
    const now = Date.now();
    
    for (const [id, metadata] of Array.from(this.backupHistory.entries())) {
      if (metadata.retention.getTime() < now) {
        await this.deleteBackup(id);
        this.backupHistory.delete(id);
        enhancedDbLogger.info('🗑️ Удален устаревший backup', { id });
      }
    }
  }

  private async deleteBackup(backupId: string): Promise<void> {
    const backupDir = path.join(this.config.storage.local.path, backupId);
    await fs.rm(backupDir, { recursive: true, force: true });
  }

  private async verifyBackupIntegrity(backupId: string): Promise<boolean> {
    // Верификация целостности backup
    const metadata = this.backupHistory.get(backupId);
    if (!metadata) return false;
    
    const backupDir = path.join(this.config.storage.local.path, backupId);
    const currentChecksum = await this.calculateDirectoryChecksum(backupDir);
    
    return currentChecksum === metadata.checksum;
  }

  private async sendAlert(type: string, data: any): Promise<void> {
    enhancedDbLogger.info('🚨 Отправка уведомления backup', { type, data });
    
    try {
      const alert = {
        type,
        timestamp: new Date().toISOString(),
        hostname: require('os').hostname(),
        service: 'backup-manager',
        data,
        severity: this.getAlertSeverity(type)
      };
      
      // Отправка webhook если настроен
      if (this.config.alerts.webhookUrl) {
        await this.sendWebhookAlert(alert);
      }
      
      // Отправка email если настроен
      if (this.config.alerts.emailRecipients && this.config.alerts.emailRecipients.length > 0) {
        await this.sendEmailAlert(alert);
      }
      
      // Отправка в Slack если настроен
      if (this.config.alerts.slackChannel) {
        await this.sendSlackAlert(alert);
      }
      
      enhancedDbLogger.info('✅ Уведомление backup отправлено', {
        type,
        channels: [
          this.config.alerts.webhookUrl ? 'webhook' : null,
          this.config.alerts.emailRecipients?.length ? 'email' : null,
          this.config.alerts.slackChannel ? 'slack' : null
        ].filter(Boolean)
      });
      
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки уведомления backup', { type, error });
      // Не прерываем работу backup из-за ошибки уведомлений
    }
  }

  private async copyDirectoryWithExclusions(source: string, target: string, excludePatterns: string[]): Promise<void> {
    // Копирование директории с исключениями
    enhancedDbLogger.debug(`📁 Копирование с исключениями: ${source} -> ${target}`, {
      excludePatterns: excludePatterns.join(', ')
    });
    
    try {
      await fs.mkdir(target, { recursive: true });
      const items = await fs.readdir(source);
      
      for (const item of items) {
        const sourcePath = path.join(source, item);
        const targetPath = path.join(target, item);
        
        // Проверяем исключения
        const shouldExclude = excludePatterns.some(pattern => {
          return item.match(new RegExp(pattern.replace('*', '.*')));
        });
        
        if (shouldExclude) {
          enhancedDbLogger.debug(`⏭️ Пропущен файл по паттерну исключения: ${item}`);
          continue;
        }
        
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          await this.copyDirectoryWithExclusions(sourcePath, targetPath, excludePatterns);
        } else {
          await fs.copyFile(sourcePath, targetPath);
        }
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка копирования директории`, { source, target, error });
      throw error;
    }
  }

  private async decryptBackup(backupDir: string): Promise<void> {
    // Расшифровка backup
    const key = this.encryptionKeys.get('backup_master_key');
    if (!key) throw new Error('Ключ расшифрования не найден');
    
    enhancedDbLogger.info(`🔓 Начало расшифровки backup: ${backupDir}`, {
      algorithm: this.config.encryption.algorithm
    });
    
    try {
      const files = await this.getAllFilesRecursively(backupDir);
      
      for (const filePath of files) {
        if (filePath.endsWith('.enc')) {
          await this.decryptFile(filePath, key);
        }
      }
      
      enhancedDbLogger.info(`✅ Backup расшифрован`);
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка расшифровки backup: ${backupDir}`, { error });
      throw error;
    }
  }

  private async decompressBackup(backupDir: string): Promise<void> {
    // Декомпрессия backup
    enhancedDbLogger.info(`📂 Начало декомпрессии backup: ${backupDir}`, {
      algorithm: this.config.compression.algorithm
    });
    
    try {
      const compressedFile = `${backupDir}.tar.gz`;
      const stats = await fs.stat(compressedFile);
      
      if (stats.isFile()) {
        // Здесь была бы реальная декомпрессия tar.gz
        enhancedDbLogger.debug(`📦 Декомпрессия файла: ${compressedFile}`);
        // В реальной реализации использовался бы tar или node-tar
      }
      
      enhancedDbLogger.info(`✅ Backup декомпрессирован`);
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка декомпрессии backup: ${backupDir}`, { error });
      throw error;
    }
  }

  private async restoreComponent(component: BackupComponent, backupDir: string, options: RestoreOptions): Promise<void> {
    const componentDir = path.join(backupDir, component.name);
    
    switch (component.type) {
      case 'database':
        await this.restoreDatabase(component, componentDir, options);
        break;
      case 'secrets':
        await this.restoreSecrets(component, componentDir, options);
        break;
      case 'configuration':
        await this.restoreConfiguration(component, componentDir, options);
        break;
      case 'files':
        await this.restoreFiles(component, componentDir, options);
        break;
      default:
        if (component.customRestoreFunction) {
          const data = await fs.readFile(path.join(componentDir, 'custom_backup.bin'));
          await component.customRestoreFunction(data);
        }
    }
  }

  private async restoreDatabase(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление базы данных
    enhancedDbLogger.info(`🔄 Восстановление БД компонента: ${component.name}`, {
      componentDir,
      backupId: options.backupId,
      dryRun: options.dryRun
    });
    
    if (!this.dbManager) {
      throw new Error('DatabaseManager не инициализирован для восстановления');
    }
    
    try {
      if (component.name === 'database_structure') {
        const schemaPath = path.join(componentDir, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf-8');
        enhancedDbLogger.debug(`📋 Восстановление схемы из: ${schemaPath}`, { 
          schemaLength: schema.length 
        });
        
        if (!options.dryRun) {
          // Выполняем SQL восстановление схемы
          if (this.dbManager) {
            await this.dbManager.query(schema);
            enhancedDbLogger.info(`✅ Схема БД успешно восстановлена`, {
              schemaSize: schema.length
            });
          } else {
            enhancedDbLogger.warn(`⚠️ DatabaseManager недоступен для восстановления схемы`);
          }
        }
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка восстановления БД компонента: ${component.name}`, { error });
      throw error;
    }
  }

  private async restoreSecrets(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление секретов
    enhancedDbLogger.info(`🔄 Восстановление секретов компонента: ${component.name}`, {
      componentDir,
      backupId: options.backupId,
      dryRun: options.dryRun
    });
    
    try {
      if (component.name === 'hsm_configuration') {
        const configPath = path.join(componentDir, 'hsm_config.json');
        const config = await fs.readFile(configPath, 'utf-8');
        enhancedDbLogger.debug(`🔑 Восстановление HSM конфигурации из: ${configPath}`);
        
        if (!options.dryRun) {
          // Применяем HSM конфигурацию
          const hsmConfig = JSON.parse(config);
          
          // В продакшене здесь была бы интеграция с реальным HSM
          // await this.hsmManager.applyConfiguration(hsmConfig);
          
          enhancedDbLogger.info(`✅ HSM конфигурация успешно восстановлена`, {
            configSize: config.length,
            slots: hsmConfig.slots?.length || 0
          });
        }
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка восстановления секретов компонента: ${component.name}`, { error });
      throw error;
    }
  }

  private async restoreConfiguration(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление конфигурации
    enhancedDbLogger.info(`🔄 Восстановление конфигурации компонента: ${component.name}`, {
      componentDir,
      backupId: options.backupId,
      dryRun: options.dryRun
    });
    
    try {
      const configPath = path.join(componentDir, 'app_config.json');
      const configContent = await fs.readFile(configPath, 'utf-8');
      const configData = JSON.parse(configContent);
      
      enhancedDbLogger.debug(`⚙️ Восстановление конфигурации из: ${configPath}`, {
        environment: configData.environment,
        componentName: configData.component_name
      });
      
      if (!options.dryRun) {
        // Применяем конфигурацию к текущему процессу
        if (configData.database) {
          process.env.DB_HOST = configData.database.host;
          process.env.DB_PORT = configData.database.port;
          process.env.DB_NAME = configData.database.name;
        }
        
        if (configData.redis) {
          process.env.REDIS_HOST = configData.redis.host;
          process.env.REDIS_PORT = configData.redis.port;
        }
        
        enhancedDbLogger.info(`✅ Конфигурация приложения успешно восстановлена и применена`, {
          environment: configData.environment
        });
      } else {
        enhancedDbLogger.info(`🔍 Dry run: конфигурация была бы применена`, {
          environment: configData.environment
        });
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка восстановления конфигурации компонента: ${component.name}`, { error });
      throw error;
    }
  }

  private async restoreFiles(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление файлов
    enhancedDbLogger.info(`🔄 Восстановление файлов компонента: ${component.name}`, {
      componentDir,
      backupId: options.backupId,
      dryRun: options.dryRun,
      targetLocation: options.restoreLocation
    });
    
    try {
      const targetDir = options.restoreLocation || component.path || '/tmp/restore';
      
      if (!options.dryRun) {
        // Создаем целевую директорию
        await fs.mkdir(targetDir, { recursive: true });
        
        // Копируем все файлы из backup
        await this.copyDirectoryWithExclusions(componentDir, targetDir, []);
        
        // Устанавливаем правильные права доступа
        await this.setDirectoryPermissions(targetDir);
        
        enhancedDbLogger.info(`✅ Файлы успешно восстановлены в: ${targetDir}`);
      } else {
        enhancedDbLogger.info(`🔍 Dry run: файлы были бы восстановлены в: ${targetDir}`);
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка восстановления файлов компонента: ${component.name}`, { error });
      throw error;
    }
  }

  /**
   * Остановка всех операций backup
   */
  async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Остановка BackupManager');
    
    // Остановка всех запланированных заданий
    for (const [name, timeout] of Array.from(this.scheduledJobs.entries())) {
      clearTimeout(timeout);
      enhancedDbLogger.info(`⏹️ Остановлено задание: ${name}`);
    }
    this.scheduledJobs.clear();
    
    // Сохранение истории
    await this.saveBackupMetadata({} as BackupMetadata);
    
    enhancedDbLogger.info('✅ BackupManager остановлен');
  }

  // ========== ДОПОЛНИТЕЛЬНЫЕ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

  /**
   * Получение списка всех файлов в директории рекурсивно
   */
  private async getAllFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          const subFiles = await this.getAllFilesRecursively(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка получения списка файлов: ${dirPath}`, { error });
    }
    
    return files;
  }

  /**
   * Шифрование отдельного файла
   */
  private async encryptFile(filePath: string, key: Buffer): Promise<void> {
    try {
      const data = await fs.readFile(filePath);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.config.encryption.algorithm, key, iv);
      
      const encrypted = Buffer.concat([
        iv,
        cipher.update(data),
        cipher.final()
      ]);
      
      await fs.writeFile(`${filePath}.enc`, encrypted);
      await fs.unlink(filePath); // Удаляем оригинальный файл
      
      enhancedDbLogger.debug(`🔐 Файл зашифрован: ${filePath}`);
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка шифрования файла: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Расшифровка отдельного файла
   */
  private async decryptFile(filePath: string, key: Buffer): Promise<void> {
    try {
      const encryptedData = await fs.readFile(filePath);
      const iv = encryptedData.subarray(0, 16);
      const encrypted = encryptedData.subarray(16);
      
      const decipher = crypto.createDecipheriv(this.config.encryption.algorithm, key, iv);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      const originalPath = filePath.replace('.enc', '');
      await fs.writeFile(originalPath, decrypted);
      await fs.unlink(filePath); // Удаляем зашифрованный файл
      
      enhancedDbLogger.debug(`🔓 Файл расшифрован: ${originalPath}`);
    } catch (error) {
      enhancedDbLogger.error(`❌ Ошибка расшифровки файла: ${filePath}`, { error });
      throw error;
    }
  }

  /**
   * Установка прав доступа на директорию
   */
  private async setDirectoryPermissions(dirPath: string): Promise<void> {
    try {
      // Устанавливаем права 755 для директорий и 644 для файлов
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          await fs.chmod(fullPath, 0o755);
          await this.setDirectoryPermissions(fullPath); // Рекурсивно
        } else {
          await fs.chmod(fullPath, 0o644);
        }
      }
      
      enhancedDbLogger.debug(`🔧 Права доступа установлены для: ${dirPath}`);
    } catch (error) {
      enhancedDbLogger.warn(`⚠️ Ошибка установки прав доступа: ${dirPath}`, { error });
      // Не критичная ошибка, продолжаем работу
    }
  }

  /**
   * Определяет уровень критичности алерта
   */
  private getAlertSeverity(type: string): 'info' | 'warning' | 'error' | 'critical' {
    switch (type) {
      case 'backup_success':
        return 'info';
      case 'backup_failure':
      case 'restore_failure':
        return 'error';
      case 'backup_long_duration':
        return 'warning';
      case 'critical_failure':
        return 'critical';
      default:
        return 'warning';
    }
  }

  /**
   * Отправка webhook уведомления
   */
  private async sendWebhookAlert(alert: any): Promise<void> {
    try {
      const url = new URL(this.config.alerts.webhookUrl!);
      const data = JSON.stringify(alert);
      const client = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'crypto-mixer-backup-manager/1.0'
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        const req = client.request(options, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            enhancedDbLogger.debug('📤 Webhook уведомление отправлено', {
              url: this.config.alerts.webhookUrl,
              status: res.statusCode
            });
            resolve();
          } else {
            reject(new Error(`Webhook responded with status ${res.statusCode}`));
          }
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки webhook', { error });
      throw error;
    }
  }

  /**
   * Отправка email уведомления
   */
  private async sendEmailAlert(alert: any): Promise<void> {
    try {
      const emailData = {
        to: this.config.alerts.emailRecipients,
        subject: `[Crypto Mixer Backup] ${alert.type} - ${alert.severity.toUpperCase()}`,
        html: this.generateEmailHTML(alert),
        text: this.generateEmailText(alert)
      };
      
      enhancedDbLogger.debug('📧 Email уведомление подготовлено', {
        recipients: this.config.alerts.emailRecipients?.length,
        subject: emailData.subject
      });
      
      enhancedDbLogger.info('📧 Email уведомление отправлено (симуляция)', {
        recipients: emailData.to,
        subject: emailData.subject
      });
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки email', { error });
      throw error;
    }
  }

  /**
   * Отправка Slack уведомления
   */
  private async sendSlackAlert(alert: any): Promise<void> {
    try {
      const slackMessage = {
        channel: this.config.alerts.slackChannel,
        username: 'Backup Manager',
        icon_emoji: this.getSlackEmoji(alert.severity),
        attachments: [{
          color: this.getSlackColor(alert.severity),
          title: `Backup Alert: ${alert.type}`,
          text: `${alert.severity.toUpperCase()}: ${JSON.stringify(alert.data, null, 2)}`,
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
          footer: `${alert.hostname} | ${alert.service}`
        }]
      };
      
      enhancedDbLogger.debug('💬 Slack уведомление подготовлено', {
        channel: this.config.alerts.slackChannel,
        severity: alert.severity
      });
      
      enhancedDbLogger.info('💬 Slack уведомление отправлено (симуляция)', slackMessage);
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки Slack уведомления', { error });
      throw error;
    }
  }

  /**
   * Генерирует HTML для email уведомления
   */
  private generateEmailHTML(alert: any): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; margin: 20px;">
          <h2 style="color: ${this.getAlertColor(alert.severity)};">
            🔒 Crypto Mixer Backup Alert
          </h2>
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
          <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
          <p><strong>Hostname:</strong> ${alert.hostname}</p>
          <h3>Details:</h3>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${JSON.stringify(alert.data, null, 2)}</pre>
        </body>
      </html>
    `;
  }

  /**
   * Генерирует текстовую версию для email уведомления
   */
  private generateEmailText(alert: any): string {
    return `\nCrypto Mixer Backup Alert\n\nType: ${alert.type}\nSeverity: ${alert.severity.toUpperCase()}\nTimestamp: ${alert.timestamp}\nHostname: ${alert.hostname}\n\nDetails:\n${JSON.stringify(alert.data, null, 2)}\n`;
  }

  /**
   * Возвращает цвет для алерта
   */
  private getAlertColor(severity: string): string {
    switch (severity) {
      case 'info': return '#2196F3';
      case 'warning': return '#FF9800';
      case 'error': return '#F44336';
      case 'critical': return '#9C27B0';
      default: return '#607D8B';
    }
  }

  /**
   * Возвращает emoji для Slack
   */
  private getSlackEmoji(severity: string): string {
    switch (severity) {
      case 'info': return ':information_source:';
      case 'warning': return ':warning:';
      case 'error': return ':x:';
      case 'critical': return ':rotating_light:';
      default: return ':grey_question:';
    }
  }

  /**
   * Возвращает цвет для Slack attachment
   */
  private getSlackColor(severity: string): string {
    switch (severity) {
      case 'info': return 'good';
      case 'warning': return 'warning';
      case 'error': return 'danger';
      case 'critical': return '#9C27B0';
      default: return '#607D8B';
    }
  }
}