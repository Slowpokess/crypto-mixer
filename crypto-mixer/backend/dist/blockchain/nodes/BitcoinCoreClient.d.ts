interface BlockchainInfo {
    chain: string;
    blocks: number;
    headers: number;
    bestblockhash: string;
    difficulty: number;
    mediantime: number;
    verificationprogress: number;
    chainwork: string;
    size_on_disk: number;
    pruned: boolean;
}
interface NetworkInfo {
    version: number;
    subversion: string;
    protocolversion: number;
    timeoffset: number;
    connections: number;
    networkactive: boolean;
    networks: NetworkInterface[];
}
interface NetworkInterface {
    name: string;
    limited: boolean;
    reachable: boolean;
    proxy: string;
    proxy_randomize_credentials: boolean;
}
interface TransactionInput {
    txid: string;
    vout: number;
    scriptSig: {
        asm: string;
        hex: string;
    };
    sequence: number;
}
interface TransactionOutput {
    value: number;
    n: number;
    scriptPubKey: {
        asm: string;
        hex: string;
        reqSigs?: number;
        type: string;
        addresses?: string[];
    };
}
interface Transaction {
    txid: string;
    hash: string;
    version: number;
    size: number;
    vsize: number;
    weight: number;
    locktime: number;
    vin: TransactionInput[];
    vout: TransactionOutput[];
    hex: string;
    blockhash?: string;
    confirmations?: number;
    time?: number;
    blocktime?: number;
}
interface UTXO {
    txid: string;
    vout: number;
    address: string;
    amount: number;
    confirmations: number;
    spendable: boolean;
    solvable: boolean;
    safe: boolean;
}
interface WalletInfo {
    walletname: string;
    walletversion: number;
    balance: number;
    unconfirmed_balance: number;
    immature_balance: number;
    txcount: number;
    keypoololdest: number;
    keypoolsize: number;
    unlocked_until?: number;
    paytxfee: number;
    hdseedid?: string;
    private_keys_enabled: boolean;
    avoid_reuse: boolean;
    scanning: boolean | {
        duration: number;
        progress: number;
    };
}
interface MempoolInfo {
    loaded: boolean;
    size: number;
    bytes: number;
    usage: number;
    maxmempool: number;
    mempoolminfee: number;
    minrelaytxfee: number;
}
interface AddressInfo {
    address: string;
    scriptPubKey: string;
    ismine: boolean;
    iswatchonly: boolean;
    solvable: boolean;
    desc?: string;
    iswitness: boolean;
    witness_version?: number;
    witness_program?: string;
    pubkey?: string;
    iscompressed?: boolean;
    timestamp?: number;
    hdkeypath?: string;
    hdseedid?: string;
    labels: string[];
}
/**
 * Конфигурация для Bitcoin Core клиента
 */
export interface BitcoinCoreConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    wallet?: string;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    ssl?: boolean;
    sslCert?: string;
    sslKey?: string;
    sslCa?: string;
}
/**
 * Продакшн-готовый клиент для Bitcoin Core
 * Полная интеграция с Bitcoin Core daemon через RPC API
 */
export declare class BitcoinCoreClient {
    private config;
    private httpClient;
    private requestId;
    private isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    constructor(config: BitcoinCoreConfig);
    /**
     * Настройка SSL соединения
     */
    private setupSSL;
    /**
     * Выполнение RPC запроса к Bitcoin Core
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
     * Получение информации о блокчейне
     */
    getBlockchainInfo(): Promise<BlockchainInfo>;
    /**
     * Получение сетевой информации
     */
    getNetworkInfo(): Promise<NetworkInfo>;
    /**
     * Получение информации о мемпуле
     */
    getMempoolInfo(): Promise<MempoolInfo>;
    /**
     * Получение информации о кошельке
     */
    getWalletInfo(): Promise<WalletInfo>;
    /**
     * Создание нового адреса
     */
    getNewAddress(label?: string, addressType?: 'legacy' | 'p2sh-segwit' | 'bech32'): Promise<string>;
    /**
     * Получение информации об адресе
     */
    getAddressInfo(address: string): Promise<AddressInfo>;
    /**
     * Получение баланса кошелька
     */
    getBalance(minConfirmations?: number): Promise<number>;
    /**
     * Получение баланса конкретного адреса
     */
    getReceivedByAddress(address: string, minConfirmations?: number): Promise<number>;
    /**
     * Получение списка UTXO
     */
    listUnspent(minConfirmations?: number, maxConfirmations?: number, addresses?: string[]): Promise<UTXO[]>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(txid: string, includeWatchonly?: boolean): Promise<Transaction>;
    /**
     * Получение необработанной транзакции
     */
    getRawTransaction(txid: string, verbose?: boolean): Promise<Transaction | string>;
    /**
     * Отправка необработанной транзакции
     */
    sendRawTransaction(hexString: string, maxFeeRate?: number): Promise<string>;
    /**
     * Создание необработанной транзакции
     */
    createRawTransaction(inputs: {
        txid: string;
        vout: number;
    }[], outputs: {
        [address: string]: number;
    }): Promise<string>;
    /**
     * Подпись необработанной транзакции
     */
    signRawTransactionWithWallet(hexString: string): Promise<{
        hex: string;
        complete: boolean;
    }>;
    /**
     * Отправка средств на адрес
     */
    sendToAddress(address: string, amount: number, comment?: string, commentTo?: string, subtractFeeFromAmount?: boolean): Promise<string>;
    /**
     * Оценка комиссии для транзакции
     */
    estimateSmartFee(confirmationTarget: number, estimateMode?: 'UNSET' | 'ECONOMICAL' | 'CONSERVATIVE'): Promise<{
        feerate?: number;
        blocks: number;
    }>;
    /**
     * Получение лучшего хеша блока
     */
    getBestBlockHash(): Promise<string>;
    /**
     * Получение блока по хешу
     */
    getBlock(blockHash: string, verbosity?: 0 | 1 | 2): Promise<any>;
    /**
     * Получение хеша блока по высоте
     */
    getBlockHash(height: number): Promise<string>;
    /**
     * Получение количества блоков
     */
    getBlockCount(): Promise<number>;
    /**
     * Импорт адреса для отслеживания
     */
    importAddress(address: string, label?: string, rescan?: boolean, p2sh?: boolean): Promise<void>;
    /**
     * Получение статуса соединения
     */
    isNodeConnected(): boolean;
    /**
     * Получение времени последней проверки здоровья
     */
    getLastHealthCheck(): Date | null;
    /**
     * Проверка доступности ноды
     */
    ping(): Promise<boolean>;
    /**
     * Закрытие соединения
     */
    disconnect(): Promise<void>;
    /**
     * Получение статистики производительности
     */
    getPerformanceStats(): Promise<{
        isConnected: boolean;
        lastHealthCheck: Date | null;
        currentBlockHeight: number;
        mempoolSize: number;
        connectionCount: number;
    }>;
}
export {};
