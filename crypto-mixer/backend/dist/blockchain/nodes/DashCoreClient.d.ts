interface DashBlockchainInfo {
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
    instantsend_locked: number;
    chainlocks: any;
}
interface DashNetworkInfo {
    version: number;
    subversion: string;
    protocolversion: number;
    timeoffset: number;
    connections: number;
    networkactive: boolean;
    networks: DashNetworkInterface[];
    relayfee: number;
    incrementalfee: number;
    localaddresses: any[];
    warnings: string;
}
interface DashNetworkInterface {
    name: string;
    limited: boolean;
    reachable: boolean;
    proxy: string;
    proxy_randomize_credentials: boolean;
}
interface DashTransaction {
    txid: string;
    hash: string;
    version: number;
    type: number;
    size: number;
    locktime: number;
    vin: DashTransactionInput[];
    vout: DashTransactionOutput[];
    hex: string;
    blockhash?: string;
    confirmations?: number;
    time?: number;
    blocktime?: number;
    instantlock?: boolean;
    instantlock_internal?: boolean;
    chainlock?: boolean;
}
interface DashTransactionInput {
    txid: string;
    vout: number;
    scriptSig: {
        asm: string;
        hex: string;
    };
    sequence: number;
}
interface DashTransactionOutput {
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
interface DashUTXO {
    txid: string;
    vout: number;
    address: string;
    amount: number;
    confirmations: number;
    spendable: boolean;
    solvable: boolean;
    safe: boolean;
    ps_rounds?: number;
}
interface DashWalletInfo {
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
    coinjoin_balance?: number;
    privatesend_balance?: number;
}
interface DashMempoolInfo {
    loaded: boolean;
    size: number;
    bytes: number;
    usage: number;
    maxmempool: number;
    mempoolminfee: number;
    minrelaytxfee: number;
    instantsendlocks: number;
}
interface DashMasternodeInfo {
    status: string;
    proTxHash: string;
    collateralHash: string;
    collateralIndex: number;
    dmnState: any;
    state: any;
    confirmations: number;
}
interface DashInstantSendInfo {
    txid: string;
    height: number;
    locked: boolean;
    inputs: any[];
}
/**
 * Конфигурация для Dash Core клиента
 */
export interface DashCoreConfig {
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
    enableInstantSend?: boolean;
    enablePrivateSend?: boolean;
    privateSendRounds?: number;
}
/**
 * Продакшн-готовый клиент для Dash Core
 * Полная интеграция с Dash Core daemon через RPC API
 * Поддерживает InstantSend, PrivateSend, ChainLocks и Masternodes
 */
export declare class DashCoreClient {
    private config;
    private httpClient;
    private requestId;
    private isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    constructor(config: DashCoreConfig);
    /**
     * Настройка SSL соединения
     */
    private setupSSL;
    /**
     * Выполнение RPC запроса к Dash Core
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
     * Получение информации о блокчейне Dash
     */
    getBlockchainInfo(): Promise<DashBlockchainInfo>;
    /**
     * Получение сетевой информации
     */
    getNetworkInfo(): Promise<DashNetworkInfo>;
    /**
     * Получение информации о мемпуле
     */
    getMempoolInfo(): Promise<DashMempoolInfo>;
    /**
     * Получение информации о кошельке
     */
    getWalletInfo(): Promise<DashWalletInfo>;
    /**
     * Создание нового Dash адреса
     */
    getNewAddress(label?: string): Promise<string>;
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
    listUnspent(minConfirmations?: number, maxConfirmations?: number, addresses?: string[]): Promise<DashUTXO[]>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(txid: string, includeWatchonly?: boolean): Promise<DashTransaction>;
    /**
     * Получение необработанной транзакции
     */
    getRawTransaction(txid: string, verbose?: boolean): Promise<DashTransaction | string>;
    /**
     * Отправка необработанной транзакции
     */
    sendRawTransaction(hexString: string, allowHighFees?: boolean): Promise<string>;
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
    signRawTransaction(hexString: string): Promise<{
        hex: string;
        complete: boolean;
    }>;
    /**
     * Отправка средств на адрес
     */
    sendToAddress(address: string, amount: number, comment?: string, commentTo?: string, subtractFeeFromAmount?: boolean, useInstantSend?: boolean): Promise<string>;
    /**
     * Оценка комиссии для транзакции Dash
     * Dash имеет блоки каждые 2.5 минуты
     */
    estimateFee(numBlocks: number): Promise<number>;
    /**
     * Валидация Dash адреса
     */
    validateAddress(address: string): Promise<{
        isvalid: boolean;
        address?: string;
        scriptPubKey?: string;
        ismine?: boolean;
        iswatchonly?: boolean;
    }>;
    /**
     * Отправка InstantSend транзакции
     */
    sendInstantSend(address: string, amount: number, comment?: string): Promise<string>;
    /**
     * Проверка статуса InstantSend для транзакции
     */
    getInstantSendStatus(txid: string): Promise<DashInstantSendInfo>;
    /**
     * Получение информации о мастернодах
     */
    getMasternodeList(filter?: string): Promise<{
        [proTxHash: string]: DashMasternodeInfo;
    }>;
    /**
     * Получение количества активных мастернод
     */
    getMasternodeCount(): Promise<{
        total: number;
        stable: number;
        enabled: number;
        qualify: number;
        all: number;
    }>;
    /**
     * Начать PrivateSend микширование
     */
    startPrivateSend(): Promise<boolean>;
    /**
     * Остановить PrivateSend микширование
     */
    stopPrivateSend(): Promise<boolean>;
    /**
     * Получение статуса PrivateSend
     */
    getPrivateSendInfo(): Promise<any>;
    /**
     * Настройка количества раундов PrivateSend
     */
    setPrivateSendRounds(rounds: number): Promise<boolean>;
    /**
     * Получение баланса PrivateSend
     */
    getPrivateSendBalance(): Promise<number>;
    /**
     * Создание Dash адреса программно
     */
    createDashAddress(): {
        address: string;
        privateKey: string;
        publicKey: string;
    };
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
        masternodeCount: number;
        instantSendLocks: number;
        chainLocks: boolean;
    }>;
    /**
     * Проверка здоровья Dash ноды
     */
    healthCheck(): Promise<{
        connected: boolean;
        blockHeight: number;
        connections: number;
        version: string;
        network: string;
        warnings: string[];
        masternodeCount: number;
        instantSendEnabled: boolean;
        privateSendEnabled: boolean;
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
    importAddress(address: string, label?: string, rescan?: boolean): Promise<void>;
    /**
     * Мониторинг новых блоков Dash
     */
    waitForNewBlock(timeout?: number): Promise<any>;
    /**
     * Получение информации о квораме (для ChainLocks)
     */
    getQuorumInfo(quorumType: number, quorumHash: string): Promise<any>;
    /**
     * Получение списка квораумов
     */
    listQuorums(count?: number): Promise<any>;
}
export {};
