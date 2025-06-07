import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// Request ID middleware for tracking
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = crypto.randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
};

// Request logging middleware for security auditing
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // XSS attempts
    /union.*select/i,  // SQL injection
    /javascript:/i,  // XSS
    /eval\(/i,  // Code injection
    /exec\(/i,  // Code injection
  ];
  
  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
    pattern.test(requestData) || pattern.test(req.url)
  );
  
  if (hasSuspiciousContent) {
    console.warn('🚨 SECURITY ALERT - Suspicious request detected:', {
      requestId: req.headers['x-request-id'],
      ip: clientIp,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      suspiciousContent: requestData
    });
  }
  
  // Log all requests for auditing
  console.log('📝 API Request:', {
    requestId: req.headers['x-request-id'],
    method: req.method,
    url: req.url,
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log('✅ API Response:', {
      requestId: req.headers['x-request-id'],
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

// Input validation for common attack vectors
export const inputSanitization = (req: Request, res: Response, next: NextFunction) => {
  const dangerous_patterns = [
    // SQL Injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    // Directory traversal
    /\.\.\/|\.\.\\|\.\.[\/\\]/g,
    // Command injection
    /[;&|`]/g
  ];
  
  const checkForDangerousContent = (obj: any, path: string = ''): boolean => {
    if (typeof obj === 'string') {
      return dangerous_patterns.some(pattern => pattern.test(obj));
    }
    
    if (Array.isArray(obj)) {
      return obj.some((item, index) => 
        checkForDangerousContent(item, `${path}[${index}]`)
      );
    }
    
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).some(([key, value]) => 
        checkForDangerousContent(value, path ? `${path}.${key}` : key)
      );
    }
    
    return false;
  };
  
  // Check body, query, and params for dangerous content
  const targets = [
    { data: req.body, name: 'body' },
    { data: req.query, name: 'query' },
    { data: req.params, name: 'params' }
  ];
  
  for (const target of targets) {
    if (target.data && checkForDangerousContent(target.data)) {
      console.error('🚨 SECURITY ALERT - Dangerous content detected:', {
        requestId: req.headers['x-request-id'],
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress,
        location: target.name,
        content: JSON.stringify(target.data),
        timestamp: new Date().toISOString()
      });
      
      return res.status(400).json({
        error: 'Invalid input detected'
      });
    }
  }
  
  next();
};

// CORS configuration for production
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // In production, replace with your actual frontend domains
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://yourdomain.com',
      'https://mixer.yourdomain.com'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('🚨 CORS violation attempt:', {
        origin,
        timestamp: new Date().toISOString()
      });
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};

// Timeout middleware to prevent resource exhaustion
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        console.warn('⏰ Request timeout:', {
          requestId: req.headers['x-request-id'],
          method: req.method,
          url: req.url,
          ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress,
          timeout: timeoutMs,
          timestamp: new Date().toISOString()
        });
        
        res.status(408).json({
          error: 'Request timeout'
        });
      }
    }, timeoutMs);
    
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    res.on('close', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
};

// HTTP method validation
export const allowedMethods = (methods: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!methods.includes(req.method)) {
      res.status(405).json({
        error: 'Method not allowed'
      });
      return;
    }
    next();
  };
};