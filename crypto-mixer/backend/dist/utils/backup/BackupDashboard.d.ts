import { BackupMonitoring } from './BackupMonitoring';
import { BackupManager } from './BackupManager';
import { DisasterRecoveryManager } from './DisasterRecoveryManager';
/**
 * Web Dashboard для мониторинга backup процессов
 * Предоставляет real-time интерфейс для просмотра статуса backup и алертов
 */
export declare class BackupDashboard {
    private app;
    private server;
    private monitoring;
    private backupManager;
    private drManager;
    private port;
    private isRunning;
    constructor(monitoring: BackupMonitoring, backupManager: BackupManager, drManager: DisasterRecoveryManager, port?: number);
    /**
     * Настройка middleware
     */
    private setupMiddleware;
    /**
     * Настройка роутов
     */
    private setupRoutes;
    /**
     * Запуск dashboard сервера
     */
    start(): Promise<void>;
    /**
     * Остановка dashboard сервера
     */
    stop(): Promise<void>;
    /**
     * Получение статуса dashboard
     */
    getStatus(): {
        isRunning: boolean;
        port: number;
        url?: string;
    };
    /**
     * Генерация HTML для dashboard
     */
    private generateDashboardHTML;
    /**
     * Конвертация метрик в CSV формат
     */
    private convertMetricsToCSV;
}
