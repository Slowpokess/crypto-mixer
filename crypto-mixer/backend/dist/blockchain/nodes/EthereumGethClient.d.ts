/**
 * Интерфейсы для Ethereum/Geth
 */
interface EthereumTransaction {
    hash: string;
    nonce: number;
    blockHash: string | null;
    blockNumber: number | null;
    transactionIndex: number | null;
    from: string;
    to: string | null;
    value: string;
    gasPrice: string;
    gas: number;
    input: string;
    r: string;
    s: string;
    v: string;
}
interface EthereumBlock {
    number: number;
    hash: string;
    parentHash: string;
    nonce: string;
    sha3Uncles: string;
    logsBloom: string;
    transactionsRoot: string;
    stateRoot: string;
    receiptsRoot: string;
    miner: string;
    difficulty: string;
    totalDifficulty: string;
    extraData: string;
    size: number;
    gasLimit: number;
    gasUsed: number;
    timestamp: number;
    transactions: string[] | EthereumTransaction[];
    uncles: string[];
}
interface TransactionReceipt {
    transactionHash: string;
    transactionIndex: number;
    blockHash: string;
    blockNumber: number;
    from: string;
    to: string | null;
    cumulativeGasUsed: number;
    gasUsed: number;
    contractAddress: string | null;
    logs: any[];
    logsBloom: string;
    status: boolean;
    effectiveGasPrice: string;
}
interface EthereumSyncStatus {
    startingBlock: number;
    currentBlock: number;
    highestBlock: number;
    pulledStates?: number;
    knownStates?: number;
}
interface PeerInfo {
    id: string;
    name: string;
    caps: string[];
    network: {
        localAddress: string;
        remoteAddress: string;
        inbound: boolean;
        trusted: boolean;
        static: boolean;
    };
    protocols: any;
}
interface NodeInfo {
    enode: string;
    enr: string;
    id: string;
    ip: string;
    listenAddr: string;
    name: string;
    ports: {
        discovery: number;
        listener: number;
    };
    protocols: any;
}
/**
 * Конфигурация для Ethereum Geth клиента
 */
export interface EthereumGethConfig {
    httpUrl?: string;
    wsUrl?: string;
    ipcPath?: string;
    accounts?: {
        privateKeys: string[];
    };
    network?: 'mainnet' | 'goerli' | 'sepolia' | 'holesky' | 'localhost';
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    gasLimit?: number;
    gasPrice?: string;
    confirmations?: number;
}
/**
 * Продакшн-готовый клиент для Ethereum Geth
 * Полная интеграция с Ethereum через Web3 и прямые RPC вызовы
 */
export declare class EthereumGethClient {
    private config;
    private web3;
    private httpClient;
    private _isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    private currentProvider;
    constructor(config: EthereumGethConfig);
    /**
     * Определение провайдера для подключения
     */
    private determineProvider;
    /**
     * Настройка HTTP клиента для прямых RPC вызовов
     */
    private setupHttpClient;
    /**
     * Добавление приватных ключей в кошелек Web3
     */
    private setupAccounts;
    /**
     * Выполнение прямого RPC вызова к Geth
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
     * Получение номера последнего блока
     */
    getBlockNumber(): Promise<number>;
    /**
     * Получение баланса адреса
     */
    getBalance(address: string, blockNumber?: 'latest' | 'pending' | 'earliest' | number): Promise<string>;
    /**
     * Получение баланса в ETH
     */
    getBalanceInEth(address: string, blockNumber?: 'latest' | 'pending' | 'earliest' | number): Promise<number>;
    /**
     * Получение nonce для адреса
     */
    getTransactionCount(address: string, blockNumber?: 'latest' | 'pending' | 'earliest' | number): Promise<number>;
    /**
     * Получение цены газа
     */
    getGasPrice(): Promise<string>;
    /**
     * Оценка газа для транзакции
     */
    estimateGas(transaction: any): Promise<number>;
    /**
     * Получение блока по номеру или хешу
     */
    getBlock(blockHashOrNumber: string | number, includeTransactions?: boolean): Promise<EthereumBlock>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(transactionHash: string): Promise<EthereumTransaction | null>;
    /**
     * Получение квитанции транзакции
     */
    getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt | null>;
    /**
     * Отправка подписанной транзакции
     */
    sendSignedTransaction(signedTransaction: string): Promise<TransactionReceipt>;
    /**
     * Создание и отправка транзакции
     */
    sendTransaction(from: string, to: string, value: string, data?: string, gasLimit?: number, gasPrice?: string): Promise<TransactionReceipt>;
    /**
     * Подпись транзакции
     */
    signTransaction(transaction: any, privateKey: string): Promise<string>;
    /**
     * Создание нового аккаунта
     */
    createAccount(): {
        address: string;
        privateKey: string;
    };
    /**
     * Получение адреса из приватного ключа
     */
    getAddressFromPrivateKey(privateKey: string): string;
    /**
     * Ожидание подтверждения транзакции
     */
    waitForTransactionConfirmation(txHash: string, confirmations?: number): Promise<TransactionReceipt>;
    /**
     * Получение статуса синхронизации
     */
    getSyncStatus(): Promise<EthereumSyncStatus | false>;
    /**
     * Получение информации о нодах
     */
    getNodeInfo(): Promise<NodeInfo>;
    /**
     * Получение списка пиров
     */
    getPeers(): Promise<PeerInfo[]>;
    /**
     * Получение статистики мемпула
     */
    getMempoolStatus(): Promise<{
        pending: number;
        queued: number;
    }>;
    /**
     * Получение версии клиента
     */
    getClientVersion(): Promise<string>;
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
        currentBlockNumber: number;
        gasPrice: string;
        peerCount: number;
        syncStatus: EthereumSyncStatus | false;
        mempoolStatus: {
            pending: number;
            queued: number;
        };
    }>;
    /**
     * Получение текущей сети
     */
    getNetworkId(): Promise<number>;
    /**
     * Получение ID сети
     */
    getChainId(): Promise<number>;
}
export {};
