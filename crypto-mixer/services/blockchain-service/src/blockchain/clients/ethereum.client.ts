import { ethers } from 'ethers';
import { Logger } from '../../utils/logger';

interface EthereumConfig {
  rpcUrl: string;
  chainId: number;
}

export class EthereumClient {
  private provider: ethers.JsonRpcProvider;
  private config: EthereumConfig;
  private logger: Logger;

  constructor(config: EthereumConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.logger = new Logger('EthereumClient');
  }

  public async connect(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      this.logger.info(`Connected to Ethereum network: ${network.name} (${network.chainId})`);
    } catch (error) {
      this.logger.error('Failed to connect to Ethereum node:', error as Error);
      throw error;
    }
  }

  public async generateAddress(): Promise<{ address: string; privateKey: string }> {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  }

  public async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      this.logger.error('Error getting balance:', error as Error);
      throw error;
    }
  }

  public async sendTransaction(
    _from: string,
    to: string,
    amount: string,
    privateKey: string
  ): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      // Get current gas price
      const feeData = await this.provider.getFeeData();
      
      const transaction = {
        to,
        value: ethers.parseEther(amount),
        gasLimit: 21000, // Standard ETH transfer
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        type: 2, // EIP-1559
      };
      
      const tx = await wallet.sendTransaction(transaction);
      await tx.wait(); // Wait for confirmation
      
      this.logger.info(`Transaction sent: ${tx.hash}`);
      return tx.hash;
      
    } catch (error) {
      this.logger.error('Error sending transaction:', error as Error);
      throw error;
    }
  }

  public async getTokenBalance(
    tokenAddress: string,
    walletAddress: string
  ): Promise<string> {
    const abi = [
      'function balanceOf(address account) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ];
    
    const contract = new ethers.Contract(tokenAddress, abi, this.provider);
    const balance = await contract.balanceOf(walletAddress);
    const decimals = await contract.decimals();
    
    return ethers.formatUnits(balance, decimals);
  }

  public async sendToken(
    tokenAddress: string,
    _from: string,
    to: string,
    amount: string,
    privateKey: string
  ): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      const abi = [
        'function transfer(address to, uint256 value) returns (bool)',
        'function decimals() view returns (uint8)',
      ];
      
      const contract = new ethers.Contract(tokenAddress, abi, wallet);
      const decimals = await contract.decimals();
      const value = ethers.parseUnits(amount, decimals);
      
      const tx = await contract.transfer(to, value);
      await tx.wait();
      
      this.logger.info(`Token transfer sent: ${tx.hash}`);
      return tx.hash;
      
    } catch (error) {
      this.logger.error('Error sending token:', error as Error);
      throw error;
    }
  }
}