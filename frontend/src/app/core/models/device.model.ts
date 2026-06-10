export type DeviceType =
  | 'temperature'
  | 'humidity'
  | 'power'
  | 'energy'
  | 'plug'
  | 'lock'
  | 'light'
  | 'sensor'
  | 'binary_sensor'
  | 'input_boolean'
  | 'switch'
  | 'device_tracker'
  | 'climate'
  | 'cover'
  | 'other';
export type Visibility = 'public' | 'docente' | 'admin';

export interface Device {
  id: number;
  entity_id: string;
  name: string;
  device_type: DeviceType;
  unit: string | null;
  area_id: string | null;
  is_active: boolean;
  visibility: Visibility;
  created_at: string;
}

export interface DeviceCreate {
  entity_id: string;
  name: string;
  device_type: DeviceType;
  unit?: string | null;
  area_id?: string;
  visibility: Visibility;
}

export interface DeviceUpdate {
  name?: string;
  device_type?: DeviceType;
  unit?: string | null;
  area_id?: string | null;
  is_active?: boolean;
  visibility?: Visibility;
}

export interface AreaDevice {
  id: number | null;
  entity_id: string;
  name: string;
  device_type: string;
  unit: string | null;
  area_id: string | null;
  is_active: boolean;
  visibility: Visibility;
  created_at: string | null;
  source: string;
}

export interface DevicesByArea {
  area_id: string;
  area_name: string;
  devices: AreaDevice[];
}

export interface Area {
  area_id: string;
  name: string;
}
