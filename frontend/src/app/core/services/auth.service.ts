import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { LoginRequest, ProfileUpdate, TokenResponse, User, UserCreate, UserRole, UserUpdate } from '../models/user.model';
import { API_BASE_URL } from '../api.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Signal reactivo — cuando cambia, los componentes que lo lean se actualizan automáticamente
  private _token = signal<string | null>(localStorage.getItem('token'));
  private _role   = signal<UserRole | null>(localStorage.getItem('role') as UserRole | null);
  private _user   = signal<User | null>(null);

  readonly token = this._token.asReadonly();
  readonly role  = this._role.asReadonly();
  readonly user  = this._user.asReadonly();

  constructor(private http: HttpClient, private router: Router) {}

  isLoggedIn(): boolean {
    return !!this._token();
  }

  hasRole(...roles: string[]): boolean {
  const r = this._role();
  if (!r) return false;

  // Normalizamos a minúsculas para una comparación analítica infalible
  const currentRole = String(r).toLowerCase().trim();
  return roles.some(role => role.toLowerCase().trim() === currentRole);
}

  login(creds: LoginRequest) {
    return this.http.post<TokenResponse>(`${API_BASE_URL}/auth/login`, creds).pipe(
      tap(res => {
        localStorage.setItem('token', res.access_token);
        localStorage.setItem('role', res.role);
        this._token.set(res.access_token);
        this._role.set(res.role);
      })
    );
  }

  loadProfile() {
    return this.http.get<User>(`${API_BASE_URL}/auth/me`).pipe(
      tap(user => this._user.set(user))
    );
  }

  getUsers() {
    return this.http.get<User[]>(`${API_BASE_URL}/auth/users`);
  }

  createUser(data: UserCreate) {
    return this.http.post<User>(`${API_BASE_URL}/auth/users`, data);
  }

  updateProfile(data: ProfileUpdate) {
    return this.http.patch<User>(`${API_BASE_URL}/auth/me`, data).pipe(
      tap(user => this._user.set(user))
    );
  }

  updateUser(userId: number, data: UserUpdate) {
    return this.http.patch<User>(`${API_BASE_URL}/auth/users/${userId}`, data);
  }

  deleteUser(userId: number) {
    return this.http.delete<void>(`${API_BASE_URL}/auth/users/${userId}`);
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    this._token.set(null);
    this._role.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }
}
