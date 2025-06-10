import { EventEmitter } from 'events';
import '../types/axios-metadata';
/**
 * Tor Blockchain Client для анонимных запросов к блокчейн сетям
 *
 * РУССКИЙ КОММЕНТАРИЙ: Специализированный клиент для работы с блокчейнами через Tor:
 * - Изолированные соединения для каждой криптовалюты
 * - Автоматическое переключение между узлами при ошибках
 * - Ротация IP адресов для предотвращения корреляции
 * - Поддержка всех основных криптовалют
 * - Резервные схемы подключения
 */
export interface BlockchainEndpoint {
    url: string;
    type: 'rpc' | 'rest' | 'websocket';
    priority: number;
    isOnion: boolean;
    lastUsed?: Date;
    errorCount: number;
    responseTime: number;
}
export interface CryptocurrencyConfig {
    symbol: string;
    name: string;
    endpoints: BlockchainEndpoint[];
    socksPort: number;
    timeout: number;
    maxRetries: number;
    circuitRotationInterval: number;
}
export declare class TorBlockchainClient extends EventEmitter {
    private currencies;
    private axiosInstances;
    private rotationTimers;
    private endpointStats;
    private isInitialized;
    constructor();
    /**
     * Инициализация конфигураций для всех поддерживаемых криптовалют
     */
    private initializeCurrencyConfigs;
    /**
     * Инициализация всех Tor соединений
     */
    initialize(): Promise<void>;
    /**
     * Создание axios instance для конкретной валюты
     */
    private createAxiosInstanceForCurrency;
    /**
     * Настройка interceptors для мониторинга конкретной валюты
     */
    private setupCurrencyInterceptors;
    /**
     * Запуск автоматической ротации цепочек для валюты
     */
    private startCircuitRotationForCurrency;
    /**
     * Ротация цепочки для конкретной валюты
     */
    private rotateCircuitForCurrency;
    /**
     * Обновление статистики endpoint'а
     */
    private updateEndpointStats;
    /**
     * Проверка критических ошибок
     */
    private isCriticalError;
    /**
     * Генерация User-Agent специфичного для валюты
     */
    private generateCurrencySpecificUserAgent;
    /**
     * Получение лучшего endpoint'а для валюты
     */
    getBestEndpoint(symbol: string, type?: 'rpc' | 'rest' | 'websocket'): BlockchainEndpoint | null;
    /**
     * Выполнение запроса для конкретной валюты
     */
    makeRequest(symbol: string, endpoint: string, data?: any, options?: any): Promise<any>;
    /**
     * Получение статистики по всем валютам
     */
    getStats(): Record<string, any>;
    /**
     * Проверка здоровья всех соединений
     */
    healthCheck(): Promise<Record<string, any>>;
    /**
     * Остановка всех соединений
     */
    shutdown(): Promise<void>;
}
export declare const torBlockchainClient: TorBlockchainClient;
