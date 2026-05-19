import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';

@Injectable({ providedIn: 'root' })
export class AccessService {
  constructor(private http: HttpClient) {}

  unlock() {
    return this.http.post<{ message: string; triggered_by: string }>(`${API_BASE_URL}/access/door/unlock`, {});
  }

  lock() {
    return this.http.post<{ message: string; triggered_by: string }>(`${API_BASE_URL}/access/door/lock`, {});
  }

  getStatus() {
    return this.http.get<{ state: string; entity_id: string }>(`${API_BASE_URL}/access/door`);
  }

  getLogs(limit = 50) {
    return this.http.get<any[]>(`${API_BASE_URL}/access/logs?limit=${limit}`);
  }
}
