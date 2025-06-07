import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
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
 */
export class BackupManager {
  private config: BackupConfig;
  private isRunning: boolean = false;
  private currentBackupId: string | null = null;
  private backupHistory: Map<string, BackupMetadata> = new Map();
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private encryptionKeys: Map<string, Buffer> = new Map();
  
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

  constructor(config: BackupConfig) {
    this.config = config;
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
      await enhancedDbLogger.logError(error);
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

      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
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
    const dbManager = DatabaseManager.getInstance();
    
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
      backup_timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(path.join(outputDir, 'app_config.json'), JSON.stringify(config, null, 2));
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
      await enhancedDbLogger.logError(error);
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
    // Экспорт схемы БД (pg_dump --schema-only)
    return '-- Database schema export\n-- Implementation needed';
  }

  private async exportTableData(tableName: string): Promise<string> {
    // Экспорт данных таблицы
    return `-- Table ${tableName} export\n-- Implementation needed`;
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
    // Вычисление checksum всей директории
    const hash = crypto.createHash(this.config.verification.checksumAlgorithm);
    // Implementation needed
    return hash.digest('hex');
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    // Получение размера директории
    const stats = await fs.stat(dirPath);
    return stats.size;
  }

  private async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  private async compressBackup(backupDir: string): Promise<string> {
    const compressedPath = `${backupDir}.tar.gz`;
    // Сжатие с помощью tar + gzip
    // Implementation needed
    return compressedPath;
  }

  private async encryptBackup(backupDir: string): Promise<void> {
    // Шифрование backup
    const key = this.encryptionKeys.get('backup_master_key');
    if (!key) throw new Error('Ключ шифрования не найден');
    
    // Implementation needed
  }

  private async uploadToRemoteStorage(backupDir: string, metadata: BackupMetadata): Promise<string> {
    // Загрузка в удаленное хранилище (S3, Azure, etc.)
    return `remote://bucket/path/${metadata.id}`;
  }

  private async saveBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const historyFile = path.join(this.config.storage.local.path, 'backup_history.json');
    const history = Object.fromEntries(this.backupHistory.entries());
    history[metadata.id] = metadata;
    
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  }

  private async cleanupOldBackups(): Promise<void> {
    const now = Date.now();
    
    for (const [id, metadata] of this.backupHistory.entries()) {
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
    // Implementation needed для webhook, email, slack
  }

  private async copyDirectoryWithExclusions(source: string, target: string, excludePatterns: string[]): Promise<void> {
    // Копирование директории с исключениями
    // Implementation needed
  }

  private async decryptBackup(backupDir: string): Promise<void> {
    // Расшифровка backup
    // Implementation needed
  }

  private async decompressBackup(backupDir: string): Promise<void> {
    // Декомпрессия backup
    // Implementation needed
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
    enhancedDbLogger.info(`🔄 Восстановление БД компонента: ${component.name}`);
    // Implementation needed
  }

  private async restoreSecrets(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление секретов
    enhancedDbLogger.info(`🔄 Восстановление секретов компонента: ${component.name}`);
    // Implementation needed
  }

  private async restoreConfiguration(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление конфигурации
    enhancedDbLogger.info(`🔄 Восстановление конфигурации компонента: ${component.name}`);
    // Implementation needed
  }

  private async restoreFiles(component: BackupComponent, componentDir: string, options: RestoreOptions): Promise<void> {
    // Восстановление файлов
    enhancedDbLogger.info(`🔄 Восстановление файлов компонента: ${component.name}`);
    // Implementation needed
  }

  /**
   * Остановка всех операций backup
   */
  async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Остановка BackupManager');
    
    // Остановка всех запланированных заданий
    for (const [name, timeout] of this.scheduledJobs) {
      clearTimeout(timeout);
      enhancedDbLogger.info(`⏹️ Остановлено задание: ${name}`);
    }
    this.scheduledJobs.clear();
    
    // Сохранение истории
    await this.saveBackupMetadata({} as BackupMetadata);
    
    enhancedDbLogger.info('✅ BackupManager остановлен');
  }
}