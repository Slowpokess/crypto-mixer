import { Model } from 'sequelize';
interface DepositAddressAttributes {
    id: string;
    mix_request_id: string;
    currency: 'BTC' | 'ETH' | 'USDT' | 'SOL';
    address: string;
    private_key_encrypted: string;
    encryption_iv: string;
    used: boolean;
    first_used_at?: Date;
    derivation_path?: string;
    address_index?: number;
    metadata?: object;
    expired_at: Date;
    created_at: Date;
    updated_at: Date;
}
declare class DepositAddress extends Model<DepositAddressAttributes> implements DepositAddressAttributes {
    id: string;
    mix_request_id: string;
    currency: 'BTC' | 'ETH' | 'USDT' | 'SOL';
    address: string;
    private_key_encrypted: string;
    encryption_iv: string;
    used: boolean;
    first_used_at?: Date;
    derivation_path?: string;
    address_index?: number;
    metadata?: object;
    expired_at: Date;
    created_at: Date;
    updated_at: Date;
    encryptPrivateKey(privateKey: string, encryptionKey: string): string;
    decryptPrivateKey(encryptionKey: string): string;
    markAsUsed(): Promise<void>;
    isValidForCurrency(): boolean;
    static findByAddress(address: string): Promise<DepositAddress | null>;
    static findUnusedByCurrency(currency: string, limit?: number): Promise<DepositAddress[]>;
    static generateNextIndex(currency: string): Promise<number>;
    static getUsageStats(): Promise<{
        [key: string]: {
            total: number;
            used: number;
            unused: number;
            usage_percentage: number;
        };
    }>;
    static createSecure(data: {
        privateKey: string;
        currency: string;
        address: string;
        mix_request_id: string;
        [key: string]: any;
    }, encryptionKey: string, transaction?: any): Promise<DepositAddress>;
}
export { DepositAddress };
declare const _default: (sequelizeInstance: any) => typeof DepositAddress;
export default _default;
