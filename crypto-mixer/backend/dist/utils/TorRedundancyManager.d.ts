import { EventEmitter } from 'events';
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
    region?: string;
}
export interface HiddenServiceCluster {
    serviceName: string;
    primary: string;
    backups: string[];
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
export declare class TorRedundancyManager extends EventEmitter {
    private instances;
    private hiddenServiceClusters;
    private config;
    private healthCheckTimer;
    private isInitialized;
    private currentPrimaryInstance;
    private readonly INSTANCE_CONFIGS;
    constructor(config?: Partial<RedundancyConfig>);
    /**
     * Инициализация системы резервирования
     */
    initialize(): Promise<void>;
    /**
     * Инициализация всех Tor instances
     */
    private initializeInstances;
    /**
     * Создание резервных конфигураций Tor
     */
    private createBackupConfigurations;
    /**
     * Генерация резервной конфигурации Tor
     */
    private generateBackupTorrcConfig;
    /**
     * Инициализация кластеров hidden services
     */
    private initializeHiddenServiceClusters;
    /**
     * Запуск мониторинга здоровья всех instances
     */
    private startHealthMonitoring;
    /**
     * Проверка здоровья всех Tor instances
     */
    private performHealthCheck;
    /**
     * Проверка здоровья конкретного instance
     */
    private checkInstanceHealth;
    /**
     * Проверка доступности порта
     */
    private checkPort;
    /**
     * Оценка необходимости failover
     */
    private evaluateFailoverNeed;
    /**
     * Переключение primary instance
     */
    private failoverPrimaryInstance;
    /**
     * Экстренное переключение при критических сбоях
     */
    private performEmergencyFailover;
    /**
     * Активация instance
     */
    private activateInstance;
    /**
     * Выбор primary instance
     */
    private selectPrimaryInstance;
    /**
     * Обновление кластеров hidden services
     */
    private updateHiddenServiceClusters;
    /**
     * Получение лучшего onion адреса для сервиса
     */
    getBestOnionAddress(serviceType: string): string | null;
    /**
     * Получение статистики системы резервирования
     */
    getStats(): {
        isEnabled: boolean;
        isInitialized: boolean;
        currentPrimaryInstance: string | null;
        instances: {
            total: number;
            active: number;
            standby: number;
            failed: number;
            details: {
                id: string;
                name: string;
                status: "unknown" | "standby" | "failed" | "active";
                region: string | undefined;
                socksPort: number;
                errorCount: number;
                lastHealthCheck: Date;
            }[];
        };
        hiddenServiceClusters: {
            serviceType: string;
            primary: string;
            backupsCount: number;
            currentActive: string;
            failoverCount: number;
            lastFailover: Date | null;
            loadBalancing: boolean;
        }[];
        config: RedundancyConfig;
    };
    /**
     * Принудительное переключение на конкретный instance
     */
    forceSwitchToInstance(instanceId: string): Promise<void>;
    /**
     * Остановка системы резервирования
     */
    shutdown(): Promise<void>;
}
export declare const torRedundancyManager: TorRedundancyManager;
