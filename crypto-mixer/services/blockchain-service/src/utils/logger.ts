export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private service: string;
  private logLevel: LogLevel;

  constructor(service: string, logLevel: LogLevel = LogLevel.INFO) {
    this.service = service;
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): string {
    const timestamp = new Date().toISOString();
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      service: this.service,
      message,
      ...(metadata && { metadata }),
      ...(error && { error })
    };

    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify(logEntry);
    } else {
      let formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.service}] ${message}`;
      
      if (metadata && Object.keys(metadata).length > 0) {
        formattedMessage += ` | Metadata: ${JSON.stringify(metadata)}`;
      }
      
      if (error) {
        formattedMessage += ` | Error: ${error.message}`;
        if (error.stack) {
          formattedMessage += `\nStack: ${error.stack}`;
        }
      }
      
      return formattedMessage;
    }
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, metadata, error);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  child(additionalService: string): Logger {
    return new Logger(`${this.service}:${additionalService}`, this.logLevel);
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}