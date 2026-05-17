export type UserRole = 'admin' | 'docente' | 'anonimo';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}
