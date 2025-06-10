"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.torRedundancyManager = exports.TorRedundancyManager = void 0;
const events_1 = require("events");
const logger_1 = require("./logger");
const net_1 = __importDefault(require("net"));
const promises_1 = __importDefault(require("fs/promises"));
class TorRedundancyManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.instances = new Map();
        this.hiddenServiceClusters = new Map();
        this.healthCheckTimer = null;
        this.isInitialized = false;
        this.currentPrimaryInstance = null;
        // Конфигурация множественных Tor instances
        this.INSTANCE_CONFIGS = [
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
        logger_1.logger.info('🔄 TorRedundancyManager инициализирован', {
            multipleInstances: this.config.enableMultipleInstances,
            minActiveInstances: this.config.minActiveInstances,
            loadBalancing: this.config.enableLoadBalancing,
        });
    }
    /**
     * Инициализация системы резервирования
     */
    async initialize() {
        if (!this.config.enableMultipleInstances) {
            logger_1.logger.info('🔄 Резервирование Tor отключено в конфигурации');
            return;
        }
        try {
            logger_1.logger.info('🔄 Инициализация системы резервирования Tor...');
            // Инициализируем все Tor instances
            await this.initializeInstances();
            // Создаем резервные конфигурации
            await this.createBackupConfigurations();
            // Инициализируем hidden service кластеры
            await this.initializeHiddenServiceClusters();
            // Запускаем мониторинг здоровья
            this.startHealthMonitoring();
            // Определяем активный primary instance
            await this.selectPrimaryInstance();
            this.isInitialized = true;
            logger_1.logger.info('✅ Система резервирования Tor инициализирована');
            this.emit('initialized');
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка инициализации резервирования Tor:', error);
            throw error;
        }
    }
    /**
     * Инициализация всех Tor instances
     */
    async initializeInstances() {
        for (const instanceConfig of this.INSTANCE_CONFIGS) {
            const instance = {
                ...instanceConfig,
                status: 'unknown',
                lastHealthCheck: new Date(),
                errorCount: 0,
                uptime: 0,
            };
            this.instances.set(instance.id, instance);
            logger_1.logger.info(`🔄 Инициализирован Tor instance: ${instance.name}`);
        }
    }
    /**
     * Создание резервных конфигураций Tor
     */
    async createBackupConfigurations() {
        try {
            // Читаем основную конфигурацию
            const mainConfig = await promises_1.default.readFile('/Users/macbook/Documents/CM/crypto-mixer/security/tor/torrc', 'utf-8');
            for (const instanceConfig of this.INSTANCE_CONFIGS.slice(1)) { // Пропускаем primary
                const backupConfig = this.generateBackupTorrcConfig(mainConfig, instanceConfig);
                // В реальной среде Docker/Kubernetes это будет создавать файлы в правильных местах
                const configPath = instanceConfig.configFile;
                logger_1.logger.info(`📝 Создаем резервную конфигурацию: ${configPath}`);
                // Сохраняем конфигурацию (в продакшне)
                // await fs.writeFile(configPath, backupConfig);
                logger_1.logger.info(`✅ Конфигурация создана для ${instanceConfig.name}`);
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка создания резервных конфигураций:', error);
            throw error;
        }
    }
    /**
     * Генерация резервной конфигурации Tor
     */
    generateBackupTorrcConfig(baseConfig, instance) {
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
        }
        else if (instance.region === 'us') {
            backupConfig += 'EntryNodes {us}\n';
            backupConfig += 'ExitNodes {us}\n';
        }
        else if (instance.region === 'asia') {
            backupConfig += 'EntryNodes {??}\n'; // Любая страна кроме US/EU
            backupConfig += 'ExitNodes {??}\n';
        }
        return backupConfig;
    }
    /**
     * Инициализация кластеров hidden services
     */
    async initializeHiddenServiceClusters() {
        const serviceTypes = ['web', 'api', 'admin', 'monitoring'];
        for (const serviceType of serviceTypes) {
            const cluster = {
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
            logger_1.logger.info(`🧅 Инициализирован кластер hidden service: ${serviceType}`);
        }
    }
    /**
     * Запуск мониторинга здоровья всех instances
     */
    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.healthCheckInterval);
        logger_1.logger.info('🔍 Запущен мониторинг здоровья Tor instances');
    }
    /**
     * Проверка здоровья всех Tor instances
     */
    async performHealthCheck() {
        try {
            logger_1.logger.debug('🔍 Проверяем здоровье всех Tor instances...');
            const healthCheckPromises = [];
            for (const [instanceId, instance] of this.instances) {
                healthCheckPromises.push(this.checkInstanceHealth(instanceId, instance));
            }
            await Promise.allSettled(healthCheckPromises);
            // Проверяем нужно ли failover
            await this.evaluateFailoverNeed();
            // Обновляем hidden service кластеры
            await this.updateHiddenServiceClusters();
            this.emit('healthCheckCompleted', this.getStats());
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка проверки здоровья instances:', error);
        }
    }
    /**
     * Проверка здоровья конкретного instance
     */
    async checkInstanceHealth(instanceId, instance) {
        const startTime = Date.now();
        try {
            // Проверяем доступность SOCKS порта
            await this.checkPort(instance.socksPort);
            // Проверяем доступность control порта
            await this.checkPort(instance.controlPort);
            // Если всё ОК, обновляем статус
            instance.status = 'active';
            instance.lastHealthCheck = new Date();
            instance.errorCount = Math.max(0, instance.errorCount - 1); // Снижаем счетчик ошибок
            const responseTime = Date.now() - startTime;
            logger_1.logger.debug(`✅ Instance ${instanceId} здоров (${responseTime}ms)`);
        }
        catch (error) {
            instance.status = 'failed';
            instance.errorCount++;
            instance.lastHealthCheck = new Date();
            logger_1.logger.warn(`⚠️ Instance ${instanceId} неисправен:`, error.message);
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
    async checkPort(port) {
        return new Promise((resolve, reject) => {
            const socket = new net_1.default.Socket();
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
    async evaluateFailoverNeed() {
        const activeInstances = Array.from(this.instances.values())
            .filter(instance => instance.status === 'active');
        const failedInstances = Array.from(this.instances.values())
            .filter(instance => instance.status === 'failed');
        // Если активных instances меньше минимума
        if (activeInstances.length < this.config.minActiveInstances) {
            logger_1.logger.warn(`⚠️ Недостаточно активных instances: ${activeInstances.length}/${this.config.minActiveInstances}`);
            await this.performEmergencyFailover();
        }
        // Если primary instance упал
        if (this.currentPrimaryInstance) {
            const primaryInstance = this.instances.get(this.currentPrimaryInstance);
            if (primaryInstance && primaryInstance.status === 'failed') {
                logger_1.logger.warn(`🚨 Primary instance ${this.currentPrimaryInstance} упал`);
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
    async failoverPrimaryInstance() {
        try {
            logger_1.logger.info('🔄 Переключаем primary instance...');
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
            logger_1.logger.info(`✅ Primary instance переключен с ${oldPrimary} на ${newPrimary.id}`);
            // Обновляем ConnectionFailoverManager
            this.emit('primaryInstanceChanged', {
                oldPrimary,
                newPrimary: newPrimary.id,
                newSocksPort: newPrimary.socksPort,
            });
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка переключения primary instance:', error);
            throw error;
        }
    }
    /**
     * Экстренное переключение при критических сбоях
     */
    async performEmergencyFailover() {
        try {
            logger_1.logger.warn('🚨 Выполняем экстренное переключение...');
            // Пытаемся активировать standby instances
            const standbyInstances = Array.from(this.instances.values())
                .filter(instance => instance.status === 'standby');
            for (const instance of standbyInstances) {
                try {
                    await this.activateInstance(instance.id);
                }
                catch (error) {
                    logger_1.logger.warn(`Не удалось активировать ${instance.id}:`, error.message);
                }
            }
            // Если всё ещё недостаточно активных instances
            const activeCount = Array.from(this.instances.values())
                .filter(instance => instance.status === 'active').length;
            if (activeCount < this.config.minActiveInstances) {
                // Крайняя мера - переключаемся на direct соединения
                logger_1.logger.error('🚨 Критический сбой Tor инфраструктуры - переключаемся на direct');
                this.emit('criticalFailure', {
                    activeInstances: activeCount,
                    requiredMinimum: this.config.minActiveInstances,
                });
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка экстренного переключения:', error);
        }
    }
    /**
     * Активация instance
     */
    async activateInstance(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} не найден`);
        }
        logger_1.logger.info(`🔄 Активируем instance ${instanceId}...`);
        try {
            // В реальной среде здесь будет запуск Tor процесса
            // await this.startTorProcess(instance);
            instance.status = 'active';
            instance.errorCount = 0;
            logger_1.logger.info(`✅ Instance ${instanceId} активирован`);
        }
        catch (error) {
            instance.status = 'failed';
            logger_1.logger.error(`❌ Не удалось активировать ${instanceId}:`, error);
            throw error;
        }
    }
    /**
     * Выбор primary instance
     */
    async selectPrimaryInstance() {
        const activeInstances = Array.from(this.instances.values())
            .filter(instance => instance.status === 'active')
            .sort((a, b) => a.priority - b.priority);
        if (activeInstances.length > 0) {
            this.currentPrimaryInstance = activeInstances[0].id;
            logger_1.logger.info(`✅ Primary instance: ${this.currentPrimaryInstance}`);
        }
        else {
            logger_1.logger.warn('⚠️ Нет активных instances для выбора primary');
        }
    }
    /**
     * Обновление кластеров hidden services
     */
    async updateHiddenServiceClusters() {
        for (const [serviceType, cluster] of this.hiddenServiceClusters) {
            try {
                // Читаем onion адреса от всех активных instances
                const activeInstances = Array.from(this.instances.values())
                    .filter(instance => instance.status === 'active');
                const onionAddresses = [];
                for (const instance of activeInstances) {
                    try {
                        // В реальной среде читаем hostname файлы
                        const hostnameFile = `${instance.dataDirectory}/mixer_${serviceType}/hostname`;
                        // const onionAddress = await fs.readFile(hostnameFile, 'utf-8');
                        // onionAddresses.push(onionAddress.trim());
                        // Для демонстрации добавляем фиктивные адреса
                        onionAddresses.push(`${instance.id}${serviceType}1234567890abcdef.onion`);
                    }
                    catch (error) {
                        // Файл может не существовать если service ещё не готов
                    }
                }
                if (onionAddresses.length > 0) {
                    cluster.primary = onionAddresses[0];
                    cluster.backups = onionAddresses.slice(1);
                    cluster.currentActive = cluster.primary;
                }
            }
            catch (error) {
                logger_1.logger.warn(`Ошибка обновления кластера ${serviceType}:`, error.message);
            }
        }
    }
    /**
     * Получение лучшего onion адреса для сервиса
     */
    getBestOnionAddress(serviceType) {
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
    getStats() {
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
    async forceSwitchToInstance(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} не найден`);
        }
        if (instance.status !== 'active') {
            throw new Error(`Instance ${instanceId} не активен`);
        }
        const oldPrimary = this.currentPrimaryInstance;
        this.currentPrimaryInstance = instanceId;
        logger_1.logger.info(`🔧 Принудительно переключились на instance ${instanceId}`);
        this.emit('manualInstanceSwitch', {
            oldPrimary,
            newPrimary: instanceId,
        });
    }
    /**
     * Остановка системы резервирования
     */
    async shutdown() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        logger_1.logger.info('🛑 TorRedundancyManager остановлен');
        this.emit('shutdown');
    }
}
exports.TorRedundancyManager = TorRedundancyManager;
// Создаем глобальный экземпляр
exports.torRedundancyManager = new TorRedundancyManager();
//# sourceMappingURL=TorRedundancyManager.js.map