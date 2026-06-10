import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Area, Device, DeviceUpdate, DevicesByArea } from '../models/device.model';
import { API_BASE_URL } from '../api.config';

@Injectable({ providedIn: 'root' })
export class DeviceService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<Device[]>(`${API_BASE_URL}/devices`);
  }

  getAllForAdmin() {
    return this.http.get<Device[]>(`${API_BASE_URL}/devices/all`);
  }

  getGroupedByArea() {
    return this.http.get<DevicesByArea[]>(`${API_BASE_URL}/devices/grouped-by-area`);
  }

  getAreas() {
    return this.http.get<Area[]>(`${API_BASE_URL}/devices/areas`);
  }

  createArea(name: string) {
    return this.http.post<Area>(`${API_BASE_URL}/devices/areas`, { name });
  }

  renameArea(areaId: string, name: string) {
    return this.http.patch<Area>(`${API_BASE_URL}/devices/areas/${areaId}`, { name });
  }

  deleteArea(areaId: string) {
    return this.http.delete<void>(`${API_BASE_URL}/devices/areas/${areaId}`);
  }

  update(id: number, data: DeviceUpdate) {
    return this.http.patch<Device>(`${API_BASE_URL}/devices/${id}`, data);
  }

  delete(id: number) {
    return this.http.delete<void>(`${API_BASE_URL}/devices/${id}`);
  }
}
