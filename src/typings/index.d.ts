import { Request } from 'express';
import { User } from '../src/users/entities/user.entity';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

declare module '*.json' {
  const value: any;
  export default value;
}