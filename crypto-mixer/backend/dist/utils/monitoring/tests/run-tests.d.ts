#!/usr/bin/env node
/**
 * Скрипт для запуска всех тестов системы мониторинга
 *
 * Использование:
 * npx tsx run-tests.ts                    # Запуск всех тестов
 * npx tsx run-tests.ts --unit             # Только unit тесты
 * npx tsx run-tests.ts --integration      # Только интеграционные тесты
 * npx tsx run-tests.ts --coverage         # С покрытием кода
 * npx tsx run-tests.ts --watch            # В режиме наблюдения
 */
declare function main(): Promise<void>;
export { main as runTests };
