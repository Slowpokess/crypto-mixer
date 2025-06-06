import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { Database } from '../database/connection';
import { HSMManager } from '../security/hsm.manager';
import { EncryptionService } from '../security/encryption.service';
import { Logger } from '../utils/logger';

export class WalletManager {
  private db: Database;
  private hsmManager: HSMManager | null;
  private encryptionService: EncryptionService;
  private logger: Logger;

  constructor(db: Database, hsmManager: HSMManager | null = null) {
    this.db = db;
    this.hsmManager = hsmManager;
    this.encryptionService = new EncryptionService();
    this.logger = new Logger('WalletManager');
  }

  public async createWallet(currency: string, type: string): Promise<any> {
    let address: string;
    let privateKey: string;

    switch (currency) {
      case 'BTC':
        const btcWallet = await this.createBitcoinWallet();
        address = btcWallet.address;
        privateKey = btcWallet.privateKey;
        break;

      case 'ETH':
      case 'USDT_ERC20':
        const ethWallet = await this.createEthereumWallet();
        address = ethWallet.address;
        privateKey = ethWallet.privateKey;
        break;

      case 'SOL':
        const solWallet = await this.createSolanaWallet();
        address = solWallet.address;
        privateKey = solWallet.privateKey;
        break;

      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }

    const encryptedPrivateKey = await this.encryptPrivateKey(privateKey);

    const query = `
      INSERT INTO wallets (currency, address, private_key_encrypted, wallet_type, active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, address
    `;

    const result = await this.db.query(query, [
      currency,
      address,
      encryptedPrivateKey,
      type,
    ]);

    this.logger.info(`Created ${currency} wallet: ${address}`);

    return result.rows[0];
  }

  public async createMultipleWallets(
    currency: string,
    type: string,
    count: number
  ): Promise<void> {
    this.logger.info(`Creating ${count} ${currency} wallets of type ${type}`);

    const wallets = [];
    for (let i = 0; i < count; i++) {
      try {
        const wallet = await this.createWallet(currency, type);
        wallets.push(wallet);
      } catch (error) {
        this.logger.error(`Error creating wallet ${i + 1}/${count}:`, error);
      }
    }

    this.logger.info(`Successfully created ${wallets.length} wallets`);
  }

  private async createBitcoinWallet(): Promise<{ address: string; privateKey: string }> {
    if (this.hsmManager) {
      const keyId = await this.hsmManager.generateKey('secp256k1');
      const publicKey = await this.hsmManager.getPublicKey(keyId);
      
      const { address } = bitcoin.payments.p2pkh({
        pubkey: Buffer.from(publicKey, 'hex'),
        network: bitcoin.networks.bitcoin,
      });

      return {
        address: address!,
        privateKey: `hsm:${keyId}`,
      };
    } else {
      const keyPair = bitcoin.ECPair.makeRandom();
      const { address } = bitcoin.payments.p2pkh({
        pubkey: keyPair.publicKey,
        network: bitcoin.networks.bitcoin,
      });

      return {
        address: address!,
        privateKey: keyPair.toWIF(),
      };
    }
  }

  private async createEthereumWallet(): Promise<{ address: string; privateKey: string }> {
    if (this.hsmManager) {
      const keyId = await this.hsmManager.generateKey('secp256k1');
      const publicKey = await this.hsmManager.getPublicKey(keyId);
      
      const publicKeyBuffer = Buffer.from(publicKey, 'hex');
      const address = ethers.computeAddress(publicKeyBuffer);

      return {
        address,
        privateKey: `hsm:${keyId}`,
      };
    } else {
      const wallet = ethers.Wallet.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    }
  }

  private async createSolanaWallet(): Promise<{ address: string; privateKey: string }> {
    if (this.hsmManager) {
      const keyId = await this.hsmManager.generateKey('ed25519');
      const publicKey = await this.hsmManager.getPublicKey(keyId);
      
      return {
        address: publicKey,
        privateKey: `hsm:${keyId}`,
      };
    } else {
      const keypair = Keypair.generate();
      return {
        address: keypair.publicKey.toBase58(),
        privateKey: Buffer.from(keypair.secretKey).toString('base64'),
      };
    }
  }

  private async encryptPrivateKey(privateKey: string): Promise<string> {
    if (privateKey.startsWith('hsm:')) {
      return privateKey;
    }

    return await this.encryptionService.encrypt(privateKey);
  }

  public async signTransaction(walletId: string, transaction: any): Promise<any> {
    const query = 'SELECT * FROM wallets WHERE id = $1';
    const result = await this.db.query(query, [walletId]);
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    const wallet = result.rows[0];
    const privateKey = await this.decryptPrivateKey(wallet.private_key_encrypted);

    switch (wallet.currency) {
      case 'BTC':
        return await this.signBitcoinTransaction(transaction, privateKey);
      case 'ETH':
      case 'USDT_ERC20':
        return await this.signEthereumTransaction(transaction, privateKey);
      case 'SOL':
        return await this.signSolanaTransaction(transaction, privateKey);
      default:
        throw new Error(`Unsupported currency: ${wallet.currency}`);
    }
  }

  private async decryptPrivateKey(encryptedKey: string): Promise<string> {
    if (encryptedKey.startsWith('hsm:')) {
      return encryptedKey;
    }

    return await this.encryptionService.decrypt(encryptedKey);
  }

  private async signBitcoinTransaction(tx: any, privateKey: string): Promise<any> {
    if (privateKey.startsWith('hsm:')) {
      const keyId = privateKey.substring(4);
      const signature = await this.hsmManager!.sign(keyId, tx.hash);
      return { ...tx, signature };
    } else {
      return tx;
    }
  }

  private async signEthereumTransaction(tx: any, privateKey: string): Promise<any> {
    if (privateKey.startsWith('hsm:')) {
      const keyId = privateKey.substring(4);
      const signature = await this.hsmManager!.sign(keyId, tx.hash);
      return { ...tx, signature };
    } else {
      const wallet = new ethers.Wallet(privateKey);
      return await wallet.signTransaction(tx);
    }
  }

  private async signSolanaTransaction(tx: any, privateKey: string): Promise<any> {
    if (privateKey.startsWith('hsm:')) {
      const keyId = privateKey.substring(4);
      const signature = await this.hsmManager!.sign(keyId, tx.hash);
      return { ...tx, signature };
    } else {
      return tx;
    }
  }

  public async getWalletBalances(currency: string): Promise<any> {
    const query = `
      SELECT 
        wallet_type,
        COUNT(*) as count,
        SUM(balance) as total_balance,
        AVG(balance) as avg_balance
      FROM wallets
      WHERE currency = $1 AND active = true
      GROUP BY wallet_type
    `;

    const result = await this.db.query(query, [currency]);
    return result.rows;
  }

  public async updateBalance(address: string, currency: string, balance: number): Promise<void> {
    const query = `
      UPDATE wallets 
      SET balance = $1, updated_at = NOW() 
      WHERE address = $2 AND currency = $3
    `;

    await this.db.query(query, [balance, address, currency]);
  }

  public async rotateWallet(walletId: string): Promise<any> {
    const oldWallet = await this.getWallet(walletId);
    const newWallet = await this.createWallet(oldWallet.currency, oldWallet.wallet_type);

    await this.deactivateWallet(walletId);
    await this.logRotation(walletId, newWallet.id);

    return newWallet;
  }

  private async getWallet(walletId: string): Promise<any> {
    const query = 'SELECT * FROM wallets WHERE id = $1';
    const result = await this.db.query(query, [walletId]);
    
    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    return result.rows[0];
  }

  private async deactivateWallet(walletId: string): Promise<void> {
    const query = `
      UPDATE wallets 
      SET active = false, updated_at = NOW() 
      WHERE id = $1
    `;

    await this.db.query(query, [walletId]);
  }

  private async logRotation(oldWalletId: string, newWalletId: string): Promise<void> {
    const query = `
      INSERT INTO wallet_rotations (old_wallet_id, new_wallet_id, rotated_at)
      VALUES ($1, $2, NOW())
    `;

    await this.db.query(query, [oldWalletId, newWalletId]);
  }
}