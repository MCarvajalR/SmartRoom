import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SettingsService, TelemetryHistoryItem } from '../../../core/services/settings.service';
import { DeviceService } from '../../../core/services/device.service';
import { Device } from '../../../core/models/device.model';
import { HttpClient } from '@angular/common/http';

const API = 'http://localhost:8000/api/v1';

@Component({
  selector: 'app-telemetry-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h2>Historial de Telemetría</h2>
      </div>

      <div class="filters-section">
        <div class="filter-group">
          <label>Dispositivo</label>
          <select [(ngModel)]="selectedDeviceId" (change)="loadHistory()">
            <option [ngValue]="null">Todos los dispositivos</option>
            @for (d of devices; track d.id) {
              <option [ngValue]="d.id">{{ d.name }} ({{ d.entity_id }})</option>
            }
          </select>
        </div>

        <div class="filter-group">
          <label>Fecha</label>
          <input type="date" [(ngModel)]="selectedDate" (change)="loadHistory()" />
        </div>

        <div class="filter-group">
          <label>Límite de registros</label>
          <select [(ngModel)]="limit" (change)="loadHistory()">
            <option [ngValue]="50">50</option>
            <option [ngValue]="100">100</option>
            <option [ngValue]="200">200</option>
            <option [ngValue]="500">500</option>
          </select>
        </div>

        <button class="btn-refresh" (click)="loadHistory()">🔄 Actualizar</button>
      </div>

      @if (loading) {
        <div class="loading">Cargando historial...</div>
      }

      @if (!loading && history.length > 0) {
        <div class="history-summary">
          <span>{{ history.length }} registros encontrados</span>
        </div>

        <table class="data-table history-table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Dispositivo</th>
              <th>Entity ID</th>
              <th>Valor</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (h of history; track h.recorded_at + h.device_id) {
              <tr>
                <td>{{ h.recorded_at | date:'yyyy-MM-dd HH:mm:ss' }}</td>
                <td>{{ h.device_name }}</td>
                <td class="mono">{{ h.entity_id }}</td>
                <td>{{ h.value ?? '-' }}</td>
                <td>{{ h.raw_state }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (!loading && history.length === 0) {
        <div class="empty-msg">No se encontraron registros para los filtros seleccionados.</div>
      }
    </div>
  `,
  styleUrl: './telemetry-history.component.scss'
})
export class TelemetryHistoryComponent implements OnInit {
  devices: Device[] = [];
  history: TelemetryHistoryItem[] = [];
  loading = false;

  selectedDeviceId: number | null = null;
  selectedDate = '';
  limit = 100;
  page = 0;

  constructor(
    private http: HttpClient,
    private deviceSvc: DeviceService
  ) {}

  ngOnInit() {
    this.loadDevices();
    this.loadHistory();
  }

  loadDevices() {
    this.deviceSvc.getAllForAdmin().subscribe({
      next: (d) => this.devices = d
    });
  }

  loadHistory() {
    this.loading = true;
    
    let url = `${API}/telemetry/history?limit=${this.limit}`;
    
    if (this.selectedDeviceId) {
      url += `&device_id=${this.selectedDeviceId}`;
    }
    if (this.selectedDate) {
      url += `&date=${this.selectedDate}`;
    }

    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.history = data.map(d => ({
          device_id: d.device_id,
          device_name: d.device_name,
          entity_id: d.entity_id,
          value: d.value,
          raw_state: d.raw_state,
          recorded_at: d.recorded_at
        }));
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando historial:', err);
        this.history = [];
        this.loading = false;
      }
    });
  }
}