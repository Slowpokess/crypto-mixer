import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import axios, { AxiosResponse, AxiosBasicCredentials } from 'axios';

// Initialize ECPair with secp256k1 library
const ECPair = ECPairFactory(ecc);

interface RpcAuth {
    username: string;
    password: string;
}

class BitcoinNode {
    private rpcUrl: string | undefined;
    private rpcAuth: RpcAuth;

    constructor() {
        this.rpcUrl = process.env.BTC_RPC_URL;
        this.rpcAuth = {
            username: process.env.BTC_RPC_USER || '',
            password: process.env.BTC_RPC_PASSWORD || ''
        };
    }

    async createAddress(): Promise<string> {
        const keyPair = ECPair.makeRandom();
        const { address } = bitcoin.payments.p2pkh({ 
            pubkey: keyPair.publicKey 
        });
        return address!;
    }

    async getBalance(address: string): Promise<any> {
        try {
            const response: AxiosResponse = await axios.post(this.rpcUrl!, {
                jsonrpc: '1.0',
                method: 'getaddressinfo',
                params: [address]
            }, { auth: this.rpcAuth as AxiosBasicCredentials });
            
            return response.data.result;
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
}

export default BitcoinNode;