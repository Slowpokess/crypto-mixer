import { Request, Response } from 'express';
interface CreateMixRequestBody {
    currency: CurrencyType;
    amount: number;
    outputAddresses: OutputAddress[];
    delay?: number;
}
interface OutputAddress {
    address: string;
    percentage: number;
}
interface GenerateDepositAddressBody {
    currency: CurrencyType;
}
type CurrencyType = 'BTC' | 'ETH' | 'USDT' | 'SOL';
interface FeeStructure {
    percentage: number;
    minimum: number;
    network: number;
}
interface FeeResponse {
    [key: string]: FeeStructure;
}
interface StatusResponse {
    sessionId: string;
    status: string;
    confirmations: number;
    requiredConfirmations: number;
    createdAt: Date;
    completedAt: Date | null;
}
interface DepositAddressResponse {
    currency: CurrencyType;
    depositAddress: string;
    expiresAt: Date;
}
interface MixResponseData {
    sessionId: string;
    depositAddress: string;
    amount: number;
    currency: CurrencyType;
    fee: number;
    expiresAt: Date;
    status: string;
}
interface ErrorResponse {
    error: string;
}
declare class MixController {
    constructor();
    createMixRequest(req: Request<{}, MixResponseData | ErrorResponse, CreateMixRequestBody>, res: Response<MixResponseData | ErrorResponse>): Promise<void>;
    getStatus(req: Request<{
        sessionId: string;
    }, StatusResponse | ErrorResponse>, res: Response<StatusResponse | ErrorResponse>): Promise<void>;
    generateDepositAddress(req: Request<{}, DepositAddressResponse | ErrorResponse, GenerateDepositAddressBody>, res: Response<DepositAddressResponse | ErrorResponse>): Promise<void>;
    getFees(req: Request, res: Response<FeeResponse | ErrorResponse>): Promise<void>;
    private getLimits;
    private calculateFee;
    private generateAddress;
    private getRequiredConfirmations;
    private getRandomDelay;
}
declare const _default: MixController;
export default _default;
