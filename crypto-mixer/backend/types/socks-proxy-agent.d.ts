// Типы для socks-proxy-agent
declare module 'socks-proxy-agent' {
  import { Agent } from 'http';

  export interface SocksProxyAgentOptions {
    protocol?: string;
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    timeout?: number;
  }

  export class SocksProxyAgent extends Agent {
    constructor(options: string | SocksProxyAgentOptions);
  }
}