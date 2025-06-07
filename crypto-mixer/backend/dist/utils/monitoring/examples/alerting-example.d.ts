/**
 * Пример использования системы алертинга и уведомлений для crypto-mixer
 *
 * Демонстрирует:
 * - Настройку системы мониторинга с алертингом
 * - Создание кастомных алертов
 * - Работу с уведомлениями
 * - Управление алертами
 */
import { MonitoringSystem } from '../index';
/**
 * Пример полной настройки системы мониторинга с алертингом
 */
declare function setupFullMonitoringSystem(): Promise<MonitoringSystem>;
/**
 * Пример создания кастомных алертов
 */
declare function demonstrateCustomAlerts(monitoringSystem: MonitoringSystem): Promise<any[]>;
/**
 * Пример управления алертами
 */
declare function demonstrateAlertManagement(monitoringSystem: MonitoringSystem): Promise<void>;
/**
 * Пример тестирования каналов уведомлений
 */
declare function testNotificationChannels(monitoringSystem: MonitoringSystem): Promise<void>;
/**
 * Симуляция различных событий для тестирования алертинга
 */
declare function simulateEvents(monitoringSystem: MonitoringSystem): Promise<void>;
export { setupFullMonitoringSystem, demonstrateCustomAlerts, demonstrateAlertManagement, testNotificationChannels, simulateEvents };
