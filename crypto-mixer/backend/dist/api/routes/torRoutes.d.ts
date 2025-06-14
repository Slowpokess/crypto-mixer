/**
 * API маршруты для управления и мониторинга Tor
 *
 * РУССКИЙ КОММЕНТАРИЙ: Полный API для Tor функциональности:
 * - Получение статуса всех Tor сервисов
 * - Принудительная ротация цепочек
 * - Переключение типов соединений
 * - Детальная статистика производительности
 * - Управление failover стратегиями
 */
declare const router: import("express-serve-static-core").Router;
export default router;
