import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device, DeviceCreate, DeviceUpdate } from '../models/device.model';

const API = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class DeviceService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<Device[]>(`${API}/devices`);
  }

  create(data: DeviceCreate) {
    return this.http.post<Device>(`${API}/devices`, data);
  }

  update(id: number, data: DeviceUpdate) {
    return this.http.patch<Device>(`${API}/devices/${id}`, data);
  }

  delete(id: number) {
    return this.http.delete<void>(`${API}/devices/${id}`);
  }
}
