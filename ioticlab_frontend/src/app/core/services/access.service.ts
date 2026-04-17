import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class AccessService {
  constructor(private http: HttpClient) {}

  unlock() {
    return this.http.post<{ message: string; triggered_by: string }>(`${API}/access/door/unlock`, {});
  }

  lock() {
    return this.http.post<{ message: string; triggered_by: string }>(`${API}/access/door/lock`, {});
  }

  getStatus() {
    return this.http.get<{ state: string; entity_id: string }>(`${API}/access/door/status`);
  }

  getLogs(limit = 50) {
    return this.http.get<any[]>(`${API}/access/logs?limit=${limit}`);
  }
}
