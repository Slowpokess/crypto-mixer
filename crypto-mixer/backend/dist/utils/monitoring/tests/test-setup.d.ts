export declare const TestUtils: {
    /**
     * Ожидание выполнения асинхронных операций
     */
    waitFor(ms: number): Promise<void>;
    /**
     * Создание тестовых данных алерта
     */
    createMockAlert(overrides?: Partial<any>): any;
    /**
     * Создание тестовой конфигурации канала уведомлений
     */
    createMockNotificationChannel(type: string, overrides?: Partial<any>): any;
    /**
     * Мок для HTTP fetch запросов
     */
    mockFetchSuccess(responseData?: any): any;
    /**
     * Мок для HTTP fetch запросов с ошибкой
     */
    mockFetchError(error?: Error): any;
    /**
     * Проверка структуры объекта алерта
     */
    expectValidAlert(alert: any): void;
    /**
     * Проверка структуры результата уведомления
     */
    expectValidNotificationResult(result: any): void;
    /**
     * Создание тестовой конфигурации мониторинга
     */
    createTestMonitoringConfig(overrides?: Partial<any>): any;
};
declare global {
    var TestUtils: typeof TestUtils;
}
