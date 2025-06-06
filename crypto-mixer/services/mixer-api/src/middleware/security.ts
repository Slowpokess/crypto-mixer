import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

export interface SecurityRequest extends Request {
  security?: {
    riskScore: number;
    flags: string[];
  };
}

export class SecurityMiddleware {
  private static logger = new Logger('SecurityMiddleware');

  static validateRequest = (
    req: SecurityRequest,
    res: Response,
    next: NextFunction
  ): void => {
    try {
      // Initialize security context
      req.security = {
        riskScore: 0,
        flags: []
      };

      // Check for suspicious patterns
      SecurityMiddleware.checkSuspiciousPatterns(req);
      
      // Validate headers
      SecurityMiddleware.validateHeaders(req);
      
      // Check IP reputation (placeholder)
      SecurityMiddleware.checkIPReputation(req);
      
      // Log security assessment
      if (req.security.riskScore > 50) {
        SecurityMiddleware.logger.warn('High risk request detected', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          riskScore: req.security.riskScore,
          flags: req.security.flags,
          path: req.path
        });
      }

      // Block if risk score is too high
      if (req.security.riskScore > 80) {
        return res.status(403).json({
          error: 'Request blocked due to security policy',
          code: 'SECURITY_BLOCK'
        });
      }

      next();
    } catch (error) {
      SecurityMiddleware.logger.error('Security validation failed', error as Error);
      next(error);
    }
  };

  private static checkSuspiciousPatterns(req: SecurityRequest): void {
    const userAgent = req.get('User-Agent') || '';
    const path = req.path;
    const query = req.query;

    // Check for bot patterns
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i
    ];

    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      req.security!.riskScore += 30;
      req.security!.flags.push('BOT_USER_AGENT');
    }

    // Check for SQL injection patterns
    const sqlPatterns = [
      /('|(\\')|(;)|(\\;)|(\|)|(\*)|(%)|(\+)|(--)|(\s)|(/\*)|(\*/)|(@)|(\||;)/,
      /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i
    ];

    const queryString = JSON.stringify(query);
    if (sqlPatterns.some(pattern => pattern.test(queryString))) {
      req.security!.riskScore += 50;
      req.security!.flags.push('SQL_INJECTION_ATTEMPT');
    }

    // Check for XSS patterns
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i
    ];

    if (xssPatterns.some(pattern => pattern.test(queryString))) {
      req.security!.riskScore += 40;
      req.security!.flags.push('XSS_ATTEMPT');
    }

    // Check for path traversal
    if (path.includes('../') || path.includes('..\\')) {
      req.security!.riskScore += 60;
      req.security!.flags.push('PATH_TRAVERSAL');
    }
  }

  private static validateHeaders(req: SecurityRequest): void {
    // Check for missing or suspicious headers
    const userAgent = req.get('User-Agent');
    const referer = req.get('Referer');
    const origin = req.get('Origin');

    if (!userAgent) {
      req.security!.riskScore += 20;
      req.security!.flags.push('MISSING_USER_AGENT');
    }

    // Check for too many headers (potential header pollution)
    if (Object.keys(req.headers).length > 50) {
      req.security!.riskScore += 15;
      req.security!.flags.push('EXCESSIVE_HEADERS');
    }

    // Check for suspicious header values
    const suspiciousHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-originating-ip'
    ];

    suspiciousHeaders.forEach(header => {
      const value = req.get(header);
      if (value && value.split(',').length > 5) {
        req.security!.riskScore += 10;
        req.security!.flags.push('SUSPICIOUS_PROXY_CHAIN');
      }
    });
  }

  private static checkIPReputation(req: SecurityRequest): void {
    const ip = req.ip;
    
    // Placeholder for IP reputation check
    // In production, this would integrate with threat intelligence services
    
    // Check for private/local IPs being forwarded
    const privateIPPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^localhost$/i
    ];

    if (privateIPPatterns.some(pattern => pattern.test(ip))) {
      const xForwardedFor = req.get('X-Forwarded-For');
      if (xForwardedFor) {
        req.security!.riskScore += 5;
        req.security!.flags.push('PRIVATE_IP_FORWARDED');
      }
    }

    // Check for Tor exit nodes (placeholder)
    // In production, this would check against known Tor exit node lists
    if (req.get('X-Tor-Exit-Node')) {
      req.security!.riskScore += 25;
      req.security!.flags.push('TOR_EXIT_NODE');
    }
  }

  static rateLimitByIP = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      const ip = req.ip;
      const now = Date.now();
      const requestData = requests.get(ip);

      if (!requestData || now > requestData.resetTime) {
        requests.set(ip, { count: 1, resetTime: now + windowMs });
        next();
        return;
      }

      if (requestData.count >= maxRequests) {
        SecurityMiddleware.logger.warn('Rate limit exceeded', {
          ip,
          count: requestData.count,
          maxRequests
        });

        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
        });
        return;
      }

      requestData.count++;
      next();
    };
  };

  static requireHTTPS = (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'production' && !req.secure && req.get('X-Forwarded-Proto') !== 'https') {
      return res.redirect(301, `https://${req.get('Host')}${req.url}`);
    }
    next();
  };

  static sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
    // Basic input sanitization
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                  .replace(/javascript:/gi, '')
                  .replace(/on\w+\s*=/gi, '');
      }
      if (typeof obj === 'object' && obj !== null) {
        const sanitized: any = {};
        for (const key in obj) {
          sanitized[key] = sanitize(obj[key]);
        }
        return sanitized;
      }
      return obj;
    };

    if (req.body) {
      req.body = sanitize(req.body);
    }
    if (req.query) {
      req.query = sanitize(req.query);
    }
    if (req.params) {
      req.params = sanitize(req.params);
    }

    next();
  };
}