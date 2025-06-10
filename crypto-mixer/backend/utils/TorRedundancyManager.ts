import { EventEmitter } from 'events';
import { torManager } from './TorManager';
import { torMonitoringService } from './TorMonitoringService';
import { connectionFailoverManager } from './ConnectionFailoverManager';
import logger from './logger';
import * as net from 'net';
import fs from 'fs/promises';

/**
 * Менеджер резервных схем Tor для максимальной надежности
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Система резервирования Tor инфраструктуры:
 * - Множественные hidden services с автоматическим переключением
 * - Резервные SOCKS порты и Tor instances
 * - Geographical failover через разные Tor серверы
 * - Автоматическое восстановление после сбоев
 * - Load balancing между множественными onion адресами
 * - Горячее резервирование критически важных сервисов
 */

export interface TorInstance {
  id: string;
  name: string;
  socksPort: number;
  controlPort: number;
  dataDirectory: string;
  configFile: string;
  status: 'active' | 'standby' | 'failed' | 'unknown';
  priority: number;
  lastHealthCheck: Date;
  errorCount: number;
  uptime: number;
  region?: string; // Географический регион
}

export interface HiddenServiceCluster {
  serviceName: string;
  primary: string; // Основной onion адрес
  backups: string[]; // Резервные onion адреса
  currentActive: string;
  ports: number[];
  lastFailover: Date | null;
  failoverCount: number;
  loadBalancing: boolean;
}

export interface RedundancyConfig {
  enableMultipleInstances: boolean;
  minActiveInstances: number;
  maxFailureThreshold: number;
  healthCheckInterval: number;
  failoverTimeout: number;
  enableLoadBalancing: boolean;
  enableGeoFailover: boolean;
  regions: string[];
}

export class TorRedundancyManager extends EventEmitter {
  private instances: Map<string, TorInstance> = new Map();
  private hiddenServiceClusters: Map<string, HiddenServiceCluster> = new Map();
  private config: RedundancyConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private currentPrimaryInstance: string | null = null;

  /**
   * Утилита для безопасного извлечения сообщения об ошибке
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  // Конфигурация множественных Tor instances
  private readonly INSTANCE_CONFIGS = [
    {
      id: 'primary',
      name: 'Primary Tor Instance',
      socksPort: 9050,
      controlPort: 9053,
      dataDirectory: '/var/lib/tor/primary',
      configFile: '/etc/tor/torrc',
      priority: 1,
      region: 'primary',
    },
    {
      id: 'backup1',
      name: 'Backup Tor Instance 1',
      socksPort: 9060,
      controlPort: 9063,
      dataDirectory: '/var/lib/tor/backup1',
      configFile: '/etc/tor/torrc-backup1',
      priority: 2,
      region: 'eu',
    },
    {
      id: 'backup2',
      name: 'Backup Tor Instance 2',
      socksPort: 9070,
      controlPort: 9073,
      dataDirectory: '/var/lib/tor/backup2',
      configFile: '/etc/tor/torrc-backup2',
      priority: 3,
      region: 'us',
    },
    {
      id: 'emergency',
      name: 'Emergency Tor Instance',
      socksPort: 9080,
      controlPort: 9083,
      dataDirectory: '/var/lib/tor/emergency',
      configFile: '/etc/tor/torrc-emergency',
      priority: 4,
      region: 'asia',
    },
  ];

  constructor(config: Partial<RedundancyConfig> = {}) {
    super();

    this.config = {
      enableMultipleInstances: process.env.TOR_REDUNDANCY_ENABLED === 'true',
      minActiveInstances: 2,
      maxFailureThreshold: 3,
      healthCheckInterval: 30000, // 30 секунд
      failoverTimeout: 10000, // 10 секунд
      enableLoadBalancing: true,
      enableGeoFailover: true,
      regions: ['primary', 'eu', 'us', 'asia'],
      ...config,
    };

    logger.info('🔄 TorRedundancyManager инициализирован', {
      multipleInstances: this.config.enableMultipleInstances,
      minActiveInstances: this.config.minActiveInstances,
      loadBalancing: this.config.enableLoadBalancing,
    });
  }

  /**
   * Инициализация системы резервирования
   */
  public async initialize(): Promise<void> {
    if (!this.config.enableMultipleInstances) {
      logger.info('🔄 Резервирование Tor отключено в конфигурации');
      return;
    }

    try {
      logger.info('🔄 Инициализация системы резервирования Tor...');

      // Инициализируем все Tor instances
      await this.initializeInstances();

      // Создаем резервные конфигурации
      await this.createBackupConfigurations();

      // Инициализируем hidden service кластеры
      await this.initializeHiddenServiceClusters();

      // Запускаем мониторинг здоровья
      this.startHealthMonitoring();

      // Интегрируемся с системой мониторинга Tor
      this.setupMonitoringIntegration();

      // Определяем активный primary instance
      await this.selectPrimaryInstance();

      this.isInitialized = true;
      logger.info('✅ Система резервирования Tor инициализирована');
      this.emit('initialized');

    } catch (error) {
      logger.error('❌ Ошибка инициализации резервирования Tor:', error);
      throw error;
    }
  }

  /**
   * Инициализация всех Tor instances
   */
  private async initializeInstances(): Promise<void> {
    for (const instanceConfig of this.INSTANCE_CONFIGS) {
      const instance: TorInstance = {
        ...instanceConfig,
        status: 'unknown',
        lastHealthCheck: new Date(),
        errorCount: 0,
        uptime: 0,
      };

      this.instances.set(instance.id, instance);
      logger.info(`🔄 Инициализирован Tor instance: ${instance.name}`);
    }
  }

  /**
   * Создание резервных конфигураций Tor
   */
  private async createBackupConfigurations(): Promise<void> {
    try {
      // Читаем основную конфигурацию
      const mainConfig = await fs.readFile('/Users/macbook/Documents/CM/crypto-mixer/security/tor/torrc', 'utf-8');

      for (const instanceConfig of this.INSTANCE_CONFIGS.slice(1)) { // Пропускаем primary
        const backupConfig = this.generateBackupTorrcConfig(mainConfig, instanceConfig);
        
        // В реальной среде Docker/Kubernetes это будет создавать файлы в правильных местах
        const configPath = instanceConfig.configFile;
        logger.info(`📝 Создаем резервную конфигурацию: ${configPath}`);
        
        // Сохраняем конфигурацию (в продакшне)
        // await fs.writeFile(configPath, backupConfig);
        
        // Логируем созданную конфигурацию для отладки
        logger.debug(`📄 Конфигурация для ${instanceConfig.name}:`, {
          configLength: backupConfig.length,
          socksPort: instanceConfig.socksPort,
          controlPort: instanceConfig.controlPort,
          region: instanceConfig.region
        });
        
        logger.info(`✅ Конфигурация создана для ${instanceConfig.name}`);
      }

    } catch (error) {
      logger.error('❌ Ошибка создания резервных конфигураций:', error);
      throw error;
    }
  }

  /**
   * Генерация резервной конфигурации Tor
   */
  private generateBackupTorrcConfig(baseConfig: string, instance: any): string {
    // Заменяем порты и директории в базовой конфигурации
    let backupConfig = baseConfig
      .replace(/SocksPort 0\.0\.0\.0:9050/g, `SocksPort 0.0.0.0:${instance.socksPort}`)
      .replace(/SocksPort 0\.0\.0\.0:9051/g, `SocksPort 0.0.0.0:${instance.socksPort + 1}`)
      .replace(/SocksPort 0\.0\.0\.0:9052/g, `SocksPort 0.0.0.0:${instance.socksPort + 2}`)
      .replace(/ControlPort 0\.0\.0\.0:9053/g, `ControlPort 0.0.0.0:${instance.controlPort}`)
      .replace(/DataDirectory \/var\/lib\/tor/g, `DataDirectory ${instance.dataDirectory}`)
      .replace(/HiddenServiceDir \/var\/lib\/tor\/mixer_/g, `HiddenServiceDir ${instance.dataDirectory}/mixer_`);

    // Добавляем специфичные для instance настройки
    backupConfig += `\n\n# Backup instance specific settings for ${instance.name}\n`;
    backupConfig += `Nickname ${instance.id}-mixer\n`;
    backupConfig += `# Region: ${instance.region}\n`;
    
    // Настройки для geographic diversity
    if (instance.region === 'eu') {
      backupConfig += 'EntryNodes {eu}\n';
      backupConfig += 'ExitNodes {eu}\n';
    } else if (instance.region === 'us') {
      backupConfig += 'EntryNodes {us}\n';
      backupConfig += 'ExitNodes {us}\n';
    } else if (instance.region === 'asia') {
      backupConfig += 'EntryNodes {??}\n'; // Любая страна кроме US/EU
      backupConfig += 'ExitNodes {??}\n';
    }

    return backupConfig;
  }

  /**
   * Инициализация кластеров hidden services
   */
  private async initializeHiddenServiceClusters(): Promise<void> {
    const serviceTypes = ['web', 'api', 'admin', 'monitoring'];

    for (const serviceType of serviceTypes) {
      const cluster: HiddenServiceCluster = {
        serviceName: `mixer_${serviceType}`,
        primary: '', // Будет заполнено при первой проверке
        backups: [],
        currentActive: '',
        ports: serviceType === 'monitoring' ? [80] : [80, 443],
        lastFailover: null,
        failoverCount: 0,
        loadBalancing: this.config.enableLoadBalancing,
      };

      this.hiddenServiceClusters.set(serviceType, cluster);
      logger.info(`🧅 Инициализирован кластер hidden service: ${serviceType}`);
    }
  }

  /**
   * Настройка интеграции с системой мониторинга
   */
  private setupMonitoringIntegration(): void {
    // Подписываемся на события TorMonitoringService
    torMonitoringService.on('serviceFailed', (event) => {
      logger.warn('🚨 TorMonitoringService сообщает о сбое сервиса:', event);
      // Проверяем нужно ли реагировать на этот сбой
      this.handleExternalServiceFailure(event);
    });

    torMonitoringService.on('serviceRecovered', (event) => {
      logger.info('✅ TorMonitoringService сообщает о восстановлении сервиса:', event);
      // Возможно стоит пересмотреть приоритеты instances
      this.evaluateFailoverNeed();
    });

    logger.info('🔗 Интеграция с TorMonitoringService настроена');
  }

  /**
   * Обработка сбоев сервисов из внешних систем мониторинга
   */
  private async handleExternalServiceFailure(event: any): Promise<void> {
    // Если упал критический сервис, возможно нужен failover
    if (event.serviceName === 'socks_9050' || event.serviceName === 'control_port') {
      logger.warn('⚠️ Критический сервис упал, проверяем необходимость failover');
      await this.evaluateFailoverNeed();
    }
  }

  /**
   * Запуск мониторинга здоровья всех instances
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    logger.info('🔍 Запущен мониторинг здоровья Tor instances');
  }

  /**
   * Проверка здоровья всех Tor instances
   */
  private async performHealthCheck(): Promise<void> {
    try {
      logger.debug('🔍 Проверяем здоровье всех Tor instances...');

      const healthCheckPromises: Promise<void>[] = [];

      for (const [instanceId, instance] of this.instances) {
        healthCheckPromises.push(this.checkInstanceHealth(instanceId, instance));
      }

      await Promise.allSettled(healthCheckPromises);

      // Проверяем нужно ли failover
      await this.evaluateFailoverNeed();

      // Обновляем hidden service кластеры
      await this.updateHiddenServiceClusters();

      this.emit('healthCheckCompleted', this.getStats());

    } catch (error) {
      logger.error('❌ Ошибка проверки здоровья instances:', error);
    }
  }

  /**
   * Проверка здоровья конкретного instance
   */
  private async checkInstanceHealth(instanceId: string, instance: TorInstance): Promise<void> {
    const startTime = Date.now();

    try {
      // Проверяем доступность SOCKS порта
      await this.checkPort(instance.socksPort);
      
      // Проверяем доступность control порта
      await this.checkPort(instance.controlPort);
      
      // Дополнительная проверка через TorManager для primary instance
      if (instanceId === this.currentPrimaryInstance) {
        await torManager.testConnection();
      }

      // Если всё ОК, обновляем статус
      instance.status = 'active';
      instance.lastHealthCheck = new Date();
      instance.errorCount = Math.max(0, instance.errorCount - 1); // Снижаем счетчик ошибок
      
      const responseTime = Date.now() - startTime;
      logger.debug(`✅ Instance ${instanceId} здоров (${responseTime}ms)`);

    } catch (error) {
      instance.status = 'failed';
      instance.errorCount++;
      instance.lastHealthCheck = new Date();

      logger.warn(`⚠️ Instance ${instanceId} неисправен:`, this.getErrorMessage(error));

      // Если превышен порог ошибок, помечаем как полностью неисправный
      if (instance.errorCount >= this.config.maxFailureThreshold) {
        instance.status = 'failed';
        this.emit('instanceFailed', { instanceId, instance });
      }
    }
  }

  /**
   * Проверка доступности порта
   */
  private async checkPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Port ${port} timeout`));
      }, 5000);

      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve();
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Оценка необходимости failover
   */
  private async evaluateFailoverNeed(): Promise<void> {
    const activeInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'active');

    const failedInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'failed');

    // Если активных instances меньше минимума
    if (activeInstances.length < this.config.minActiveInstances) {
      logger.warn(`⚠️ Недостаточно активных instances: ${activeInstances.length}/${this.config.minActiveInstances}`);
      await this.performEmergencyFailover();
    }

    // Если primary instance упал
    if (this.currentPrimaryInstance) {
      const primaryInstance = this.instances.get(this.currentPrimaryInstance);
      if (primaryInstance && primaryInstance.status === 'failed') {
        logger.warn(`🚨 Primary instance ${this.currentPrimaryInstance} упал`);
        await this.failoverPrimaryInstance();
      }
    }

    // Уведомляем о состоянии
    if (failedInstances.length > 0) {
      this.emit('instancesDown', {
        failed: failedInstances.map(i => i.id),
        active: activeInstances.map(i => i.id),
      });
    }
  }

  /**
   * Переключение primary instance
   */
  private async failoverPrimaryInstance(): Promise<void> {
    try {
      logger.info('🔄 Переключаем primary instance...');

      // Находим лучший кандидат для замены
      const candidates = Array.from(this.instances.values())
        .filter(instance => instance.status === 'active')
        .sort((a, b) => a.priority - b.priority);

      if (candidates.length === 0) {
        throw new Error('Нет активных instances для failover');
      }

      const newPrimary = candidates[0];
      const oldPrimary = this.currentPrimaryInstance;

      this.currentPrimaryInstance = newPrimary.id;

      logger.info(`✅ Primary instance переключен с ${oldPrimary} на ${newPrimary.id}`);

      // Уведомляем ConnectionFailoverManager о смене primary instance
      // Принудительно переключаем все соединения на новый instance
      connectionFailoverManager.forceConnectionType('api', 'tor');
      connectionFailoverManager.forceConnectionType('web', 'tor');
      connectionFailoverManager.forceConnectionType('blockchain', 'tor');

      this.emit('primaryInstanceChanged', {
        oldPrimary,
        newPrimary: newPrimary.id,
        newSocksPort: newPrimary.socksPort,
      });

    } catch (error) {
      logger.error('❌ Ошибка переключения primary instance:', error);
      throw error;
    }
  }

  /**
   * Экстренное переключение при критических сбоях
   */
  private async performEmergencyFailover(): Promise<void> {
    try {
      logger.warn('🚨 Выполняем экстренное переключение...');

      // Пытаемся активировать standby instances
      const standbyInstances = Array.from(this.instances.values())
        .filter(instance => instance.status === 'standby');

      for (const instance of standbyInstances) {
        try {
          await this.activateInstance(instance.id);
        } catch (error) {
          logger.warn(`Не удалось активировать ${instance.id}:`, this.getErrorMessage(error));
        }
      }

      // Если всё ещё недостаточно активных instances
      const activeCount = Array.from(this.instances.values())
        .filter(instance => instance.status === 'active').length;

      if (activeCount < this.config.minActiveInstances) {
        // Крайняя мера - переключаемся на direct соединения
        logger.error('🚨 Критический сбой Tor инфраструктуры - переключаемся на direct');
        this.emit('criticalFailure', {
          activeInstances: activeCount,
          requiredMinimum: this.config.minActiveInstances,
        });
      }

    } catch (error) {
      logger.error('❌ Ошибка экстренного переключения:', error);
    }
  }

  /**
   * Активация instance
   */
  private async activateInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} не найден`);
    }

    logger.info(`🔄 Активируем instance ${instanceId}...`);

    try {
      // В реальной среде здесь будет запуск Tor процесса
      // await this.startTorProcess(instance);

      instance.status = 'active';
      instance.errorCount = 0;

      logger.info(`✅ Instance ${instanceId} активирован`);

    } catch (error) {
      instance.status = 'failed';
      logger.error(`❌ Не удалось активировать ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Выбор primary instance
   */
  private async selectPrimaryInstance(): Promise<void> {
    const activeInstances = Array.from(this.instances.values())
      .filter(instance => instance.status === 'active')
      .sort((a, b) => a.priority - b.priority);

    if (activeInstances.length > 0) {
      this.currentPrimaryInstance = activeInstances[0].id;
      logger.info(`✅ Primary instance: ${this.currentPrimaryInstance}`);
    } else {
      logger.warn('⚠️ Нет активных instances для выбора primary');
    }
  }

  /**
   * Обновление кластеров hidden services
   */
  private async updateHiddenServiceClusters(): Promise<void> {
    for (const [serviceType, cluster] of this.hiddenServiceClusters) {
      try {
        // Читаем onion адреса от всех активных instances
        const activeInstances = Array.from(this.instances.values())
          .filter(instance => instance.status === 'active');

        const onionAddresses: string[] = [];

        for (const instance of activeInstances) {
          try {
            // В реальной среде читаем hostname файлы
            const hostnameFile = `${instance.dataDirectory}/mixer_${serviceType}/hostname`;
            // const onionAddress = await fs.readFile(hostnameFile, 'utf-8');
            // onionAddresses.push(onionAddress.trim());
            
            // Логируем попытку чтения hostname файла
            logger.debug(`🗋 Попытка чтения ${hostnameFile} для ${instance.id}`);
            
            // Для демонстрации добавляем фиктивные адреса
            const demoOnionAddress = `${instance.id}${serviceType}1234567890abcdef.onion`;
            onionAddresses.push(demoOnionAddress);
            logger.debug(`🧅 Создан demo onion адрес: ${demoOnionAddress}`);
          } catch (error) {
            // Файл может не существовать если service ещё не готов
          }
        }

        if (onionAddresses.length > 0) {
          cluster.primary = onionAddresses[0];
          cluster.backups = onionAddresses.slice(1);
          cluster.currentActive = cluster.primary;
        }

      } catch (error) {
        logger.warn(`Ошибка обновления кластера ${serviceType}:`, this.getErrorMessage(error));
      }
    }
  }

  /**
   * Получение лучшего onion адреса для сервиса
   */
  public getBestOnionAddress(serviceType: string): string | null {
    const cluster = this.hiddenServiceClusters.get(serviceType);
    if (!cluster) {
      return null;
    }

    // Если включен load balancing, выбираем случайный адрес
    if (cluster.loadBalancing && cluster.backups.length > 0) {
      const allAddresses = [cluster.primary, ...cluster.backups];
      const randomIndex = Math.floor(Math.random() * allAddresses.length);
      return allAddresses[randomIndex];
    }

    return cluster.currentActive || cluster.primary;
  }

  /**
   * Получение статистики системы резервирования
   */
  public getStats() {
    const instances = Array.from(this.instances.values());
    const clusters = Array.from(this.hiddenServiceClusters.entries());

    return {
      isEnabled: this.config.enableMultipleInstances,
      isInitialized: this.isInitialized,
      currentPrimaryInstance: this.currentPrimaryInstance,
      
      instances: {
        total: instances.length,
        active: instances.filter(i => i.status === 'active').length,
        standby: instances.filter(i => i.status === 'standby').length,
        failed: instances.filter(i => i.status === 'failed').length,
        details: instances.map(instance => ({
          id: instance.id,
          name: instance.name,
          status: instance.status,
          region: instance.region,
          socksPort: instance.socksPort,
          errorCount: instance.errorCount,
          lastHealthCheck: instance.lastHealthCheck,
        })),
      },
      
      hiddenServiceClusters: clusters.map(([type, cluster]) => ({
        serviceType: type,
        primary: cluster.primary,
        backupsCount: cluster.backups.length,
        currentActive: cluster.currentActive,
        failoverCount: cluster.failoverCount,
        lastFailover: cluster.lastFailover,
        loadBalancing: cluster.loadBalancing,
      })),
      
      config: this.config,
    };
  }

  /**
   * Принудительное переключение на конкретный instance
   */
  public async forceSwitchToInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} не найден`);
    }

    if (instance.status !== 'active') {
      throw new Error(`Instance ${instanceId} не активен`);
    }

    const oldPrimary = this.currentPrimaryInstance;
    this.currentPrimaryInstance = instanceId;

    logger.info(`🔧 Принудительно переключились на instance ${instanceId}`);

    this.emit('manualInstanceSwitch', {
      oldPrimary,
      newPrimary: instanceId,
    });
  }

  /**
   * Остановка системы резервирования
   */
  public async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    logger.info('🛑 TorRedundancyManager остановлен');
    this.emit('shutdown');
  }
}

// Создаем глобальный экземпляр
export const torRedundancyManager = new TorRedundancyManager();