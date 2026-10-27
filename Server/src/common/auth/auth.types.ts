import type { UserRole, UserStatus } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  jobTitle: string;
  department: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  sessionId: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthenticatedUser;
  }
}
