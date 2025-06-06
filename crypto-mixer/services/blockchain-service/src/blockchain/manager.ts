import { BitcoinClient } from './clients/bitcoin.client';
import { EthereumClient } from './clients/ethereum.client';
import { SolanaClient } from './clients/solana.client';
import { TronClient } from './clients/tron.client';
import { Logger } from '../utils/logger';

export class BlockchainManager {
  private clients: Map<string, any>;
  private logger: Logger;

  constructor() {
    this.clients = new Map();
    this.logger = new Logger('BlockchainManager');
  }

  public async initialize(): Promise<void> {
    // Initialize Bitcoin
    const btcClient = new BitcoinClient({
      host: process.env.BTC_NODE_HOST || 'localhost',
      port: parseInt(process.env.BTC_NODE_PORT || '8332'),
      username: process.env.BTC_RPC_USER || '',
      password: process.env.BTC_RPC_PASSWORD || '',
      network: process.env.BTC_NETWORK || 'mainnet',
    });
    await btcClient.connect();
    this.clients.set('BTC', btcClient);

    // Initialize Ethereum
    const ethClient = new EthereumClient({
      rpcUrl: process.env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_KEY',
      chainId: parseInt(process.env.ETH_CHAIN_ID || '1'),
    });
    await ethClient.connect();
    this.clients.set('ETH', ethClient);

    // Initialize Solana
    const solClient = new SolanaClient({
      rpcUrl: process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
    });
    await solClient.connect();
    this.clients.set('SOL', solClient);

    // Initialize Tron
    const tronClient = new TronClient({
      fullNode: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
      solidityNode: process.env.TRON_SOLIDITY_NODE || 'https://api.trongrid.io',
      eventServer: process.env.TRON_EVENT_SERVER || 'https://api.trongrid.io',
    });
    await tronClient.connect();
    this.clients.set('TRX', tronClient);

    this.logger.info('All blockchain clients initialized');
  }

  public async getBalance(currency: string, address: string): Promise<string> {
    const client = this.clients.get(currency);
    if (!client) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    return await client.getBalance(address);
  }

  public async sendTransaction(
    currency: string,
    from: string,
    to: string,
    amount: string,
    privateKey: string
  ): Promise<string> {
    const client = this.clients.get(currency);
    if (!client) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    return await client.sendTransaction(from, to, amount, privateKey);
  }
}