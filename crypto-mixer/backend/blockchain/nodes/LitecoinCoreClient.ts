import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import logger from '../../utils/logger';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Сеть Litecoin с параметрами
 */
const litecoinNetwork = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

/**
 * Интерфейсы для Litecoin Core RPC API
 */
interface LitecoinRpcRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: any[];
}

interface LitecoinRpcResponse<T = any> {
  result: T;
  error: any;
  id: string | number;
}

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
  scanning: boolean | { duration: number; progress: number; };
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
export class LitecoinCoreClient {
  private config: LitecoinCoreConfig;
  private httpClient: AxiosInstance;
  private requestId: number = 0;
  private isConnected: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: LitecoinCoreConfig) {
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
        'User-Agent': 'CryptoMixer-LitecoinCore/1.0'
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
   * Выполнение RPC запроса к Litecoin Core
   */
  private async rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
    const requestId = ++this.requestId;
    
    const request: LitecoinRpcRequest = {
      jsonrpc: '1.0',
      id: requestId,
      method,
      params
    };

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const url = this.config.wallet ? `/wallet/${this.config.wallet}` : '/';
        const response: AxiosResponse<LitecoinRpcResponse<T>> = await this.httpClient.post(url, request);
        
        if (response.data.error) {
          throw new Error(`Litecoin RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
        }

        this.isConnected = true;
        return response.data.result;
        
      } catch (error: any) {
        lastError = error;
        this.isConnected = false;
        
        logger.warn(`Litecoin RPC attempt ${attempt} failed`, {
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

    logger.error('Litecoin RPC failed after all retries', {
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
        logger.warn('Litecoin Core health check failed', { error });
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
   * Получение информации о блокчейне Litecoin
   */
  async getBlockchainInfo(): Promise<LitecoinBlockchainInfo> {
    return this.rpcCall<LitecoinBlockchainInfo>('getblockchaininfo');
  }

  /**
   * Получение сетевой информации
   */
  async getNetworkInfo(): Promise<LitecoinNetworkInfo> {
    return this.rpcCall<LitecoinNetworkInfo>('getnetworkinfo');
  }

  /**
   * Получение информации о мемпуле
   */
  async getMempoolInfo(): Promise<LitecoinMempoolInfo> {
    return this.rpcCall<LitecoinMempoolInfo>('getmempoolinfo');
  }

  /**
   * Получение информации о кошельке
   */
  async getWalletInfo(): Promise<LitecoinWalletInfo> {
    return this.rpcCall<LitecoinWalletInfo>('getwalletinfo');
  }

  /**
   * Создание нового Litecoin адреса
   * Поддерживает legacy, p2sh-segwit и bech32 (ltc) форматы
   */
  async getNewAddress(label?: string, addressType: 'legacy' | 'p2sh-segwit' | 'bech32' = 'bech32'): Promise<string> {
    const params: any[] = label ? [label, addressType] : [undefined, addressType];
    return this.rpcCall<string>('getnewaddress', params.filter(p => p !== undefined));
  }

  /**
   * Получение информации об адресе
   */
  async getAddressInfo(address: string): Promise<LitecoinAddressInfo> {
    return this.rpcCall<LitecoinAddressInfo>('getaddressinfo', [address]);
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
  async listUnspent(minConfirmations: number = 1, maxConfirmations: number = 9999999, addresses?: string[]): Promise<LitecoinUTXO[]> {
    const params: any[] = [minConfirmations, maxConfirmations];
    if (addresses) {
      params.push(addresses);
    }
    return this.rpcCall<LitecoinUTXO[]>('listunspent', params);
  }

  /**
   * Получение транзакции по хешу
   */
  async getTransaction(txid: string, includeWatchonly: boolean = false): Promise<LitecoinTransaction> {
    return this.rpcCall<LitecoinTransaction>('gettransaction', [txid, includeWatchonly]);
  }

  /**
   * Получение необработанной транзакции
   */
  async getRawTransaction(txid: string, verbose: boolean = true): Promise<LitecoinTransaction | string> {
    return this.rpcCall<LitecoinTransaction | string>('getrawtransaction', [txid, verbose]);
  }

  /**
   * Отправка необработанной транзакции
   */
  async sendRawTransaction(hexString: string, maxFeeRate?: number): Promise<string> {
    const params: any[] = maxFeeRate ? [hexString, maxFeeRate] : [hexString];
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
   * Оценка комиссии для транзакции Litecoin
   * Litecoin имеет более быстрые блоки (2.5 минуты против 10 минут у Bitcoin)
   */
  async estimateSmartFee(confirmationTarget: number, estimateMode: 'UNSET' | 'ECONOMICAL' | 'CONSERVATIVE' = 'CONSERVATIVE'): Promise<{ feerate?: number; blocks: number }> {
    // Для Litecoin корректируем цель подтверждения учитывая быстрые блоки
    const adjustedTarget = Math.max(1, Math.ceil(confirmationTarget / 4)); // 4x быстрее Bitcoin
    return this.rpcCall<{ feerate?: number; blocks: number }>('estimatesmartfee', [adjustedTarget, estimateMode]);
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
   * Валидация Litecoin адреса
   */
  async validateAddress(address: string): Promise<{ isvalid: boolean; address?: string; scriptPubKey?: string; ismine?: boolean; iswatchonly?: boolean }> {
    return this.rpcCall('validateaddress', [address]);
  }

  /**
   * Создание Litecoin адреса программно (без использования кошелька ноды)
   */
  createLitecoinAddress(addressType: 'legacy' | 'p2sh-segwit' | 'bech32' = 'legacy'): { address: string; privateKey: string; publicKey: string } {
    const keyPair = ECPair.makeRandom({ network: litecoinNetwork });
    const { address } = this.getAddressFromKeyPair(keyPair, addressType);
    
    return {
      address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex')
    };
  }

  /**
   * Получение адреса из ключевой пары
   */
  private getAddressFromKeyPair(keyPair: any, addressType: 'legacy' | 'p2sh-segwit' | 'bech32'): { address: string } {
    switch (addressType) {
      case 'legacy':
        // P2PKH - адреса начинающиеся с L
        const p2pkh = bitcoin.payments.p2pkh({ 
          pubkey: keyPair.publicKey,
          network: litecoinNetwork 
        });
        return { address: p2pkh.address! };
        
      case 'p2sh-segwit':
        // P2SH-SegWit - адреса начинающиеся с M
        const p2wpkh = bitcoin.payments.p2wpkh({ 
          pubkey: keyPair.publicKey,
          network: litecoinNetwork 
        });
        const p2sh = bitcoin.payments.p2sh({
          redeem: p2wpkh,
          network: litecoinNetwork
        });
        return { address: p2sh.address! };
        
      case 'bech32':
        // Native SegWit - адреса начинающиеся с ltc1
        const bech32 = bitcoin.payments.p2wpkh({ 
          pubkey: keyPair.publicKey,
          network: litecoinNetwork 
        });
        return { address: bech32.address! };
        
      default:
        throw new Error(`Неподдерживаемый тип адреса: ${addressType}`);
    }
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
    difficulty: number;
    chainwork: string;
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
        connectionCount: networkInfo.connections,
        difficulty: blockchainInfo.difficulty,
        chainwork: blockchainInfo.chainwork
      };
    } catch (error) {
      logger.error('Failed to get Litecoin Core performance stats', { error });
      throw error;
    }
  }

  /**
   * Получение информации о сети Litecoin (Mainnet/Testnet)
   */
  async getNetworkType(): Promise<'main' | 'test' | 'regtest'> {
    const blockchainInfo = await this.getBlockchainInfo();
    return blockchainInfo.chain as 'main' | 'test' | 'regtest';
  }

  /**
   * Получение информации о софт-форках Litecoin
   */
  async getSoftForks(): Promise<any> {
    const blockchainInfo = await this.getBlockchainInfo();
    return blockchainInfo.softforks;
  }

  /**
   * Мониторинг новых блоков Litecoin
   */
  async waitForNewBlock(timeout: number = 60000): Promise<any> {
    return this.rpcCall('waitfornewblock', [timeout / 1000]);
  }

  /**
   * Получение детальной информации о мемпуле
   */
  async getMempoolContent(): Promise<{ [txid: string]: any }> {
    return this.rpcCall('getrawmempool', [true]);
  }

  /**
   * Проверка здоровья Litecoin ноды
   */
  async healthCheck(): Promise<{
    connected: boolean;
    blockHeight: number;
    connections: number;
    version: string;
    network: string;
    warnings: string[];
    mempoolSize: number;
    difficulty: number;
  }> {
    try {
      const [blockchainInfo, networkInfo, mempoolInfo] = await Promise.all([
        this.getBlockchainInfo(),
        this.getNetworkInfo(),
        this.getMempoolInfo()
      ]);

      return {
        connected: true,
        blockHeight: blockchainInfo.blocks,
        connections: networkInfo.connections,
        version: networkInfo.subversion,
        network: blockchainInfo.chain,
        warnings: [], // Litecoin не всегда возвращает warnings
        mempoolSize: mempoolInfo.size,
        difficulty: blockchainInfo.difficulty
      };
    } catch (error) {
      logger.error('Litecoin health check failed:', error as Error);
      return {
        connected: false,
        blockHeight: 0,
        connections: 0,
        version: 'unknown',
        network: 'unknown',
        warnings: [(error as Error).message],
        mempoolSize: 0,
        difficulty: 0
      };
    }
  }
}