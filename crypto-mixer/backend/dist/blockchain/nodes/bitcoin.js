"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const axios_1 = __importDefault(require("axios"));
// Initialize ECPair with secp256k1 library
const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
class BitcoinNode {
    constructor() {
        this.rpcUrl = process.env.BTC_RPC_URL;
        this.rpcAuth = {
            username: process.env.BTC_RPC_USER || '',
            password: process.env.BTC_RPC_PASSWORD || ''
        };
    }
    async createAddress() {
        const keyPair = ECPair.makeRandom();
        const { address } = bitcoin.payments.p2pkh({
            pubkey: keyPair.publicKey
        });
        return address;
    }
    async getBalance(address) {
        try {
            const response = await axios_1.default.post(this.rpcUrl, {
                jsonrpc: '1.0',
                method: 'getaddressinfo',
                params: [address]
            }, { auth: this.rpcAuth });
            return response.data.result;
        }
        catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
}
exports.default = BitcoinNode;
//# sourceMappingURL=bitcoin.js.map