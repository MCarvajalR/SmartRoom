import { Component, OnInit, OnDestroy } from '@angular/core';
import { DatePipe, NgClass, DecimalPipe } from '@angular/common';
import { TelemetryService } from '../../core/services/telemetry.service';
import { RealtimeService, RealtimeUpdate } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { TelemetryLatest } from '../../core/models/telemetry.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, NgClass, DecimalPipe],
  template: `
    <div class="dashboard">
      <div class="page-header">
        <div class="header-left">
          <h2>Dashboard</h2>
          <!-- Indicador de conexión en tiempo real -->
          <span class="rt-badge" [ngClass]="'rt-' + realtime.status()">
            <span class="rt-dot"></span>
            {{ rtLabel() }}
          </span>
        </div>
        <span class="last-update">
          @if (lastUpdate) { Última actualización: {{ lastUpdate | date:'HH:mm:ss' }} }
        </span>
      </div>

      <div class="metrics-grid">
        @for (d of devices; track d.device_id) {
          <div class="metric-card" [ngClass]="'type-' + d.device_type"
               [class.updated]="recentlyUpdated.has(d.device_id)">
            <div class="card-header">
              <span class="device-name">{{ d.device_name }}</span>
              <span class="device-type">{{ d.device_type }}</span>
            </div>
            <div class="card-value">
              @if (d.value !== null) {
                <span class="value-num">{{ d.value | number:'1.1-1' }}</span>
                <span class="value-unit">{{ d.unit ?? '' }}</span>
              } @else {
                <span class="value-na">{{ d.raw_state }}</span>
              }
            </div>
            <div class="card-footer">
              <span class="entity-id">{{ d.entity_id }}</span>
              @if (d.recorded_at) {
                <span class="record-time">{{ d.recorded_at | date:'HH:mm:ss' }}</span>
              }
            </div>
          </div>
        }

        @if (devices.length === 0 && !loading) {
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <p>No hay dispositivos disponibles</p>
            @if (!auth.isLoggedIn()) {
              <small>Inicia sesión para ver más datos</small>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  devices: TelemetryLatest[] = [];
  lastUpdate: Date | null     = null;
  loading                     = true;

  // Set de device_id que recibieron actualización recientemente (para animación)
  recentlyUpdated = new Set<number>();

  // Función para cancelar la suscripción al WebSocket
  private unsubscribe!: () => void;

  constructor(
    public auth:     AuthService,
    public realtime: RealtimeService,
    private telemetry: TelemetryService,
  ) {}

  ngOnInit() {
    // 1. Carga inicial desde REST (para tener algo que mostrar de inmediato)
    this.loadLatest();

    // 2. Conectar WebSocket para actualizaciones en tiempo real
    this.realtime.connect();

    // 3. Suscribirse a los eventos que lleguen por WS
    this.unsubscribe = this.realtime.onUpdate((update: RealtimeUpdate) => {
      this.applyUpdate(update);
    });
  }

  ngOnDestroy() {
    // Importante: cancelar la suscripción al destruir el componente
    this.unsubscribe?.();
    // No cerramos el WS aquí porque otros componentes podrían usarlo
  }

  /** Carga el snapshot inicial de todos los dispositivos */
  private loadLatest() {
    this.telemetry.getLatest().subscribe({
      next: data => {
        this.devices    = data;
        this.lastUpdate = new Date();
        this.loading    = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /** Aplica una actualización en tiempo real a la tarjeta correspondiente */
  private applyUpdate(update: RealtimeUpdate) {
    const idx = this.devices.findIndex(d => d.device_id === update.device_id);

    if (idx !== -1) {
      // Dispositivo ya existe → actualizar valor
      this.devices[idx] = {
        ...this.devices[idx],
        value:       update.value,
        raw_state:   update.raw_state,
        recorded_at: update.recorded_at,
      };
    } else {
      // Dispositivo nuevo → agregar tarjeta
      this.devices = [...this.devices, {
        device_id:   update.device_id,
        entity_id:   update.entity_id,
        device_name: update.device_name,
        device_type: update.device_type,
        unit:        update.unit,
        value:       update.value,
        raw_state:   update.raw_state,
        recorded_at: update.recorded_at,
      }];
    }

    this.lastUpdate = new Date();

    // Animación de "flash" en la tarjeta actualizada
    this.recentlyUpdated.add(update.device_id);
    setTimeout(() => this.recentlyUpdated.delete(update.device_id), 1500);
  }

  rtLabel(): string {
    const map: Record<string, string> = {
      connected:    'En vivo',
      connecting:   'Conectando...',
      disconnected: 'Desconectado',
    };
    return map[this.realtime.status()] ?? '';
  }
}
