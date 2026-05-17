export type DeviceType = 'temperature' | 'humidity' | 'plug' | 'lock' | 'light' | 'other';
export type Visibility = 'public' | 'docente' | 'admin';

export interface Device {
  id: number;
  entity_id: string;
  name: string;
  device_type: DeviceType;
  unit: string | null;
  is_active: boolean;
  visibility: Visibility;
  created_at: string;
}

export interface DeviceCreate {
  entity_id: string;
  name: string;
  device_type: DeviceType;
  unit?: string;
  visibility: Visibility;
}

export interface DeviceUpdate {
  name?: string;
  device_type?: DeviceType;
  unit?: string;
  is_active?: boolean;
  visibility?: Visibility;
}
