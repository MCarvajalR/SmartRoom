import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device, DeviceUpdate } from '../models/device.model';

const API = 'http://localhost:8000/api/v1';

@Injectable({ providedIn: 'root' })
export class DeviceService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<Device[]>(`${API}/devices`);
  }

  getAllForAdmin() {
    return this.http.get<Device[]>(`${API}/devices/all`);
  }

  update(id: number, data: DeviceUpdate) {
    return this.http.patch<Device>(`${API}/devices/${id}`, data);
  }

  delete(id: number) {
    return this.http.delete<void>(`${API}/devices/${id}`);
  }
}
