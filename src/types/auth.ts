// Auth Job Types for Queue-based Login

export type AuthJobType = 'login' | 'verify-2fa';

export type AuthJobStatus = 'pending' | 'processing' | 'waiting_2fa' | 'completed' | 'failed';

export interface AuthJobData {
  authJobId: string;
  type: AuthJobType;
  username: string;
  password?: string;  // Only for login type (encrypted)
  code?: string;      // Only for verify-2fa type
  createdAt: number;
}

export interface AuthJobResult {
  success: boolean;
  sessionId?: string;
  requires2FA?: boolean;
  error?: string;
}

export interface AuthJobState {
  authJobId: string;
  type: AuthJobType;
  status: AuthJobStatus;
  result?: AuthJobResult;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
