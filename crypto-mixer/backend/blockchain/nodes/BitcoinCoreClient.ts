import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import logger from '../../utils/logger';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Интерфейсы для Bitcoin Core RPC API
 */
interface BitcoinRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: any[];
}

interface BitcoinRpcResponse<T = any> {
  result: T;
  error: any;
  id: string | number;
}

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
  scanning: boolean | { duration: number; progress: number; };
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
export class BitcoinCoreClient {
  private config: BitcoinCoreConfig;
  private httpClient: AxiosInstance;
  private requestId: number = 0;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: BitcoinCoreConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ssl: false,
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
        'User-Agent': 'CryptoMixer-BitcoinCore/1.0'
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
   * Выполнение RPC запроса к Bitcoin Core
   */
  private async rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
    const requestId = ++this.requestId;
    
    const request: BitcoinRpcRequest = {
      jsonrpc: '1.0',
      id: requestId,
      method,
      params
    };

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const url = this.config.wallet ? `/wallet/${this.config.wallet}` : '/';
        const response: AxiosResponse<BitcoinRpcResponse<T>> = await this.httpClient.post(url, request);
        
        if (response.data.error) {
          throw new Error(`Bitcoin RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this.isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this.isConnected = false;
        
        logger.warn(`Bitcoin RPC attempt ${attempt} failed`, {
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

    logger.error('Bitcoin RPC failed after all retries', {
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
        logger.warn('Bitcoin Core health check failed', { error });
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
   * Получение информации о блокчейне
   */
  async getBlockchainInfo(): Promise<BlockchainInfo> {
    return this.rpcCall<BlockchainInfo>('getblockchaininfo');
  }

  /**
   * Получение сетевой информации
   */
  async getNetworkInfo(): Promise<NetworkInfo> {
    return this.rpcCall<NetworkInfo>('getnetworkinfo');
  }

  /**
   * Получение информации о мемпуле
   */
  async getMempoolInfo(): Promise<MempoolInfo> {
    return this.rpcCall<MempoolInfo>('getmempoolinfo');
  }

  /**
   * Получение информации о кошельке
   */
  async getWalletInfo(): Promise<WalletInfo> {
    return this.rpcCall<WalletInfo>('getwalletinfo');
  }

  /**
   * Создание нового адреса
   */
  async getNewAddress(label?: string, addressType: 'legacy' | 'p2sh-segwit' | 'bech32' = 'bech32'): Promise<string> {
    const params = label ? [label, addressType] : [undefined, addressType];
    return this.rpcCall<string>('getnewaddress', params.filter(p => p !== undefined));
  }

  /**
   * Получение информации об адресе
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    return this.rpcCall<AddressInfo>('getaddressinfo', [address]);
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
  async listUnspent(minConfirmations: number = 1, maxConfirmations: number = 9999999, addresses?: string[]): Promise<UTXO[]> {
    const params: any[] = [minConfirmations, maxConfirmations];
    if (addresses) {
      params.push(addresses);
    }
    return this.rpcCall<UTXO[]>('listunspent', params);
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(txid: string, includeWatchonly: boolean = false): Promise<Transaction> {
    return this.rpcCall<Transaction>('gettransaction', [txid, includeWatchonly]);
  }

  /**
   * Получение необработанной транзакции
   */
  async getRawTransaction(txid: string, verbose: boolean = true): Promise<Transaction | string> {
    return this.rpcCall<Transaction | string>('getrawtransaction', [txid, verbose]);
  }

  /**
   * Отправка необработанной транзакции
   */
  async sendRawTransaction(hexString: string, maxFeeRate?: number): Promise<string> {
    const params = maxFeeRate ? [hexString, maxFeeRate] : [hexString];
    return this.rpcCall<string>('sendrawtransaction', params);
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
  async signRawTransactionWithWallet(hexString: string): Promise<{ hex: string; complete: boolean }> {
    return this.rpcCall<{ hex: string; complete: boolean }>('signrawtransactionwithwallet', [hexString]);
  }

  /**
   * Отправка средств на адрес
   */
  async sendToAddress(address: string, amount: number, comment?: string, commentTo?: string, subtractFeeFromAmount: boolean = false): Promise<string> {
    const params: any[] = [address, amount];
    if (comment) params.push(comment);
    if (commentTo) params.push(commentTo);
    if (subtractFeeFromAmount) params.push(subtractFeeFromAmount);
    
    return this.rpcCall<string>('sendtoaddress', params);
  }

  /**
   * Оценка комиссии для транзакции
   */
  async estimateSmartFee(confirmationTarget: number, estimateMode: 'UNSET' | 'ECONOMICAL' | 'CONSERVATIVE' = 'CONSERVATIVE'): Promise<{ feerate?: number; blocks: number }> {
    return this.rpcCall<{ feerate?: number; blocks: number }>('estimatesmartfee', [confirmationTarget, estimateMode]);
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
  async importAddress(address: string, label?: string, rescan: boolean = false, p2sh: boolean = false): Promise<void> {
    const params: any[] = [address];
    if (label !== undefined) params.push(label);
    if (rescan !== undefined) params.push(rescan);
    if (p2sh !== undefined) params.push(p2sh);
    
    await this.rpcCall('importaddress', params);
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
  }> {
    try {
      const [blockchainInfo, networkInfo, mempoolInfo] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getMempoolInfo()
      ]);

      return {
        isConnected: this.isConnected,
        lastHealthCheck: this.lastHealthCheck,
        currentBlockHeight: blockchainInfo.blocks,
        mempoolSize: mempoolInfo.size,
        connectionCount: networkInfo.connections
      };
    } catch (error) {
      logger.error('Failed to get Bitcoin Core performance stats', { error });
      throw error;
    }
  }
}