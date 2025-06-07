import { Request, Response, NextFunction } from 'express';
export declare const generalRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const mixingRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const addressRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const botDetection: (req: Request, res: Response, next: NextFunction) => void;
export declare const requestSizeLimit: (req: Request, res: Response, next: NextFunction) => void;
export declare const securityHeaders: (req: Request, res: Response, next: NextFunction) => void;
