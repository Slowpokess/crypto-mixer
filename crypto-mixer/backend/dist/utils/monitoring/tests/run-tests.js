#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = main;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
// Цвета для консольного вывода
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}
function logHeader(message) {
    const border = '='.repeat(60);
    log(`\n${border}`, 'cyan');
    log(`  ${message}`, 'cyan');
    log(`${border}\n`, 'cyan');
}
function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}
function logError(message) {
    log(`❌ ${message}`, 'red');
}
function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}
function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}
// Парсинг аргументов командной строки
const args = process.argv.slice(2);
const isUnitOnly = args.includes('--unit');
const isIntegrationOnly = args.includes('--integration');
const withCoverage = args.includes('--coverage');
const watchMode = args.includes('--watch');
const verbose = args.includes('--verbose') || args.includes('-v');
// Пути к файлам тестов
const testDir = (0, path_1.resolve)(__dirname);
const unitTests = [
    'PerformanceMonitor.test.ts',
    'AlertManager.test.ts',
    'NotificationManager.test.ts'
];
const integrationTests = [
    'MonitoringSystem.integration.test.ts'
];
function checkDependencies() {
    logInfo('Проверка зависимостей...');
    const requiredPackages = ['vitest', 'node-fetch', 'nodemailer'];
    const missingPackages = [];
    for (const pkg of requiredPackages) {
        try {
            require.resolve(pkg);
        }
        catch {
            missingPackages.push(pkg);
        }
    }
    if (missingPackages.length > 0) {
        logError(`Отсутствуют необходимые пакеты: ${missingPackages.join(', ')}`);
        logInfo('Установите их командой: npm install ' + missingPackages.join(' '));
        process.exit(1);
    }
    logSuccess('Все зависимости найдены');
}
function checkTestFiles() {
    logInfo('Проверка файлов тестов...');
    const allTests = [...unitTests, ...integrationTests];
    const missingFiles = [];
    for (const testFile of allTests) {
        const fullPath = (0, path_1.resolve)(testDir, testFile);
        if (!(0, fs_1.existsSync)(fullPath)) {
            missingFiles.push(testFile);
        }
    }
    if (missingFiles.length > 0) {
        logError(`Отсутствуют файлы тестов: ${missingFiles.join(', ')}`);
        process.exit(1);
    }
    logSuccess(`Найдено ${allTests.length} файлов тестов`);
}
function runTests(testFiles, testType) {
    logHeader(`Запуск ${testType} тестов`);
    const vitestCommand = [
        'npx vitest run',
        withCoverage ? '--coverage' : '',
        watchMode ? '--watch' : '',
        verbose ? '--reporter=verbose' : '--reporter=default',
        `--config ${(0, path_1.resolve)(testDir, 'vitest.config.ts')}`,
        testFiles.map(f => (0, path_1.resolve)(testDir, f)).join(' ')
    ].filter(Boolean).join(' ');
    try {
        logInfo(`Выполняется команда: ${vitestCommand}`);
        (0, child_process_1.execSync)(vitestCommand, {
            stdio: 'inherit',
            cwd: testDir,
            env: {
                ...process.env,
                NODE_ENV: 'test'
            }
        });
        logSuccess(`${testType} тесты выполнены успешно`);
        return true;
    }
    catch (error) {
        logError(`${testType} тесты завершились с ошибками`);
        if (verbose) {
            console.error(error);
        }
        return false;
    }
}
function runLinting() {
    logHeader('Проверка качества кода');
    // Проверяем наличие ESLint
    try {
        const eslintCommand = `npx eslint ${testDir}/../**/*.ts --max-warnings 0`;
        logInfo('Запуск ESLint...');
        (0, child_process_1.execSync)(eslintCommand, { stdio: 'inherit' });
        logSuccess('ESLint проверка пройдена');
        return true;
    }
    catch (error) {
        logWarning('ESLint не настроен или найдены проблемы');
        return false;
    }
}
function generateTestReport() {
    logHeader('Генерация отчета о тестировании');
    const reportData = {
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        configuration: {
            unitOnly: isUnitOnly,
            integrationOnly: isIntegrationOnly,
            withCoverage: withCoverage,
            watchMode: watchMode
        },
        testFiles: {
            unit: unitTests,
            integration: integrationTests
        }
    };
    try {
        const fs = require('fs');
        const reportPath = (0, path_1.resolve)(testDir, 'test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        logSuccess(`Отчет сохранен в ${reportPath}`);
    }
    catch (error) {
        logWarning('Не удалось сохранить отчет');
    }
}
function printSummary(results) {
    logHeader('Сводка результатов');
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(Boolean).length;
    const failedTests = totalTests - passedTests;
    if (results.unit !== undefined) {
        log(`Unit тесты: ${results.unit ? '✅ ПРОЙДЕНЫ' : '❌ ПРОВАЛЕНЫ'}`);
    }
    if (results.integration !== undefined) {
        log(`Интеграционные тесты: ${results.integration ? '✅ ПРОЙДЕНЫ' : '❌ ПРОВАЛЕНЫ'}`);
    }
    if (results.linting !== undefined) {
        log(`Проверка кода: ${results.linting ? '✅ ПРОЙДЕНА' : '⚠️  С ЗАМЕЧАНИЯМИ'}`);
    }
    log(`\nОбщий результат: ${passedTests}/${totalTests} успешно`, failedTests === 0 ? 'green' : 'red');
    if (withCoverage) {
        logInfo('Отчет о покрытии кода доступен в папке coverage/');
    }
}
async function main() {
    logHeader('🧪 Тестирование системы мониторинга Crypto Mixer');
    logInfo('Конфигурация запуска:');
    if (isUnitOnly)
        log('  - Только unit тесты');
    if (isIntegrationOnly)
        log('  - Только интеграционные тесты');
    if (withCoverage)
        log('  - С анализом покрытия кода');
    if (watchMode)
        log('  - В режиме наблюдения');
    if (verbose)
        log('  - Подробный вывод');
    // Предварительные проверки
    checkDependencies();
    checkTestFiles();
    const results = {};
    try {
        // Проверка качества кода
        if (!watchMode) {
            results.linting = runLinting();
        }
        // Запуск unit тестов
        if (!isIntegrationOnly) {
            results.unit = runTests(unitTests, 'Unit');
        }
        // Запуск интеграционных тестов
        if (!isUnitOnly) {
            results.integration = runTests(integrationTests, 'Интеграционные');
        }
        // Генерация отчета
        if (!watchMode) {
            generateTestReport();
        }
        // Вывод сводки
        printSummary(results);
        // Определение кода выхода
        const hasFailures = Object.values(results).some(result => result === false);
        process.exit(hasFailures ? 1 : 0);
    }
    catch (error) {
        logError('Критическая ошибка при выполнении тестов');
        console.error(error);
        process.exit(1);
    }
}
// Обработка сигналов для graceful shutdown
process.on('SIGINT', () => {
    log('\n⏹️  Прерывание тестирования по запросу пользователя', 'yellow');
    process.exit(0);
});
process.on('SIGTERM', () => {
    log('\n⏹️  Прерывание тестирования по сигналу TERM', 'yellow');
    process.exit(0);
});
// Запуск основной функции
if (require.main === module) {
    main().catch(error => {
        logError('Неожиданная ошибка');
        console.error(error);
        process.exit(1);
    });
}
//# sourceMappingURL=run-tests.js.map