declare class BitcoinNode {
    private rpcUrl;
    private rpcAuth;
    constructor();
    createAddress(): Promise<string>;
    getBalance(address: string): Promise<any>;
}
export default BitcoinNode;
