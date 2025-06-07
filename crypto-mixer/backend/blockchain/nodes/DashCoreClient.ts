import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import logger from '../../utils/logger';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Сеть Dash с параметрами
 */
const dashNetwork = {
  messagePrefix: '\x19DarkCoin Signed Message:\n',
  bech32: 'dash', // Dash пока не поддерживает bech32, но оставляем для будущего
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x4c, // Адреса начинаются с X
  scriptHash: 0x10, // Мультисиг адреса начинаются с 7
  wif: 0xcc,
};

/**
 * Интерфейсы для Dash Core RPC API
 */
interface DashRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: any[];
}

interface DashRpcResponse<T = any> {
  result: T;
  error: any;
  id: string | number;
}

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
  instantsend_locked: number; // Dash-специфичное поле
  chainlocks: any; // Информация о ChainLocks
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
  type: number; // Dash transaction type
  size: number;
  locktime: number;
  vin: DashTransactionInput[];
  vout: DashTransactionOutput[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
  instantlock?: boolean; // InstantSend lock status
  instantlock_internal?: boolean;
  chainlock?: boolean; // ChainLock status
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
  ps_rounds?: number; // PrivateSend rounds
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
  scanning: boolean | { duration: number; progress: number; };
  // Dash-специфичные поля
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
  instantsendlocks: number; // Количество InstantSend блокировок
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
  // Dash-специфичные настройки
  enableInstantSend?: boolean;
  enablePrivateSend?: boolean;
  privateSendRounds?: number;
}

/**
 * Продакшн-готовый клиент для Dash Core
 * Полная интеграция с Dash Core daemon через RPC API
 * Поддерживает InstantSend, PrivateSend, ChainLocks и Masternodes
 */
export class DashCoreClient {
  private config: DashCoreConfig;
  private httpClient: AxiosInstance;
  private requestId: number = 0;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: DashCoreConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ssl: false,
      enableInstantSend: true,
      enablePrivateSend: false,
      privateSendRounds: 2,
      ...config
    };

    this.httpClient = axios.create({
      baseURL: `${this.config.ssl ? 'https' : 'http'}://${this.config.host}:${this.config.port}`,
      auth: {
        username: this.config.username,
        password: this.config.password
      },
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoMixer-DashCore/1.0'
      }
    });

    // Настройка SSL если указано
    if (this.config.ssl) {
      this.setupSSL();
    }

    // Запуск периодической проверки здоровья
    this.startHealthCheck();
  }

  /**
   * Настройка SSL соединения
   */
  private setupSSL(): void {
    if (this.config.sslCert || this.config.sslKey || this.config.sslCa) {
      const fs = require('fs');
      const https = require('https');
      
      const httpsAgent = new https.Agent({
        cert: this.config.sslCert ? fs.readFileSync(this.config.sslCert) : undefined,
        key: this.config.sslKey ? fs.readFileSync(this.config.sslKey) : undefined,
        ca: this.config.sslCa ? fs.readFileSync(this.config.sslCa) : undefined,
        rejectUnauthorized: true
      });

      this.httpClient.defaults.httpsAgent = httpsAgent;
    }
  }

  /**
   * Выполнение RPC запроса к Dash Core
   */
  private async rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
    const requestId = ++this.requestId;
    
    const request: DashRpcRequest = {
      jsonrpc: '1.0',
      id: requestId,
      method,
      params
    };

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const url = this.config.wallet ? `/wallet/${this.config.wallet}` : '/';
        const response: AxiosResponse<DashRpcResponse<T>> = await this.httpClient.post(url, request);
        
        if (response.data.error) {
          throw new Error(`Dash RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this.isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this.isConnected = false;
        
        logger.warn(`Dash RPC attempt ${attempt} failed`, {
          method,
          error: error.message,
          attempt,
          maxRetries: this.config.maxRetries
        });

        if (attempt < this.config.maxRetries!) {
          await this.delay(this.config.retryDelay! * attempt);
        }
      }
    }

    logger.error('Dash RPC failed after all retries', {
      method,
      params,
      error: lastError?.message
    });
    
    throw lastError;
  }

  /**
   * Задержка для повторных попыток
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Запуск периодической проверки здоровья
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getBlockchainInfo();
        this.lastHealthCheck = new Date();
      } catch (error) {
        logger.warn('Dash Core health check failed', { error });
      }
    }, 60000); // Каждую минуту
  }

  /**
   * Остановка проверки здоровья
   */
  public stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ========== ОСНОВНЫЕ МЕТОДЫ API ==========

  /**
   * Получение информации о блокчейне Dash
   */
  async getBlockchainInfo(): Promise<DashBlockchainInfo> {
    return this.rpcCall<DashBlockchainInfo>('getblockchaininfo');
  }

  /**
   * Получение сетевой информации
   */
  async getNetworkInfo(): Promise<DashNetworkInfo> {
    return this.rpcCall<DashNetworkInfo>('getnetworkinfo');
  }

  /**
   * Получение информации о мемпуле
   */
  async getMempoolInfo(): Promise<DashMempoolInfo> {
    return this.rpcCall<DashMempoolInfo>('getmempoolinfo');
  }

  /**
   * Получение информации о кошельке
   */
  async getWalletInfo(): Promise<DashWalletInfo> {
    return this.rpcCall<DashWalletInfo>('getwalletinfo');
  }

  /**
   * Создание нового Dash адреса
   */
  async getNewAddress(label?: string): Promise<string> {
    const params: any[] = label ? [label] : [];
    return this.rpcCall<string>('getnewaddress', params);
  }

  /**
   * Получение баланса кошелька
   */
  async getBalance(minConfirmations: number = 1): Promise<number> {
    return this.rpcCall<number>('getbalance', ['*', minConfirmations]);
  }

  /**
   * Получение баланса конкретного адреса
   */
  async getReceivedByAddress(address: string, minConfirmations: number = 1): Promise<number> {
    return this.rpcCall<number>('getreceivedbyaddress', [address, minConfirmations]);
  }

  /**
   * Получение списка UTXO
   */
  async listUnspent(minConfirmations: number = 1, maxConfirmations: number = 9999999, addresses?: string[]): Promise<DashUTXO[]> {
    const params: any[] = [minConfirmations, maxConfirmations];
    if (addresses) {
      params.push(addresses);
    }
    return this.rpcCall<DashUTXO[]>('listunspent', params);
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(txid: string, includeWatchonly: boolean = false): Promise<DashTransaction> {
    return this.rpcCall<DashTransaction>('gettransaction', [txid, includeWatchonly]);
  }

  /**
   * Получение необработанной транзакции
   */
  async getRawTransaction(txid: string, verbose: boolean = true): Promise<DashTransaction | string> {
    return this.rpcCall<DashTransaction | string>('getrawtransaction', [txid, verbose]);
  }

  /**
   * Отправка необработанной транзакции
   */
  async sendRawTransaction(hexString: string, allowHighFees: boolean = false): Promise<string> {
    return this.rpcCall<string>('sendrawtransaction', [hexString, allowHighFees]);
  }

  /**
   * Создание необработанной транзакции
   */
  async createRawTransaction(inputs: { txid: string; vout: number }[], outputs: { [address: string]: number }): Promise<string> {
    return this.rpcCall<string>('createrawtransaction', [inputs, outputs]);
  }

  /**
   * Подпись необработанной транзакции
   */
  async signRawTransaction(hexString: string): Promise<{ hex: string; complete: boolean }> {
    return this.rpcCall<{ hex: string; complete: boolean }>('signrawtransaction', [hexString]);
  }

  /**
   * Отправка средств на адрес
   */
  async sendToAddress(address: string, amount: number, comment?: string, commentTo?: string, subtractFeeFromAmount: boolean = false, useInstantSend: boolean = false): Promise<string> {
    const params: any[] = [address, amount];
    if (comment) params.push(comment);
    if (commentTo) params.push(commentTo);
    if (subtractFeeFromAmount) params.push(subtractFeeFromAmount);
    if (useInstantSend && this.config.enableInstantSend) params.push(useInstantSend);
    
    return this.rpcCall<string>('sendtoaddress', params);
  }

  /**
   * Оценка комиссии для транзакции Dash
   * Dash имеет блоки каждые 2.5 минуты
   */
  async estimateFee(numBlocks: number): Promise<number> {
    try {
      return this.rpcCall<number>('estimatefee', [numBlocks]);
    } catch (error) {
      // Fallback для старых версий Dash Core
      return 0.0001; // Дефолтная комиссия 0.0001 DASH
    }
  }

  /**
   * Валидация Dash адреса
   */
  async validateAddress(address: string): Promise<{ isvalid: boolean; address?: string; scriptPubKey?: string; ismine?: boolean; iswatchonly?: boolean }> {
    return this.rpcCall('validateaddress', [address]);
  }

  // ========== DASH-СПЕЦИФИЧНЫЕ МЕТОДЫ ==========

  /**
   * Отправка InstantSend транзакции
   */
  async sendInstantSend(address: string, amount: number, comment?: string): Promise<string> {
    if (!this.config.enableInstantSend) {
      throw new Error('InstantSend не включен в конфигурации');
    }
    
    return this.sendToAddress(address, amount, comment, undefined, false, true);
  }

  /**
   * Проверка статуса InstantSend для транзакции
   */
  async getInstantSendStatus(txid: string): Promise<DashInstantSendInfo> {
    return this.rpcCall<DashInstantSendInfo>('getinstantsendstatus', [txid]);
  }

  /**
   * Получение информации о мастернодах
   */
  async getMasternodeList(filter?: string): Promise<{ [proTxHash: string]: DashMasternodeInfo }> {
    const params: any[] = filter ? [filter] : [];
    return this.rpcCall('masternodelist', params);
  }

  /**
   * Получение количества активных мастернод
   */
  async getMasternodeCount(): Promise<{ total: number; stable: number; enabled: number; qualify: number; all: number }> {
    return this.rpcCall('masternodecount');
  }

  /**
   * Начать PrivateSend микширование
   */
  async startPrivateSend(): Promise<boolean> {
    if (!this.config.enablePrivateSend) {
      throw new Error('PrivateSend не включен в конфигурации');
    }
    
    try {
      await this.rpcCall('privatesend', ['start']);
      return true;
    } catch (error) {
      logger.error('Failed to start PrivateSend', { error });
      return false;
    }
  }

  /**
   * Остановить PrivateSend микширование
   */
  async stopPrivateSend(): Promise<boolean> {
    try {
      await this.rpcCall('privatesend', ['stop']);
      return true;
    } catch (error) {
      logger.error('Failed to stop PrivateSend', { error });
      return false;
    }
  }

  /**
   * Получение статуса PrivateSend
   */
  async getPrivateSendInfo(): Promise<any> {
    return this.rpcCall('privatesend', ['info']);
  }

  /**
   * Настройка количества раундов PrivateSend
   */
  async setPrivateSendRounds(rounds: number): Promise<boolean> {
    try {
      await this.rpcCall('privatesend', ['set-rounds', rounds]);
      return true;
    } catch (error) {
      logger.error('Failed to set PrivateSend rounds', { error, rounds });
      return false;
    }
  }

  /**
   * Получение баланса PrivateSend
   */
  async getPrivateSendBalance(): Promise<number> {
    try {
      const walletInfo = await this.getWalletInfo();
      return walletInfo.privatesend_balance || 0;
    } catch (error) {
      logger.error('Failed to get PrivateSend balance', { error });
      return 0;
    }
  }

  /**
   * Создание Dash адреса программно
   */
  createDashAddress(): { address: string; privateKey: string; publicKey: string } {
    const keyPair = ECPair.makeRandom({ network: dashNetwork });
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: dashNetwork 
    });
    
    return {
      address: address!,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex')
    };
  }

  /**
   * Получение статуса соединения
   */
  isNodeConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Получение времени последней проверки здоровья
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }

  /**
   * Проверка доступности ноды
   */
  async ping(): Promise<boolean> {
    try {
      await this.rpcCall('ping');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Закрытие соединения
   */
  async disconnect(): Promise<void> {
    this.stopHealthCheck();
    this.isConnected = false;
  }

  /**
   * Получение статистики производительности
   */
  async getPerformanceStats(): Promise<{
    isConnected: boolean;
    lastHealthCheck: Date | null;
    currentBlockHeight: number;
    mempoolSize: number;
    connectionCount: number;
    masternodeCount: number;
    instantSendLocks: number;
    chainLocks: boolean;
  }> {
    try {
      const [blockchainInfo, networkInfo, mempoolInfo, masternodeCount] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getMempoolInfo(),
        this.getMasternodeCount().catch(() => ({ total: 0 }))
      ]);

      return {
        isConnected: this.isConnected,
        lastHealthCheck: this.lastHealthCheck,
        currentBlockHeight: blockchainInfo.blocks,
        mempoolSize: mempoolInfo.size,
        connectionCount: networkInfo.connections,
        masternodeCount: masternodeCount.total,
        instantSendLocks: mempoolInfo.instantsendlocks,
        chainLocks: !!blockchainInfo.chainlocks
      };
    } catch (error) {
      logger.error('Failed to get Dash Core performance stats', { error });
      throw error;
    }
  }

  /**
   * Проверка здоровья Dash ноды
   */
  async healthCheck(): Promise<{
    connected: boolean;
    blockHeight: number;
    connections: number;
    version: string;
    network: string;
    warnings: string[];
    masternodeCount: number;
    instantSendEnabled: boolean;
    privateSendEnabled: boolean;
  }> {
    try {
      const [blockchainInfo, networkInfo, masternodeCount] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getMasternodeCount().catch(() => ({ total: 0 }))
      ]);

      return {
        connected: true,
        blockHeight: blockchainInfo.blocks,
        connections: networkInfo.connections,
        version: networkInfo.subversion,
        network: blockchainInfo.chain,
        warnings: networkInfo.warnings ? [networkInfo.warnings] : [],
        masternodeCount: masternodeCount.total,
        instantSendEnabled: this.config.enableInstantSend || false,
        privateSendEnabled: this.config.enablePrivateSend || false
      };
    } catch (error) {
      logger.error('Dash health check failed:', error as Error);
      return {
        connected: false,
        blockHeight: 0,
        connections: 0,
        version: 'unknown',
        network: 'unknown',
        warnings: [(error as Error).message],
        masternodeCount: 0,
        instantSendEnabled: false,
        privateSendEnabled: false
      };
    }
  }

  /**
   * Получение лучшего хеша блока
   */
  async getBestBlockHash(): Promise<string> {
    return this.rpcCall<string>('getbestblockhash');
  }

  /**
   * Получение блока по хешу
   */
  async getBlock(blockHash: string, verbosity: 0 | 1 | 2 = 1): Promise<any> {
    return this.rpcCall('getblock', [blockHash, verbosity]);
  }

  /**
   * Получение хеша блока по высоте
   */
  async getBlockHash(height: number): Promise<string> {
    return this.rpcCall<string>('getblockhash', [height]);
  }

  /**
   * Получение количества блоков
   */
  async getBlockCount(): Promise<number> {
    return this.rpcCall<number>('getblockcount');
  }

  /**
   * Импорт адреса для отслеживания
   */
  async importAddress(address: string, label?: string, rescan: boolean = false): Promise<void> {
    const params: any[] = [address];
    if (label !== undefined) params.push(label);
    if (rescan !== undefined) params.push(rescan);
    
    await this.rpcCall('importaddress', params);
  }

  /**
   * Мониторинг новых блоков Dash
   */
  async waitForNewBlock(timeout: number = 60000): Promise<any> {
    return this.rpcCall('waitfornewblock', [timeout / 1000]);
  }

  /**
   * Получение информации о квораме (для ChainLocks)
   */
  async getQuorumInfo(quorumType: number, quorumHash: string): Promise<any> {
    return this.rpcCall('quorum', ['info', quorumType, quorumHash]);
  }

  /**
   * Получение списка квораумов
   */
  async listQuorums(count?: number): Promise<any> {
    const params: any[] = count ? [count] : [];
    return this.rpcCall('quorum', ['list', ...params]);
  }
}