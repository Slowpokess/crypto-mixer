import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import axios from 'axios';
import { Logger } from '../../utils/logger';

const ECPair = ECPairFactory(ecc);

interface BitcoinConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  network: string;
}

export class BitcoinClient {
  private config: BitcoinConfig;
  private network: bitcoin.Network;
  private logger: Logger;
  private rpcUrl: string;

  constructor(config: BitcoinConfig) {
    this.config = config;
    this.network = config.network === 'testnet' 
      ? bitcoin.networks.testnet 
      : bitcoin.networks.bitcoin;
    this.logger = new Logger('BitcoinClient');
    this.rpcUrl = `http://${config.host}:${config.port}`;
  }

  public async connect(): Promise<void> {
    try {
      const info = await this.rpcCall('getblockchaininfo', []);
      this.logger.info(`Connected to Bitcoin node. Height: ${info.blocks}`);
    } catch (error) {
      this.logger.error('Failed to connect to Bitcoin node:', error as Error);
      throw error;
    }
  }

  public async generateAddress(): Promise<{ address: string; privateKey: string }> {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: this.network 
    });

    return {
      address: address!,
      privateKey: keyPair.toWIF(),
    };
  }

  public async getBalance(address: string): Promise<string> {
    try {
      // Get UTXOs for address
      const utxos = await this.getUTXOs(address);
      const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
      return (balance / 100000000).toFixed(8); // Convert satoshi to BTC
    } catch (error) {
      this.logger.error('Error getting balance:', error as Error);
      throw error;
    }
  }

  public async sendTransaction(
    from: string,
    to: string,
    amount: string,
    privateKeyWIF: string
  ): Promise<string> {
    try {
      const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);
      const psbt = new bitcoin.Psbt({ network: this.network });
      
      // Get UTXOs
      const utxos = await this.getUTXOs(from);
      const amountSatoshi = Math.floor(parseFloat(amount) * 100000000);
      const feeRate = await this.estimateFeeRate();
      
      // Calculate required inputs
      let inputAmount = 0;
      const selectedUtxos = [];
      
      for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        inputAmount += utxo.value;
        
        if (inputAmount >= amountSatoshi + (feeRate * 250)) { // Estimate tx size ~250 bytes
          break;
        }
      }
      
      if (inputAmount < amountSatoshi) {
        throw new Error('Insufficient balance');
      }
      
      // Add inputs
      for (const utxo of selectedUtxos) {
        const txHex = await this.getRawTransaction(utxo.txid);
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          nonWitnessUtxo: Buffer.from(txHex, 'hex'),
        });
      }
      
      // Add outputs
      psbt.addOutput({
        address: to,
        value: amountSatoshi,
      });
      
      // Add change output if needed
      const fee = feeRate * 250;
      const change = inputAmount - amountSatoshi - fee;
      
      if (change > 546) { // Dust limit
        psbt.addOutput({
          address: from,
          value: change,
        });
      }
      
      // Sign all inputs
      for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, keyPair);
      }
      
      psbt.finalizeAllInputs();
      
      // Broadcast transaction
      const txHex = psbt.extractTransaction().toHex();
      const txid = await this.broadcastTransaction(txHex);
      
      this.logger.info(`Transaction sent: ${txid}`);
      return txid;
      
    } catch (error) {
      this.logger.error('Error sending transaction:', error as Error);
      throw error;
    }
  }

  private async getUTXOs(address: string): Promise<any[]> {
    const response = await this.rpcCall('scantxoutset', [
      'start',
      [`addr(${address})`]
    ]);
    
    return response.unspents || [];
  }

  private async getRawTransaction(txid: string): Promise<string> {
    return await this.rpcCall('getrawtransaction', [txid]);
  }

  private async broadcastTransaction(txHex: string): Promise<string> {
    return await this.rpcCall('sendrawtransaction', [txHex]);
  }

  private async estimateFeeRate(): Promise<number> {
    const estimate = await this.rpcCall('estimatesmartfee', [6]); // 6 blocks target
    return Math.floor(estimate.feerate * 100000000 / 1000); // BTC/KB to satoshi/byte
  }

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const response = await axios.post(
      this.rpcUrl,
      {
        jsonrpc: '1.0',
        id: Date.now(),
        method,
        params,
      },
      {
        auth: {
          username: this.config.username,
          password: this.config.password,
        },
      }
    );
    
    if (response.data.error) {
      throw new Error(response.data.error.message);
    }
    
    return response.data.result;
  }
}