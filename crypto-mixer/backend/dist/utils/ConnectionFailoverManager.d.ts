import { EventEmitter } from 'events';
import { AxiosInstance } from 'axios';
/**
 * Менеджер автоматического переключения между Tor и обычными соединениями
 *
 * РУССКИЙ КОММЕНТАРИЙ: Умная система переключения соединений:
 * - Автоматическое переключение при сбоях Tor
 * - Приоритет Tor соединений для анонимности
 * - Резервные схемы для каждого типа запросов
 * - Адаптивное управление нагрузкой
 * - Восстановление Tor при возобновлении работы
 * - Детальная аналитика переключений
 */
export interface ConnectionStrategy {
    primary: 'tor' | 'direct';
    fallback: 'tor' | 'direct' | 'none';
    timeout: number;
    retries: number;
    healthCheckInterval: number;
    autoRecovery: boolean;
}
export interface ConnectionAttempt {
    timestamp: Date;
    strategy: 'tor' | 'direct';
    success: boolean;
    responseTime: number;
    error?: string;
    endpoint: string;
}
export interface FailoverStats {
    totalAttempts: number;
    torAttempts: number;
    directAttempts: number;
    torSuccessRate: number;
    directSuccessRate: number;
    averageResponseTime: {
        tor: number;
        direct: number;
    };
    currentStrategy: 'tor' | 'direct';
    lastFailover: Date | null;
    failoverCount: number;
    recoveryCount: number;
}
export declare class ConnectionFailoverManager extends EventEmitter {
    private strategies;
    private attempts;
    private stats;
    private currentConnections;
    private healthCheckTimer;
    private maxAttemptsHistory;
    private readonly DEFAULT_STRATEGIES;
    constructor();
    /**
     * Инициализация стратегий соединений
     */
    private initializeStrategies;
    /**
     * Настройка обработчиков событий
     */
    private setupEventListeners;
    /**
     * Запуск периодической проверки здоровья соединений
     */
    private startHealthChecking;
    /**
     * Получение оптимального axios instance с автоматическим переключением
     */
    getAxiosInstance(requestType?: string, endpoint?: string): Promise<{
        instance: AxiosInstance;
        connectionType: 'tor' | 'direct';
    }>;
    /**
     * Создание axios instance для определенного типа соединения
     */
    private createAxiosInstance;
    /**
     * Попытка переключения на резервную схему
     */
    private attemptFailover;
    /**
     * Тестирование соединения
     */
    private testConnection;
    /**
     * Запись попытки соединения в статистику
     */
    private recordAttempt;
    /**
     * Обновление статистики
     */
    private updateStats;
    /**
     * Обработка сбоя Tor сервиса
     */
    private handleTorServiceFailure;
    /**
     * Обработка восстановления Tor сервиса
     */
    private handleTorServiceRecovery;
    /**
     * Обработка критических алертов Tor
     */
    private handleCriticalTorAlert;
    /**
     * Экстренное переключение всех соединений
     */
    private emergencyFailoverAll;
    /**
     * Обработка отключения Tor
     */
    private handleTorDisconnection;
    /**
     * Обработка переподключения Tor
     */
    private handleTorReconnection;
    /**
     * Периодическая проверка здоровья соединений
     */
    private performHealthCheck;
    /**
     * Генерация случайного User-Agent
     */
    private generateUserAgent;
    /**
     * Принудительное переключение типа соединения
     */
    forceConnectionType(requestType: string, connectionType: 'tor' | 'direct'): void;
    /**
     * Получение текущих стратегий
     */
    getCurrentConnections(): Map<string, 'tor' | 'direct'>;
    /**
     * Получение статистики
     */
    getStats(): FailoverStats;
    /**
     * Получение истории попыток
     */
    getAttemptHistory(limit?: number): ConnectionAttempt[];
    /**
     * Остановка менеджера
     */
    shutdown(): void;
}
export declare const connectionFailoverManager: ConnectionFailoverManager;
