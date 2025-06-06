const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');

class BitcoinNode {
    constructor() {
        this.rpcUrl = process.env.BTC_RPC_URL;
        this.rpcAuth = {
            username: process.env.BTC_RPC_USER,
            password: process.env.BTC_RPC_PASSWORD
        };
    }

    async createAddress() {
        // Генерация нового адреса
        const keyPair = bitcoin.ECPair.makeRandom();
        const { address } = bitcoin.payments.p2pkh({ 
            pubkey: keyPair.publicKey 
        });
        return address;
    }

    async getBalance(address) {
        // Получение баланса адреса
        try {
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '1.0',
                method: 'getaddressinfo',
                params: [address]
            }, { auth: this.rpcAuth });
            
            return response.data.result;
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
}

module.exports = BitcoinNode;