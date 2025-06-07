interface ZcashBlockchainInfo {
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
    commitments: number;
    valuePools: ZcashValuePool[];
    upgrades: {
        [name: string]: ZcashUpgradeInfo;
    };
}
interface ZcashValuePool {
    id: string;
    monitored: boolean;
    chainValue: number;
    chainValueZat: number;
    valueDelta: number;
    valueDeltaZat: number;
}
interface ZcashUpgradeInfo {
    name: string;
    activationheight: number;
    status: string;
    info: string;
}
interface ZcashNetworkInfo {
    version: number;
    subversion: string;
    protocolversion: number;
    timeoffset: number;
    connections: number;
    networkactive: boolean;
    networks: ZcashNetworkInterface[];
    relayfee: number;
    localaddresses: any[];
    warnings: string;
}
interface ZcashNetworkInterface {
    name: string;
    limited: boolean;
    reachable: boolean;
    proxy: string;
    proxy_randomize_credentials: boolean;
}
interface ZcashTransaction {
    txid: string;
    hash: string;
    version: number;
    size: number;
    locktime: number;
    vin: ZcashTransactionInput[];
    vout: ZcashTransactionOutput[];
    vjoinsplit?: ZcashJoinSplit[];
    vShieldedSpend?: ZcashShieldedSpend[];
    vShieldedOutput?: ZcashShieldedOutput[];
    valueBalance?: number;
    hex: string;
    blockhash?: string;
    confirmations?: number;
    time?: number;
    blocktime?: number;
}
interface ZcashTransactionInput {
    txid: string;
    vout: number;
    scriptSig: {
        asm: string;
        hex: string;
    };
    sequence: number;
}
interface ZcashTransactionOutput {
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
interface ZcashJoinSplit {
    vpub_old: number;
    vpub_new: number;
    anchor: string;
    nullifiers: string[];
    commitments: string[];
    onetimePubKey: string;
    randomSeed: string;
    macs: string[];
    proof: string;
    ciphertexts: string[];
}
interface ZcashShieldedSpend {
    cv: string;
    anchor: string;
    nullifier: string;
    rk: string;
    proof: string;
    spendAuthSig: string;
}
interface ZcashShieldedOutput {
    cv: string;
    cmu: string;
    ephemeralKey: string;
    encCiphertext: string;
    outCiphertext: string;
    proof: string;
}
interface ZcashWalletInfo {
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
    shielded_balance?: number;
    shielded_unconfirmed_balance?: number;
    total_balance?: number;
}
interface ZcashShieldedAddress {
    address: string;
    type: 'sprout' | 'sapling';
    diversifier?: string;
    diversifiedtransmissionkey?: string;
}
interface ZcashOperationStatus {
    id: string;
    status: 'queued' | 'executing' | 'success' | 'failed' | 'cancelled';
    creation_time: number;
    result?: any;
    error?: any;
    method: string;
    params: any;
}
/**
 * Конфигурация для Zcash клиента
 */
export interface ZcashConfig {
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
    enableShielded?: boolean;
    defaultShieldedAddress?: 'sprout' | 'sapling';
    autoShieldTransparent?: boolean;
    shieldingThreshold?: number;
}
/**
 * Продакшн-готовый клиент для Zcash
 * Полная интеграция с Zcash daemon через RPC API
 * Поддерживает transparent и shielded транзакции (Sprout и Sapling)
 */
export declare class ZcashClient {
    private config;
    private httpClient;
    private requestId;
    private isConnected;
    private lastHealthCheck;
    private healthCheckInterval;
    constructor(config: ZcashConfig);
    /**
     * Настройка SSL соединения
     */
    private setupSSL;
    /**
     * Выполнение RPC запроса к Zcash
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
     * Получение информации о блокчейне Zcash
     */
    getBlockchainInfo(): Promise<ZcashBlockchainInfo>;
    /**
     * Получение сетевой информации
     */
    getNetworkInfo(): Promise<ZcashNetworkInfo>;
    /**
     * Получение информации о кошельке
     */
    getWalletInfo(): Promise<ZcashWalletInfo>;
    /**
     * Создание нового transparent адреса
     */
    getNewAddress(label?: string): Promise<string>;
    /**
     * Создание нового shielded адреса
     */
    getNewShieldedAddress(type?: 'sprout' | 'sapling'): Promise<string>;
    /**
     * Получение баланса кошелька (transparent)
     */
    getBalance(minConfirmations?: number): Promise<number>;
    /**
     * Получение shielded баланса
     */
    getShieldedBalance(address?: string, minConfirmations?: number): Promise<number>;
    /**
     * Получение общего баланса (transparent + shielded)
     */
    getTotalBalance(minConfirmations?: number): Promise<{
        transparent: number;
        shielded: number;
        total: number;
    }>;
    /**
     * Получение списка shielded адресов
     */
    listShieldedAddresses(): Promise<ZcashShieldedAddress[]>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(txid: string, includeWatchonly?: boolean): Promise<ZcashTransaction>;
    /**
     * Получение необработанной транзакции
     */
    getRawTransaction(txid: string, verbose?: boolean): Promise<ZcashTransaction | string>;
    /**
     * Отправка transparent транзакции
     */
    sendToAddress(address: string, amount: number, comment?: string, commentTo?: string): Promise<string>;
    /**
     * Отправка shielded транзакции
     */
    sendShielded(fromAddress: string, toAddress: string, amount: number, memo?: string, fee?: number): Promise<string>;
    /**
     * Экранирование transparent средств (t->z)
     */
    shieldTransparentFunds(fromAddress: string, toShieldedAddress: string, amount?: number, fee?: number): Promise<string>;
    /**
     * Разэкранирование shielded средств (z->t)
     */
    unshieldFunds(fromShieldedAddress: string, toTransparentAddress: string, amount: number, fee?: number): Promise<string>;
    /**
     * Получение статуса операции
     */
    getOperationStatus(operationId: string): Promise<ZcashOperationStatus>;
    /**
     * Ожидание завершения операции
     */
    waitForOperation(operationId: string, maxWaitTime?: number): Promise<string>;
    /**
     * Получение viewing key для shielded адреса
     */
    getViewingKey(address: string): Promise<string>;
    /**
     * Импорт viewing key
     */
    importViewingKey(viewingKey: string, rescan?: 'yes' | 'no' | 'whenkeyisnew', startHeight?: number): Promise<void>;
    /**
     * Валидация Zcash адреса
     */
    validateAddress(address: string): Promise<{
        isvalid: boolean;
        address?: string;
        type?: 'transparent' | 'sprout' | 'sapling';
        scriptPubKey?: string;
        ismine?: boolean;
        iswatchonly?: boolean;
    }>;
    /**
     * Создание transparent Zcash адреса программно
     */
    createTransparentAddress(): {
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
        connectionCount: number;
        transparentBalance: number;
        shieldedBalance: number;
        totalBalance: number;
        shieldedAddressCount: number;
        valuePools: ZcashValuePool[];
    }>;
    /**
     * Проверка здоровья Zcash ноды
     */
    healthCheck(): Promise<{
        connected: boolean;
        blockHeight: number;
        connections: number;
        version: string;
        network: string;
        warnings: string[];
        shieldedEnabled: boolean;
        transparentBalance: number;
        shieldedBalance: number;
        upgradeStatus: {
            [name: string]: string;
        };
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
     * Автоматическое экранирование transparent средств при превышении порога
     */
    autoShieldIfNeeded(): Promise<string | null>;
}
export {};
