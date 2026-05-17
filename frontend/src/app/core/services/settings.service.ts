import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:8000/api/v1';

export interface Settings {
  telemetry_interval_seconds: number;
  door_entity_id: string | null;
}

export interface TelemetryHistoryItem {
  device_id: number;
  device_name: string;
  entity_id: string;
  value: number | null;
  raw_state: string;
  recorded_at: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(private http: HttpClient) {}

  getSettings() {
    return this.http.get<Settings>(`${API}/settings`);
  }

  updateSettings(settings: Partial<Settings>) {
    return this.http.patch<Settings>(`${API}/settings`, settings);
  }

  getTelemetryHistory(deviceId: number, limit: number = 100) {
    return this.http.get<TelemetryHistoryItem[]>(
      `${API}/settings/telemetry/history/${deviceId}?limit=${limit}`
    );
  }

  getTelemetryHistoryAdvanced(
    deviceId: number | null,
    date: string,
    hour: string | null,
    limit: number,
    offset: number = 0
  ) {
    let url = `${API}/telemetry/history?limit=${limit}&offset=${offset}`;
    
    if (deviceId) {
      url += `&device_id=${deviceId}`;
    }
    if (date) {
      url += `&date=${date}`;
    }
    if (hour) {
      url += `&hour=${hour}`;
    }

    return this.http.get<TelemetryHistoryItem[]>(url);
  }
}