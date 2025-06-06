export class Logger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  private log(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.service,
      message,
      ...(meta && { meta })
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: Error | any): void {
    const errorMeta = error instanceof Error 
      ? { error: error.message, stack: error.stack }
      : { error };
    
    this.log('error', message, errorMeta);
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta);
    }
  }
}