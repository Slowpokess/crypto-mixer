"use strict";
// Базовые типы для крипто микшера
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURITY_CONSTANTS = exports.CURRENCY_CONFIGS = exports.MIXING_CONSTANTS = void 0;
// Константы
exports.MIXING_CONSTANTS = {
    MIN_PARTICIPANTS: 3,
    MAX_PARTICIPANTS: 100,
    DEFAULT_MIXING_TIME: 30 * 60 * 1000, // 30 минут
    MAX_MIXING_TIME: 24 * 60 * 60 * 1000, // 24 часа
    MIN_ANONYMITY_SET: 5,
    DEFAULT_FEE_PERCENTAGE: 0.5,
    MAX_OUTPUT_ADDRESSES: 10
};
exports.CURRENCY_CONFIGS = {
    BTC: {
        decimals: 8,
        minAmount: 0.001,
        maxAmount: 10,
        confirmations: 3,
        networkFee: 0.0001
    },
    ETH: {
        decimals: 18,
        minAmount: 0.01,
        maxAmount: 100,
        confirmations: 12,
        networkFee: 0.002
    },
    USDT: {
        decimals: 6,
        minAmount: 10,
        maxAmount: 100000,
        confirmations: 12,
        networkFee: 5
    },
    SOL: {
        decimals: 9,
        minAmount: 0.1,
        maxAmount: 1000,
        confirmations: 20,
        networkFee: 0.001
    },
    LTC: {
        decimals: 8,
        minAmount: 0.01,
        maxAmount: 100,
        confirmations: 3, // Litecoin быстрее Bitcoin (2.5 минуты блоки)
        networkFee: 0.001
    },
    DASH: {
        decimals: 8,
        minAmount: 0.01,
        maxAmount: 100,
        confirmations: 2, // DASH InstantSend обеспечивает быстрое подтверждение
        networkFee: 0.0001
    },
    ZEC: {
        decimals: 8,
        minAmount: 0.001,
        maxAmount: 50,
        confirmations: 5, // Zcash рекомендует больше подтверждений для shielded транзакций
        networkFee: 0.0001
    }
};
exports.SECURITY_CONSTANTS = {
    MAX_RISK_SCORE: 100,
    AUTO_REJECT_THRESHOLD: 95,
    MANUAL_REVIEW_THRESHOLD: 75,
    BLACKLIST_CHECK_ENABLED: true,
    KYT_ENABLED: true,
    AML_MONITORING_ENABLED: true
};
// Все типы уже экспортированы выше как interface/type
//# sourceMappingURL=index.js.map