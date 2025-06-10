// Типы для https-proxy-agent
declare module 'https-proxy-agent' {
  import { Agent } from 'https';

  export interface HttpsProxyAgentOptions {
    protocol?: string;
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    timeout?: number;
    rejectUnauthorized?: boolean;
  }

  export class HttpsProxyAgent extends Agent {
    constructor(options: string | HttpsProxyAgentOptions);
  }
}