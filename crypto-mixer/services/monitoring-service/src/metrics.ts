import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export class MetricsCollector {
  private registry: Registry;
  
  // Counters
  public mixRequestsTotal: Counter;
  public mixRequestsFailed: Counter;
  public transactionsTotal: Counter;
  public transactionsFailed: Counter;
  
  // Histograms
  public mixProcessingDuration: Histogram;
  public apiRequestDuration: Histogram;
  public transactionConfirmationTime: Histogram;
  
  // Gauges
  public activeMixes: Gauge;
  public walletBalance: Gauge;
  public pendingPayouts: Gauge;
  public queueSize: Gauge;

  constructor() {
    this.registry = new Registry();
    
    // Collect default metrics
    collectDefaultMetrics({ register: this.registry });
    
    // Initialize custom metrics
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Mix requests counter
    this.mixRequestsTotal = new Counter({
      name: 'mix_requests_created_total',
      help: 'Total number of mix requests created',
      labelNames: ['currency', 'status'],
      registers: [this.registry],
    });

    this.mixRequestsFailed = new Counter({
      name: 'mix_requests_failed_total',
      help: 'Total number of failed mix requests',  
      labelNames: ['currency', 'reason'],
      registers: [this.registry],
    });

    // Transactions counter
    this.transactionsTotal = new Counter({
      name: 'blockchain_transactions_total',
      help: 'Total number of blockchain transactions',
      labelNames: ['currency', 'type', 'status'],
      registers: [this.registry],
    });

    this.transactionsFailed = new Counter({
      name: 'blockchain_transactions_failed_total',
      help: 'Total number of failed blockchain transactions',
      labelNames: ['currency', 'reason'],
      registers: [this.registry],
    });

    // Processing duration histogram
    this.mixProcessingDuration = new Histogram({
      name: 'mix_processing_duration_seconds',
      help: 'Duration of mix processing in seconds',
      labelNames: ['currency'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
      registers: [this.registry],
    });

    // API request duration
    this.apiRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    // Transaction confirmation time
    this.transactionConfirmationTime = new Histogram({
      name: 'transaction_confirmation_time_seconds',
      help: 'Time to confirm transactions',
      labelNames: ['currency'],
      buckets: [60, 300, 600, 1800, 3600, 7200],
      registers: [this.registry],
    });

    // Active mixes gauge
    this.activeMixes = new Gauge({
      name: 'mix_requests_active',
      help: 'Number of active mix requests',
      labelNames: ['currency', 'status'],
      registers: [this.registry],
    });

    // Wallet balance gauge
    this.walletBalance = new Gauge({
      name: 'wallet_balance',
      help: 'Current wallet balance',
      labelNames: ['currency', 'wallet_type', 'address'],
      registers: [this.registry],
    });

    // Pending payouts gauge
    this.pendingPayouts = new Gauge({
      name: 'pending_payouts',
      help: 'Number of pending payouts',
      labelNames: ['currency'],
      registers: [this.registry],
    });

    // Queue size gauge
    this.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Current queue size',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });
  }

  public getRegistry(): Registry {
    return this.registry;
  }

  // Helper method to track API requests
  public trackAPIRequest(method: string, route: string, statusCode: number, duration: number): void {
    this.apiRequestDuration.labels(method, route, statusCode.toString()).observe(duration);
  }

  // Helper method to track mix processing
  public trackMixProcessing(currency: string, duration: number): void {
    this.mixProcessingDuration.labels(currency).observe(duration);
  }

  // Helper method to update active mixes
  public updateActiveMixes(currency: string, status: string, count: number): void {
    this.activeMixes.labels(currency, status).set(count);
  }

  // Helper method to update wallet balance
  public updateWalletBalance(currency: string, walletType: string, address: string, balance: number): void {
    this.walletBalance.labels(currency, walletType, address).set(balance);
  }
}