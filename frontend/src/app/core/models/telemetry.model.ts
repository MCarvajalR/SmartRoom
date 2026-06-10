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

export interface WeatherSummary {
  condition: string;
  is_day: boolean;
  entity_id: string | null;
}

export interface OutdoorWeather {
  location: string;
  source: string;
  condition: string;
  is_day: boolean;
  temperature: number | null;
  humidity: number | null;
  apparent_temperature: number | null;
  cloud_coverage: number | null;
  pressure: number | null;
  precipitation: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  recorded_at: string | null;
  available: boolean;
}
