import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../api.config';

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
    return this.http.get<Settings>(`${API_BASE_URL}/settings`);
  }

  updateSettings(settings: Partial<Settings>) {
    return this.http.patch<Settings>(`${API_BASE_URL}/settings`, settings);
  }

  getTelemetryHistory(deviceId: number, limit: number = 100) {
    return this.http.get<TelemetryHistoryItem[]>(
      `${API_BASE_URL}/settings/telemetry/history/${deviceId}?limit=${limit}`
    );
  }

  getTelemetryHistoryAdvanced(
    deviceId: number | null,
    date: string,
    hour: string | null,
    limit: number,
    offset: number = 0
  ) {
    let url = `${API_BASE_URL}/telemetry/history?limit=${limit}&offset=${offset}`;
    
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
