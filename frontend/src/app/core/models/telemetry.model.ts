export interface TelemetryLatest {
  device_id: number;
  entity_id: string;
  device_name: string;
  device_type: string;
  unit: string | null;
  value: number | null;
  raw_state: string;
  recorded_at: string | null;
}

export interface TelemetryRecord {
  id: number;
  device_id: number;
  entity_id: string;
  device_name: string;
  value: number | null;
  raw_state: string;
  recorded_at: string;
}
