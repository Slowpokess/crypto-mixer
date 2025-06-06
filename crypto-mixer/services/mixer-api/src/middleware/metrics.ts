import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { register, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export interface MetricsData {
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip: string;
  contentLength?: number;
}

export interface RequestMetrics extends Request {
  startTime?: number;
}

export class MetricsMiddleware {
  private static logger = new Logger('MetricsMiddleware');
  private static metrics: MetricsData[] = [];
  private static readonly MAX_METRICS = 10000; // Keep last 10k requests

  // Prometheus metrics
  private static httpRequestsTotal: Counter<string>;
  private static httpRequestDuration: Histogram<string>;
  private static initialized = false;

  static initialize(): void {
    if (MetricsMiddleware.initialized) return;

    // Collect default metrics
    collectDefaultMetrics({ register });

    // HTTP requests counter
    MetricsMiddleware.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    });

    // HTTP request duration histogram
    MetricsMiddleware.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [register],
    });

    MetricsMiddleware.initialized = true;
  }

  static track = (
    req: RequestMetrics,
    res: Response,
    next: NextFunction
  ): void => {
    MetricsMiddleware.initialize();
    req.startTime = Date.now();

    // Override res.end to capture metrics when response is sent
    const originalEnd = res.end.bind(res);
    res.end = function(chunk?: any, encoding?: any, _cb?: () => void) {
      const responseTime = Date.now() - (req.startTime || Date.now());
      const route = req.route?.path || req.path;
      
      const metricsData: MetricsData = {
        timestamp: new Date(),
        method: req.method,
        path: route,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get('User-Agent') || 'unknown',
        ip: req.ip || 'unknown',
        ...(res.get('Content-Length') && { contentLength: parseInt(res.get('Content-Length')!) })
      };

      // Store metrics
      MetricsMiddleware.addMetric(metricsData);

      // Update Prometheus metrics
      MetricsMiddleware.httpRequestsTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();

      MetricsMiddleware.httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(responseTime / 1000);

      // Log slow requests
      if (responseTime > 5000) { // 5 seconds
        MetricsMiddleware.logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          responseTime: `${responseTime}ms`,
          statusCode: res.statusCode
        });
      }

      // Log error responses
      if (res.statusCode >= 400) {
        MetricsMiddleware.logger.warn('Error response', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      }

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };

  private static addMetric(metric: MetricsData): void {
    MetricsMiddleware.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (MetricsMiddleware.metrics.length > MetricsMiddleware.MAX_METRICS) {
      MetricsMiddleware.metrics = MetricsMiddleware.metrics.slice(-MetricsMiddleware.MAX_METRICS);
    }
  }

  static getMetrics(): MetricsData[] {
    return [...MetricsMiddleware.metrics];
  }

  static getMetricsSummary(timeRangeMinutes: number = 60) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeRangeMinutes * 60 * 1000);
    
    const recentMetrics = MetricsMiddleware.metrics.filter(
      metric => metric.timestamp >= cutoff
    );

    if (recentMetrics.length === 0) {
      return {
        timeRange: `${timeRangeMinutes} minutes`,
        totalRequests: 0,
        averageResponseTime: 0,
        statusCodes: {},
        topPaths: [],
        slowestRequests: []
      };
    }

    // Calculate statistics
    const totalRequests = recentMetrics.length;
    const averageResponseTime = recentMetrics.reduce((sum, metric) => sum + metric.responseTime, 0) / totalRequests;

    // Status code distribution
    const statusCodes = recentMetrics.reduce((acc, metric) => {
      acc[metric.statusCode] = (acc[metric.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Top paths
    const pathCounts = recentMetrics.reduce((acc, metric) => {
      acc[metric.path] = (acc[metric.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topPaths = Object.entries(pathCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // Slowest requests
    const slowestRequests = recentMetrics
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10)
      .map(metric => ({
        path: metric.path,
        method: metric.method,
        responseTime: metric.responseTime,
        timestamp: metric.timestamp
      }));

    return {
      timeRange: `${timeRangeMinutes} minutes`,
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      statusCodes,
      topPaths,
      slowestRequests
    };
  }

  static getHealthMetrics() {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
    const recentMetrics = MetricsMiddleware.metrics.filter(
      metric => metric.timestamp >= last5Minutes
    );

    const errorCount = recentMetrics.filter(metric => metric.statusCode >= 400).length;
    const totalCount = recentMetrics.length;
    const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;

    const averageResponseTime = totalCount > 0 
      ? recentMetrics.reduce((sum, metric) => sum + metric.responseTime, 0) / totalCount 
      : 0;

    return {
      requestsPerMinute: totalCount / 5,
      errorRate: Math.round(errorRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime),
      isHealthy: errorRate < 5 && averageResponseTime < 2000 // Less than 5% errors and under 2s response time
    };
  }

  static clearMetrics(): void {
    MetricsMiddleware.metrics = [];
    MetricsMiddleware.logger.info('Metrics cleared');
  }

  static exportMetrics(format: 'json' | 'csv' = 'json') {
    if (format === 'csv') {
      const headers = 'timestamp,method,path,statusCode,responseTime,ip,userAgent\n';
      const csvData = MetricsMiddleware.metrics.map(metric => 
        `${metric.timestamp.toISOString()},${metric.method},${metric.path},${metric.statusCode},${metric.responseTime},"${metric.ip}","${metric.userAgent || ''}"`
      ).join('\n');
      
      return headers + csvData;
    }

    return JSON.stringify(MetricsMiddleware.metrics, null, 2);
  }

  static getRequestsByPath(path: string, timeRangeMinutes: number = 60) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeRangeMinutes * 60 * 1000);
    
    return MetricsMiddleware.metrics.filter(
      metric => metric.timestamp >= cutoff && metric.path === path
    );
  }

  static getRequestsByIP(ip: string, timeRangeMinutes: number = 60) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeRangeMinutes * 60 * 1000);
    
    return MetricsMiddleware.metrics.filter(
      metric => metric.timestamp >= cutoff && metric.ip === ip
    );
  }

  static getPrometheusMetrics(): string {
    return register.metrics();
  }
}