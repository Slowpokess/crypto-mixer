"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = exports.requestSizeLimit = exports.botDetection = exports.addressRateLimit = exports.mixingRateLimit = exports.generalRateLimit = void 0;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
// General API rate limiter
const generalLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    keyPrefix: 'general',
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
    blockDuration: 60, // Block for 60 seconds if limit exceeded
});
// Strict rate limiter for mixing operations
const mixingLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    keyPrefix: 'mixing',
    points: 10, // Max 10 mixing requests
    duration: 3600, // Per hour
    blockDuration: 3600, // Block for 1 hour if limit exceeded
});
// Very strict rate limiter for address generation
const addressLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    keyPrefix: 'address',
    points: 5, // Max 5 address generations
    duration: 300, // Per 5 minutes
    blockDuration: 900, // Block for 15 minutes if limit exceeded
});
// Progressive penalty system for repeated violations
const penaltyLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    keyPrefix: 'penalty',
    points: 3, // Max 3 violations
    duration: 86400, // Per 24 hours
    blockDuration: 86400 * 7, // Block for 1 week after 3 violations
});
const getClientKey = (req) => {
    // Use forwarded IP if behind proxy, otherwise use connection IP
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    return ip || 'unknown';
};
const createRateLimitMiddleware = (limiter, limitType) => {
    return async (req, res, next) => {
        const key = getClientKey(req);
        try {
            await limiter.consume(key);
            next();
        }
        catch (rejRes) {
            // Log potential abuse
            console.warn(`Rate limit exceeded for ${limitType}:`, {
                ip: key,
                path: req.path,
                timestamp: new Date().toISOString(),
                remainingPoints: rejRes.remainingPoints || 0,
                msBeforeNext: rejRes.msBeforeNext || 0
            });
            // Check for repeated violations and apply penalty
            try {
                await penaltyLimiter.consume(key);
            }
            catch (penaltyRes) {
                console.error(`Penalty applied for repeated violations:`, {
                    ip: key,
                    penaltyDuration: penaltyRes.msBeforeNext / 1000 / 60 / 60, // hours
                    timestamp: new Date().toISOString()
                });
                res.status(429).json({
                    error: 'Account temporarily suspended due to repeated violations',
                    retryAfter: Math.round(penaltyRes.msBeforeNext / 1000)
                });
                return;
            }
            const retryAfter = Math.round(rejRes.msBeforeNext / 1000);
            res.set('Retry-After', retryAfter.toString());
            res.status(429).json({
                error: `Too many ${limitType} requests. Please try again later.`,
                retryAfter: retryAfter
            });
        }
    };
};
// Middleware exports
exports.generalRateLimit = createRateLimitMiddleware(generalLimiter, 'API');
exports.mixingRateLimit = createRateLimitMiddleware(mixingLimiter, 'mixing');
exports.addressRateLimit = createRateLimitMiddleware(addressLimiter, 'address generation');
// Advanced bot detection middleware
const botDetection = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const acceptHeader = req.headers['accept'] || '';
    // Check for common bot patterns
    const botPatterns = [
        /bot/i,
        /crawl/i,
        /spider/i,
        /scrape/i,
        /curl/i,
        /wget/i,
        /python/i,
        /requests/i
    ];
    const isSuspiciousBot = botPatterns.some(pattern => pattern.test(userAgent));
    // Check for missing or suspicious headers
    const hasSuspiciousHeaders = (!acceptHeader.includes('text/html') &&
        !acceptHeader.includes('application/json') &&
        !acceptHeader.includes('*/*')) || userAgent === '';
    if (isSuspiciousBot || hasSuspiciousHeaders) {
        console.warn('Suspicious bot detected:', {
            ip: getClientKey(req),
            userAgent,
            acceptHeader,
            path: req.path,
            timestamp: new Date().toISOString()
        });
        res.status(403).json({
            error: 'Access denied'
        });
        return;
    }
    next();
};
exports.botDetection = botDetection;
// Request size limiting middleware
const requestSizeLimit = (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxSize = 1024 * 1024; // 1MB
    if (contentLength > maxSize) {
        res.status(413).json({
            error: 'Request too large'
        });
        return;
    }
    next();
};
exports.requestSizeLimit = requestSizeLimit;
// Security headers middleware
const securityHeaders = (req, res, next) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    // Remove server signature
    res.removeHeader('X-Powered-By');
    next();
};
exports.securityHeaders = securityHeaders;
//# sourceMappingURL=rateLimiting.js.map