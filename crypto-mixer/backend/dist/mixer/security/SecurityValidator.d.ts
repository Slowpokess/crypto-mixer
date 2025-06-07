import { EventEmitter } from 'events';
interface Database {
    query: (queryString: string, params?: any[]) => Promise<any>;
}
interface Logger {
    info: (message: string, data?: any) => void;
    error: (message: string, error?: any, data?: any) => void;
}
interface BlockchainManager {
}
interface RiskAnalyzer {
}
interface SecurityConfig {
    maxTransactionLimits: Record<string, number>;
    minTransactionLimits: Record<string, number>;
    dailyTransactionLimits: Record<string, number>;
    analysisWindows: {
        short: number;
        medium: number;
        long: number;
    };
    suspiciousThresholds: {
        velocityMultiplier: number;
        amountDeviation: number;
        frequencyThreshold: number;
        roundAmountPercentage: number;
    };
    addressValidation: {
        enableBlacklist: boolean;
        enableWhitelist: boolean;
        checkSanctions: boolean;
        checkExchanges: boolean;
    };
    kytSettings: {
        enabled: boolean;
        riskScoreThreshold: number;
        requireManualReview: number;
        autoRejectThreshold: number;
    };
    [key: string]: any;
}
interface Dependencies {
    database?: Database;
    logger?: Logger;
    blockchainManager?: BlockchainManager;
    riskAnalyzer?: RiskAnalyzer;
    config?: Partial<SecurityConfig>;
}
interface MixRequest {
    id: string;
    currency: string;
    amount: number;
    inputAddresses?: string[];
    inputAddress?: string;
    outputAddresses: Array<{
        address: string;
        amount?: number;
    }>;
    userId?: string;
}
interface ValidationResult {
    isValid: boolean;
    riskScore: number;
    warnings: string[];
    errors: string[];
    recommendations: string[];
    metadata: {
        validatedAt: Date;
        validatorVersion: string;
        checks: string[];
    };
}
interface MixingTransaction {
    id: string;
    hash?: string;
    inputs?: Array<{
        address?: string;
        amount: number;
    }>;
    outputs?: Array<{
        address: string;
        amount: number;
    }>;
    signatures?: Array<{
        signature: string;
        publicKey: string;
    }>;
    fee?: number;
}
interface TransactionValidationResult {
    isValid: boolean;
    riskScore: number;
    warnings: string[];
    errors: string[];
    checks: {
        balanceCheck: boolean;
        signatureCheck: boolean;
        duplicateCheck: boolean;
        amountCheck: boolean;
        addressCheck: boolean;
    };
}
interface AddressSecurityInfo {
    address: string;
    currency: string;
    isBlacklisted: boolean;
    isWhitelisted: boolean;
    riskLevel: string;
    riskScore: number;
    flags: string[];
    sources: string[];
    lastChecked: Date;
}
interface UserBehaviorAnalysis {
    userId: string;
    timeWindow: string;
    patterns: {
        velocityPattern: string;
        amountPattern: string;
        timingPattern: string;
        addressPattern: string;
    };
    riskScore: number;
    flags: string[];
    recommendations: string[];
}
interface SecurityMetrics {
    totalValidations: number;
    rejectedTransactions: number;
    suspiciousActivities: number;
    falsePositives: number;
    averageRiskScore: number;
    lastUpdate: Date;
}
interface SecurityStatus {
    isInitialized: boolean;
    blacklistedAddresses: number;
    checkedTransactions: number;
    blockedTransactions: number;
}
interface HealthCheck {
    status: string;
    timestamp: Date;
    checks: {
        initialization: {
            status: string;
            message: string;
        };
        blacklist: {
            status: string;
            message: string;
        };
        validation: {
            status: string;
            message: string;
        };
        kyt: {
            status: string;
            message: string;
        };
    };
    details: {
        blacklistedAddresses: number;
        whitelistedAddresses: number;
        kytEnabled: boolean;
        sanctionsCheckEnabled: boolean;
        metrics: SecurityMetrics;
    };
    error?: string;
}
/**
 * Система безопасности и валидации транзакций для микширования
 * Обеспечивает проверку всех аспектов безопасности миксера
 */
declare class SecurityValidator extends EventEmitter {
    private database?;
    private logger?;
    private blockchainManager?;
    private riskAnalyzer?;
    private config;
    private blacklistedAddresses;
    private whitelistedAddresses;
    private suspiciousPatterns;
    private userRiskProfiles;
    private securityMetrics;
    private state;
    private isInitialized;
    constructor(dependencies?: Dependencies);
    /**
     * Валидирует запрос на микширование
     */
    validateMixRequest(mixRequest: MixRequest): Promise<ValidationResult>;
    /**
     * Валидирует транзакцию микширования
     */
    validateMixingTransaction(transaction: MixingTransaction): Promise<TransactionValidationResult>;
    /**
     * Проверяет адрес на предмет безопасности
     */
    checkAddressSecurity(address: string, currency: string): Promise<AddressSecurityInfo>;
    /**
     * Анализирует паттерны пользователя на предмет подозрительной активности
     */
    analyzeUserBehaviorPatterns(userId: string, timeWindow?: string): Promise<UserBehaviorAnalysis>;
    /**
     * Получает текущий статус системы безопасности
     */
    getStatus(): SecurityStatus;
    /**
     * Выполняет проверку состояния системы безопасности
     */
    healthCheck(): Promise<HealthCheck>;
    /**
     * Получает метрики безопасности
     */
    getSecurityMetrics(): any;
    /**
     * Обновляет blacklist адресов
     */
    updateBlacklist(addresses: string[]): Promise<void>;
    /**
     * Инициализирует систему безопасности
     */
    initialize(): Promise<void>;
    private _validateBasicParameters;
    private _validateTransactionLimits;
    private _validateAddresses;
    private _analyzeUserPatterns;
    private _performKYTAnalysis;
    private _analyzeAMLRisks;
    private _checkSanctionsCompliance;
    private _calculateFinalRiskScore;
    private _updateSecurityMetrics;
    private _saveValidationResult;
    private _validateTransactionBalance;
    private _validateTransactionSignatures;
    private _checkTransactionDuplicate;
    private _validateTransactionAmounts;
    private _validateTransactionAddresses;
    private _isAddressBlacklisted;
    private _isAddressWhitelisted;
    private _checkAddressSanctions;
    private _checkExchangeAddress;
    private _analyzeAddressHistory;
    private _getUserActivity;
    private _analyzeTransactionVelocity;
    private _analyzeAmountPatterns;
    private _analyzeTimingPatterns;
    private _analyzeAddressPatterns;
    private _getUserDailyVolume;
    private _calculateKYTScore;
    private _isRoundAmount;
    private _checkStructuring;
    private _loadAddressLists;
    private _loadSuspiciousPatterns;
    private _initializeExternalServices;
    private _saveBlacklistToDB;
}
export { SecurityValidator };
