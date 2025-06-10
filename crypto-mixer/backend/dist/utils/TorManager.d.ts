import { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
/**
 * Расширенный менеджер Tor для CryptoMixer
 *
 * РУССКИЙ КОММЕНТАРИЙ: Полная реализация Tor интеграции с:
 * - Автоматическим переключением между Tor и обычными соединениями
 * - Множественными SOCKS портами для изоляции трафика
 * - Мониторингом состояния Tor
 * - Ротацией цепочек для максимальной анонимности
 * - Интеграцией со всеми blockchain клиентами
 */
export interface TorConfig {
    socksPort: number;
    controlPort: number;
    controlPassword: string;
    enabled: boolean;
    circuitTimeout: number;
    maxRetries: number;
    retryDelay: number;
    isolationLevel: 'none' | 'destination' | 'full';
}
export interface TorConnectionInfo {
    isConnected: boolean;
    circuitCount: number;
    bandwidth: {
        read: number;
        written: number;
    };
    lastCircuitRotation: Date;
    onionAddress?: string;
    errors: string[];
}
export declare class TorManager extends EventEmitter {
    private config;
    private socksAgent;
    private httpsAgent;
    private axiosInstance;
    private connectionInfo;
    private isInitialized;
    private circuitRotationTimer;
    private healthCheckTimer;
    private stats;
    private readonly CONNECTION_CONFIGS;
    constructor(config?: Partial<TorConfig>);
    /**
     * Инициализация Tor соединения
     */
    initialize(): Promise<void>;
    /**
     * Проверка доступности Tor
     */
    private checkTorAvailability;
    /**
     * Создание SOCKS агентов для разных типов соединений
     */
    private createSocksAgents;
    /**
     * Настройка Axios interceptors
     */
    private setupAxiosInterceptors;
    /**
     * Получение информации о hidden service
     */
    private getHiddenServiceInfo;
    /**
     * Ротация цепочек Tor
     */
    rotateCircuit(): Promise<void>;
    /**
     * Отправка команды через Tor control port
     */
    private sendControlCommand;
    /**
     * Запуск мониторинга здоровья Tor
     */
    private startHealthMonitoring;
    /**
     * Запуск автоматической ротации цепочек
     */
    private startCircuitRotation;
    /**
     * Проверка здоровья Tor соединения
     */
    private performHealthCheck;
    /**
     * Получение специализированного axios instance для определенного типа соединения
     */
    getAxiosInstance(connectionType?: 'web' | 'blockchain' | 'api'): AxiosInstance;
    /**
     * Генерация случайного User-Agent
     */
    private generateRandomUserAgent;
    /**
     * Генерация случайного Accept-Language заголовка
     */
    private generateRandomAcceptLanguage;
    /**
     * Получение статистики работы
     */
    getStats(): {
        connectionInfo: TorConnectionInfo;
        isEnabled: boolean;
        isInitialized: boolean;
        requestCount: number;
        errorCount: number;
        circuitRotations: number;
        lastError: Error | null;
    };
    /**
     * Проверка доступности через Tor
     */
    testConnection(url?: string): Promise<any>;
    /**
     * Остановка TorManager
     */
    shutdown(): Promise<void>;
}
export declare const torManager: TorManager;
