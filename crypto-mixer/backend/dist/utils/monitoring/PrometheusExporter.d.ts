import { EventEmitter } from 'events';
import PerformanceMonitor from './PerformanceMonitor';
import { HealthCheckManager } from './HealthCheckManager';
/**
 * Prometheus metric типы
 */
export type PrometheusMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';
export interface PrometheusMetric {
    name: string;
    type: PrometheusMetricType;
    help: string;
    value: number | string;
    labels?: Record<string, string>;
    timestamp?: number;
}
export interface PrometheusConfig {
    enabled: boolean;
    port: number;
    path: string;
    includeTimestamp: boolean;
    labelPrefix: string;
    namespace: string;
}
/**
 * Prometheus exporter для метрик crypto-mixer
 * Экспортирует метрики из PerformanceMonitor и HealthCheckManager в формате Prometheus
 */
export declare class PrometheusExporter extends EventEmitter {
    private config;
    private server;
    private isRunning;
    private performanceMonitor;
    private healthCheckManager;
    private customMetrics;
    constructor(config?: Partial<PrometheusConfig>);
    /**
     * Запуск Prometheus exporter
     */
    start(performanceMonitor?: PerformanceMonitor, healthCheckManager?: HealthCheckManager): Promise<void>;
    /**
     * Остановка Prometheus exporter
     */
    stop(): Promise<void>;
    /**
     * Обработка HTTP запросов к /metrics endpoint
     */
    private handleMetricsRequest;
    /**
     * Генерация текста метрик в формате Prometheus
     */
    private generateMetricsText;
    /**
     * Сбор метрик производительности
     */
    private collectPerformanceMetrics;
    /**
     * Сбор метрик health checks
     */
    private collectHealthMetrics;
    /**
     * Преобразование статуса здоровья в число
     */
    private healthStatusToNumber;
    /**
     * Форматирование метрик в формат Prometheus
     */
    private formatMetricsForPrometheus;
    /**
     * Экранирование значений labels для Prometheus
     */
    private escapeLabel;
    /**
     * Добавление кастомной метрики
     */
    addCustomMetric(name: string, type: PrometheusMetricType, help: string, value: number | string, labels?: Record<string, string>): void;
    /**
     * Удаление кастомной метрики
     */
    removeCustomMetric(name: string): void;
    /**
     * Очистка всех кастомных метрик
     */
    clearCustomMetrics(): void;
    /**
     * Получение URL для метрик
     */
    getMetricsUrl(): string;
    /**
     * Получение статуса работы exporter'а
     */
    isActive(): boolean;
    /**
     * Получение конфигурации
     */
    getConfig(): PrometheusConfig;
    /**
     * Обновление конфигурации
     */
    updateConfig(newConfig: Partial<PrometheusConfig>): void;
}
export default PrometheusExporter;
