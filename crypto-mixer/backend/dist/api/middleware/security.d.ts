import { Request, Response, NextFunction } from 'express';
export declare const requestId: (req: Request, res: Response, next: NextFunction) => void;
export declare const securityLogger: (req: Request, res: Response, next: NextFunction) => void;
export declare const inputSanitization: (req: Request, res: Response, next: NextFunction) => void;
export declare const corsConfig: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    credentials: boolean;
    optionsSuccessStatus: number;
    methods: string[];
    allowedHeaders: string[];
};
export declare const requestTimeout: (timeoutMs?: number) => (req: Request, res: Response, next: NextFunction) => void;
export declare const allowedMethods: (methods: string[]) => (req: Request, res: Response, next: NextFunction) => void;
