const winston = require('winston');
const path = require('path');

const logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} [${level}] ${message}`;
        if (stack && !isProduction) {
          log += `\n${stack}`;
        }
        return log;
      })
    )
  })
];

if (isProduction) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: 5242880,
      maxFiles: 5,
      handleExceptions: true
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: customFormat,
      maxsize: 5242880,
      maxFiles: 5
    })
  );
}

const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  defaultMeta: {
    service: 'crypto-mixer',
    environment: process.env.NODE_ENV || 'development'
  },
  transports,
  exitOnError: false
});

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

const createContextLogger = (context) => {
  return {
    debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { context, ...meta }),
    fatal: (message, meta = {}) => logger.error(message, { context, level: 'fatal', ...meta })
  };
};

const mixerLogger = createContextLogger('mixer');
const dbLogger = createContextLogger('database');
const apiLogger = createContextLogger('api');
const securityLogger = createContextLogger('security');

module.exports = logger;
module.exports.createContextLogger = createContextLogger;
module.exports.mixerLogger = mixerLogger;
module.exports.dbLogger = dbLogger;
module.exports.apiLogger = apiLogger;
module.exports.securityLogger = securityLogger;