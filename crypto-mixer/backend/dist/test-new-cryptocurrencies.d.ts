/**
 * Тестирование Litecoin клиента
 */
declare function testLitecoinClient(): Promise<boolean>;
/**
 * Тестирование Dash клиента
 */
declare function testDashClient(): Promise<boolean>;
/**
 * Тестирование Zcash клиента
 */
declare function testZcashClient(): Promise<boolean>;
/**
 * Тестирование BlockchainManager с новыми валютами
 */
declare function testBlockchainManager(): Promise<boolean>;
/**
 * Тестирование валидации адресов
 */
declare function testAddressValidation(): boolean;
/**
 * Основная функция тестирования
 */
declare function runTests(): Promise<void>;
export { testLitecoinClient, testDashClient, testZcashClient, testBlockchainManager, testAddressValidation, runTests };
