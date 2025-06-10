// Расширение типов Axios для поддержки metadata
import { InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
      symbol: string;
      [key: string]: any;
    };
  }
}