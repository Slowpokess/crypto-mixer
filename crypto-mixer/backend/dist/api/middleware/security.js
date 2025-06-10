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
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowedMethods = exports.requestTimeout = exports.corsConfig = exports.inputSanitization = exports.securityLogger = exports.requestId = void 0;
const crypto = __importStar(require("crypto"));
// Request ID middleware for tracking
const requestId = (req, res, next) => {
    const id = crypto.randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-ID', id);
    next();
};
exports.requestId = requestId;
// Request logging middleware for security auditing
const securityLogger = (req, res, next) => {
    const startTime = Date.now();
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    // Log suspicious patterns
    const suspiciousPatterns = [
        /\.\./, // Directory traversal
        /<script/i, // XSS attempts
        /union.*select/i, // SQL injection
        /javascript:/i, // XSS
        /eval\(/i, // Code injection
        /exec\(/i, // Code injection
    ];
    const requestData = JSON.stringify({
        body: req.body,
        query: req.query,
        params: req.params
    });
    const hasSuspiciousContent = suspiciousPatterns.some(pattern => pattern.test(requestData) || pattern.test(req.url));
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
exports.securityLogger = securityLogger;
// Input validation for common attack vectors
const inputSanitization = (req, res, next) => {
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
    const checkForDangerousContent = (obj, path = '') => {
        if (typeof obj === 'string') {
            return dangerous_patterns.some(pattern => pattern.test(obj));
        }
        if (Array.isArray(obj)) {
            return obj.some((item, index) => checkForDangerousContent(item, `${path}[${index}]`));
        }
        if (obj && typeof obj === 'object') {
            return Object.entries(obj).some(([key, value]) => checkForDangerousContent(value, path ? `${path}.${key}` : key));
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
                ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
                location: target.name,
                content: JSON.stringify(target.data),
                timestamp: new Date().toISOString()
            });
            res.status(400).json({
                error: 'Invalid input detected'
            });
            return;
        }
    }
    next();
};
exports.inputSanitization = inputSanitization;
// CORS configuration for production
exports.corsConfig = {
    origin: (origin, callback) => {
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
        }
        else {
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
const requestTimeout = (timeoutMs = 30000) => {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                console.warn('⏰ Request timeout:', {
                    requestId: req.headers['x-request-id'],
                    method: req.method,
                    url: req.url,
                    ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
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
exports.requestTimeout = requestTimeout;
// HTTP method validation
const allowedMethods = (methods) => {
    return (req, res, next) => {
        if (!methods.includes(req.method)) {
            res.status(405).json({
                error: 'Method not allowed'
            });
            return;
        }
        next();
    };
};
exports.allowedMethods = allowedMethods;
//# sourceMappingURL=security.js.map