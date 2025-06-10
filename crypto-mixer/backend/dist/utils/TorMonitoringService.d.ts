import { EventEmitter } from 'events';
/**
 * Расширенная служба мониторинга Tor для CryptoMixer
 *
 * РУССКИЙ КОММЕНТАРИЙ: Полная система мониторинга всех Tor компонентов:
 * - Мониторинг состояния всех hidden services
 * - Проверка доступности через onion адреса
 * - Автоматическое переключение при сбоях
 * - Детальная аналитика производительности
 * - Уведомления о критических проблемах
 * - Автоматическое восстановление сервисов
 */
export interface TorServiceStatus {
    name: string;
    type: 'hidden_service' | 'socks_proxy' | 'control_port' | 'blockchain_client';
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    onionAddress?: string;
    port: number;
    lastCheck: Date;
    responseTime: number;
    errorCount: number;
    uptime: number;
    details: any;
}
export interface TorMonitoringStats {
    services: TorServiceStatus[];
    overallHealth: 'healthy' | 'degraded' | 'critical';
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    circuitRotations: number;
    lastCircuitRotation: Date;
    hiddenServiceUptime: number;
}
export declare class TorMonitoringService extends EventEmitter {
    private services;
    private monitoringInterval;
    private deepCheckInterval;
    private isRunning;
    private stats;
    private checkIntervalMs;
    private deepCheckIntervalMs;
    private startTime;
    private readonly ONION_SERVICES;
    private readonly SOCKS_PORTS;
    constructor();
    /**
     * Инициализация списка сервисов для мониторинга
     */
    private initializeServices;
    /**
     * Запуск мониторинга
     */
    start(): void;
    /**
     * Базовая проверка здоровья всех сервисов
     */
    private performBasicHealthCheck;
    /**
     * Глубокая проверка с тестированием соединений
     */
    private performDeepHealthCheck;
    /**
     * Проверка SOCKS порта
     */
    private checkSocksPort;
    /**
     * Проверка control порта
     */
    private checkControlPort;
    /**
     * Проверка hidden service
     */
    private checkHiddenService;
    /**
     * Проверка blockchain client
     */
    private checkBlockchainClient;
    /**
     * Тестирование соединений через onion адреса
     */
    private testOnionConnections;
    /**
     * Анализ качества цепочек
     */
    private analyzeCircuitQuality;
    /**
     * Тестирование blockchain соединений
     */
    private testBlockchainConnections;
    /**
     * Анализ производительности
     */
    private performanceAnalysis;
    /**
     * Обновление статуса сервиса
     */
    private updateServiceStatus;
    /**
     * Обновление общей статистики
     */
    private updateOverallStats;
    /**
     * Проверка условий для алертов
     */
    private checkForAlerts;
    /**
     * Получение статистики
     */
    getStats(): TorMonitoringStats;
    /**
     * Получение детальной информации о сервисе
     */
    getServiceDetails(serviceName: string): TorServiceStatus | null;
    /**
     * Принудительная ротация всех цепочек
     */
    forceCircuitRotation(): Promise<void>;
    /**
     * Остановка мониторинга
     */
    stop(): void;
}
export declare const torMonitoringService: TorMonitoringService;
