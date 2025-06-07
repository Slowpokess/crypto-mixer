import { PublicKey, Keypair, Transaction, ConfirmOptions } from '@solana/web3.js';
/**
 * Интерфейсы для Solana RPC
 */
interface SolanaAccountInfo {
    executable: boolean;
    owner: string;
    lamports: number;
    data: string | Buffer;
    rentEpoch: number;
}
interface SolanaBlockProduction {
    byIdentity: {
        [validatorIdentity: string]: [number, number];
    };
    range: {
        firstSlot: number;
        lastSlot: number;
    };
}
interface SolanaClusterNode {
    pubkey: string;
    gossip: string | null;
    tpu: string | null;
    rpc: string | null;
    version: string | null;
    featureSet: number | null;
    shredVersion: number | null;
}
interface SolanaEpochInfo {
    absoluteSlot: number;
    blockHeight: number;
    epoch: number;
    slotIndex: number;
    slotsInEpoch: number;
    transactionCount: number;
}
interface SolanaInflationGovernor {
    initial: number;
    terminal: number;
    taper: number;
    foundation: number;
    foundationTerm: number;
}
interface SolanaInflationRate {
    total: number;
    validator: number;
    foundation: number;
    epoch: number;
}
interface SolanaPerformanceSample {
    slot: number;
    numTransactions: number;
    numSlots: number;
    samplePeriodSecs: number;
}
interface SolanaSupply {
    total: number;
    circulating: number;
    nonCirculating: number;
    nonCirculatingAccounts: string[];
}
interface SolanaTransactionResponse {
    slot: number;
    transaction: {
        message: {
            accountKeys: string[];
            header: {
                numReadonlySignedAccounts: number;
                numReadonlyUnsignedAccounts: number;
                numRequiredSignatures: number;
            };
            instructions: {
                accounts: number[];
                data: string;
                programIdIndex: number;
            }[];
            recentBlockhash: string;
        };
        signatures: string[];
    };
    meta: {
        err: any;
        fee: number;
        innerInstructions: any[];
        logMessages: string[];
        postBalances: number[];
        postTokenBalances: any[];
        preBalances: number[];
        preTokenBalances: any[];
        rewards: any[];
        status: {
            Ok: null;
        } | {
            Err: any;
        };
    };
    blockTime: number | null;
}
interface SolanaVersionInfo {
    'solana-core': string;
    'feature-set': number;
}
interface SolanaVoteAccounts {
    current: {
        votePubkey: string;
        nodePubkey: string;
        activatedStake: number;
        epochVoteAccount: boolean;
        epochCredits: [number, number, number][];
        commission: number;
        lastVote: number;
        rootSlot: number;
    }[];
    delinquent: {
        votePubkey: string;
        nodePubkey: string;
        activatedStake: number;
        epochVoteAccount: boolean;
        epochCredits: [number, number, number][];
        commission: number;
        lastVote: number;
        rootSlot: number;
    }[];
}
/**
 * Конфигурация для Solana RPC клиента
 */
export interface SolanaRpcConfig {
    rpcUrl?: string;
    wsUrl?: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    confirmTransactionInitialTimeout?: number;
}
/**
 * Продакшн-готовый клиент для Solana RPC
 * Полная интеграция с Solana через @solana/web3.js и прямые RPC вызовы
 */
export declare class SolanaRpcClient {
    private config;
    private connection;
    private httpClient;
    private _isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    constructor(config: SolanaRpcConfig);
    /**
     * Настройка HTTP клиента для прямых RPC вызовов
     */
    private setupHttpClient;
    /**
     * Выполнение прямого RPC вызова к Solana
     */
    private rpcCall;
    /**
     * Задержка для повторных попыток
     */
    private delay;
    /**
     * Запуск периодической проверки здоровья
     */
    private startHealthCheck;
    /**
     * Остановка проверки здоровья
     */
    stopHealthCheck(): void;
    /**
     * Получение текущего слота
     */
    getSlot(): Promise<number>;
    /**
     * Получение высоты блока
     */
    getBlockHeight(): Promise<number>;
    /**
     * Получение баланса аккаунта в лампортах
     */
    getBalance(publicKey: PublicKey | string): Promise<number>;
    /**
     * Получение баланса в SOL
     */
    getBalanceInSol(publicKey: PublicKey | string): Promise<number>;
    /**
     * Получение информации об аккаунте
     */
    getAccountInfo(publicKey: PublicKey | string): Promise<SolanaAccountInfo | null>;
    /**
     * Создание нового keypair
     */
    generateKeypair(): {
        publicKey: string;
        secretKey: number[];
    };
    /**
     * Восстановление keypair из секретного ключа
     */
    keypairFromSecretKey(secretKey: number[] | Uint8Array): Keypair;
    /**
     * Отправка SOL с одного аккаунта на другой
     */
    transferSol(fromKeypair: Keypair, toPublicKey: PublicKey | string, lamports: number): Promise<string>;
    /**
     * Получение последнего blockhash
     */
    getLatestBlockhash(): Promise<{
        blockhash: string;
        lastValidBlockHeight: number;
    }>;
    /**
     * Отправка и подтверждение транзакции
     */
    sendAndConfirmTransaction(transaction: Transaction, signers: Keypair[], options?: ConfirmOptions): Promise<string>;
    /**
     * Получение транзакции по подписи
     */
    getTransaction(signature: string): Promise<SolanaTransactionResponse | null>;
    /**
     * Ожидание подтверждения транзакции
     */
    confirmTransaction(signature: string, commitment?: 'processed' | 'confirmed' | 'finalized'): Promise<boolean>;
    /**
     * Получение информации об эпохе
     */
    getEpochInfo(): Promise<SolanaEpochInfo>;
    /**
     * Получение информации о версии
     */
    getVersion(): Promise<SolanaVersionInfo>;
    /**
     * Получение информации об инфляции
     */
    getInflationGovernor(): Promise<SolanaInflationGovernor>;
    /**
     * Получение курса инфляции
     */
    getInflationRate(): Promise<SolanaInflationRate>;
    /**
     * Получение общего предложения
     */
    getSupply(): Promise<SolanaSupply>;
    /**
     * Получение узлов кластера
     */
    getClusterNodes(): Promise<SolanaClusterNode[]>;
    /**
     * Получение аккаунтов для голосования
     */
    getVoteAccounts(): Promise<SolanaVoteAccounts>;
    /**
     * Получение производительности
     */
    getRecentPerformanceSamples(limit?: number): Promise<SolanaPerformanceSample[]>;
    /**
     * Получение производства блоков
     */
    getBlockProduction(): Promise<SolanaBlockProduction>;
    /**
     * Получение минимального баланса для освобождения от арендной платы
     */
    getMinimumBalanceForRentExemption(dataLength: number): Promise<number>;
    /**
     * Проверка соединения с нодой
     */
    isConnected(): Promise<boolean>;
    /**
     * Получение статуса соединения
     */
    getConnectionStatus(): boolean;
    /**
     * Получение времени последней проверки здоровья
     */
    getLastHealthCheck(): Date | null;
    /**
     * Закрытие соединений
     */
    disconnect(): Promise<void>;
    /**
     * Получение статистики производительности
     */
    getPerformanceStats(): Promise<{
        isConnected: boolean;
        lastHealthCheck: Date | null;
        currentSlot: number;
        blockHeight: number;
        epochInfo: SolanaEpochInfo;
        clusterNodes: number;
        recentPerformance: SolanaPerformanceSample[];
    }>;
    /**
     * Получение статуса здоровья ноды
     */
    getHealth(): Promise<'ok' | string>;
    /**
     * Конвертация SOL в лампорты
     */
    solToLamports(sol: number): number;
    /**
     * Конвертация лампортов в SOL
     */
    lamportsToSol(lamports: number): number;
    /**
     * Валидация публичного ключа
     */
    isValidPublicKey(publicKey: string): boolean;
}
export {};
