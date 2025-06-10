// RUSSIAN: Расширения типов для Express
declare namespace Express {
  interface User {
    id: string | number;
    email?: string;
    role?: string;
    [key: string]: any;
  }

  interface Request {
    user?: User;
  }
}