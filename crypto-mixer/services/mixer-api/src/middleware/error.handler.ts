import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class ErrorHandler {
  private static logger = new Logger('ErrorHandler');

  static handle = (
    error: AppError,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let details: any = {};

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation Error';
      details = { validation: error.message };
    } else if (error.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized';
    } else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid data format';
    } else if (error.name === 'MongoError' && (error as any).code === 11000) {
      statusCode = 409;
      message = 'Duplicate resource';
    }

    // Log error
    ErrorHandler.logger.error(
      `${req.method} ${req.originalUrl} - ${statusCode} - ${message}`,
      error,
      {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode,
        stack: error.stack
      }
    );

    // Don't expose stack trace in production
    const response: any = {
      error: {
        message,
        statusCode,
        ...(Object.keys(details).length > 0 && { details }),
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      },
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    };

    res.status(statusCode).json(response);
  };

  static notFound = (req: Request, res: Response, next: NextFunction): void => {
    const error: AppError = new Error(`Not Found - ${req.originalUrl}`);
    error.statusCode = 404;
    error.isOperational = true;
    next(error);
  };

  static asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  static createError = (
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ): AppError => {
    const error: AppError = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = isOperational;
    return error;
  };

  static handleUncaughtException = (error: Error): void => {
    ErrorHandler.logger.error('Uncaught Exception', error);
    process.exit(1);
  };

  static handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
    ErrorHandler.logger.error('Unhandled Rejection', new Error(reason), {
      promise: promise.toString()
    });
    process.exit(1);
  };

  static setupGlobalHandlers = (): void => {
    process.on('uncaughtException', ErrorHandler.handleUncaughtException);
    process.on('unhandledRejection', ErrorHandler.handleUnhandledRejection);
  };
}