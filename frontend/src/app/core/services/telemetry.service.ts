import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TelemetryLatest, TelemetryRecord } from '../models/telemetry.model';
import { API_BASE_URL } from '../api.config';

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  // Signal para que Angular detecte cambios automáticamente
  readonly devicesCache = signal<TelemetryLatest[]>([]);
  //public devicesCache: TelemetryLatest[] = [];
  
  constructor(private http: HttpClient) {}

  // Sin token: retorna solo dispositivos 'public'
  // Con token de docente/admin: retorna según visibilidad
  getLatest() {
    return this.http.get<TelemetryLatest[]>(`${API_BASE_URL}/telemetry/latest`);
  }

  getHistory(deviceId?: number, limit = 100) {
    let url = `${API_BASE_URL}/telemetry/history?limit=${limit}`;
    if (deviceId) url += `&device_id=${deviceId}`;
    return this.http.get<TelemetryRecord[]>(url);
  }

  triggerCollection() {
    return this.http.post<{ message: string }>(`${API_BASE_URL}/telemetry/collect`, {});
  }
}
