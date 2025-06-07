interface LitecoinBlockchainInfo {
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
    softforks: any;
}
interface LitecoinNetworkInfo {
    version: number;
    subversion: string;
    protocolversion: number;
    timeoffset: number;
    connections: number;
    networkactive: boolean;
    networks: LitecoinNetworkInterface[];
}
interface LitecoinNetworkInterface {
    name: string;
    limited: boolean;
    reachable: boolean;
    proxy: string;
    proxy_randomize_credentials: boolean;
}
interface LitecoinTransaction {
    txid: string;
    hash: string;
    version: number;
    size: number;
    vsize: number;
    weight: number;
    locktime: number;
    vin: LitecoinTransactionInput[];
    vout: LitecoinTransactionOutput[];
    hex: string;
    blockhash?: string;
    confirmations?: number;
    time?: number;
    blocktime?: number;
}
interface LitecoinTransactionInput {
    txid: string;
    vout: number;
    scriptSig: {
        asm: string;
        hex: string;
    };
    sequence: number;
}
interface LitecoinTransactionOutput {
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
interface LitecoinUTXO {
    txid: string;
    vout: number;
    address: string;
    amount: number;
    confirmations: number;
    spendable: boolean;
    solvable: boolean;
    safe: boolean;
}
interface LitecoinWalletInfo {
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
interface LitecoinMempoolInfo {
    loaded: boolean;
    size: number;
    bytes: number;
    usage: number;
    maxmempool: number;
    mempoolminfee: number;
    minrelaytxfee: number;
}
interface LitecoinAddressInfo {
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
 * Конфигурация для Litecoin Core клиента
 */
export interface LitecoinCoreConfig {
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
 * Продакшн-готовый клиент для Litecoin Core
 * Полная интеграция с Litecoin Core daemon через RPC API
 * Поддерживает все основные функции включая SegWit и Lightning Network
 */
export declare class LitecoinCoreClient {
    private config;
    private httpClient;
    private requestId;
    private isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    constructor(config: LitecoinCoreConfig);
    /**
     * Настройка SSL соединения
     */
    private setupSSL;
    /**
     * Выполнение RPC запроса к Litecoin Core
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
     * Получение информации о блокчейне Litecoin
     */
    getBlockchainInfo(): Promise<LitecoinBlockchainInfo>;
    /**
     * Получение сетевой информации
     */
    getNetworkInfo(): Promise<LitecoinNetworkInfo>;
    /**
     * Получение информации о мемпуле
     */
    getMempoolInfo(): Promise<LitecoinMempoolInfo>;
    /**
     * Получение информации о кошельке
     */
    getWalletInfo(): Promise<LitecoinWalletInfo>;
    /**
     * Создание нового Litecoin адреса
     * Поддерживает legacy, p2sh-segwit и bech32 (ltc) форматы
     */
    getNewAddress(label?: string, addressType?: 'legacy' | 'p2sh-segwit' | 'bech32'): Promise<string>;
    /**
     * Получение информации об адресе
     */
    getAddressInfo(address: string): Promise<LitecoinAddressInfo>;
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
    listUnspent(minConfirmations?: number, maxConfirmations?: number, addresses?: string[]): Promise<LitecoinUTXO[]>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(txid: string, includeWatchonly?: boolean): Promise<LitecoinTransaction>;
    /**
     * Получение необработанной транзакции
     */
    getRawTransaction(txid: string, verbose?: boolean): Promise<LitecoinTransaction | string>;
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
     * Оценка комиссии для транзакции Litecoin
     * Litecoin имеет более быстрые блоки (2.5 минуты против 10 минут у Bitcoin)
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
     * Валидация Litecoin адреса
     */
    validateAddress(address: string): Promise<{
        isvalid: boolean;
        address?: string;
        scriptPubKey?: string;
        ismine?: boolean;
        iswatchonly?: boolean;
    }>;
    /**
     * Создание Litecoin адреса программно (без использования кошелька ноды)
     */
    createLitecoinAddress(addressType?: 'legacy' | 'p2sh-segwit' | 'bech32'): {
        address: string;
        privateKey: string;
        publicKey: string;
    };
    /**
     * Получение адреса из ключевой пары
     */
    private getAddressFromKeyPair;
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
        difficulty: number;
        chainwork: string;
    }>;
    /**
     * Получение информации о сети Litecoin (Mainnet/Testnet)
     */
    getNetworkType(): Promise<'main' | 'test' | 'regtest'>;
    /**
     * Получение информации о софт-форках Litecoin
     */
    getSoftForks(): Promise<any>;
    /**
     * Мониторинг новых блоков Litecoin
     */
    waitForNewBlock(timeout?: number): Promise<any>;
    /**
     * Получение детальной информации о мемпуле
     */
    getMempoolContent(): Promise<{
        [txid: string]: any;
    }>;
    /**
     * Проверка здоровья Litecoin ноды
     */
    healthCheck(): Promise<{
        connected: boolean;
        blockHeight: number;
        connections: number;
        version: string;
        network: string;
        warnings: string[];
        mempoolSize: number;
        difficulty: number;
    }>;
}
export {};
