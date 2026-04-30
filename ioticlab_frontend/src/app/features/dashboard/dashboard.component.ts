import { Component, OnInit, OnDestroy, inject, DestroyRef } from '@angular/core';
import { DatePipe, NgClass, DecimalPipe} from '@angular/common';
import { TelemetryService } from '../../core/services/telemetry.service';
import { RealtimeService, RealtimeUpdate } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { TelemetryLatest } from '../../core/models/telemetry.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, EMPTY} from 'rxjs';
import { exhaustMap, finalize, catchError, filter, timeout, retry, delay } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, NgClass, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  // --- Estado del Componente ---
  //devices: TelemetryLatest[] = [];
  lastUpdate: Date | null = null;

  // Declaración de la propiedad para rastrear actualizaciones
  recentlyUpdated = new Set<number>();

  // --- Estados de Carga ---
  isInitialLoading = true;
  isRefreshing = false;
  loadError = false;

  // --- Utilidades y Servicios ---
  private destroyRef = inject(DestroyRef);
  private unsubscribeWS!: () => void;
  
  // PROXY DE ESTADO: Vinculamos el componente con el Singleton del servicio
    /*get devices() { return this.telemetry.devicesCache; }
    set devices(value: TelemetryLatest[]) { this.telemetry.devicesCache = value; }*/
    // Cambio con Signal
    get devices(): TelemetryLatest[] { return this.telemetry.devicesCache(); }
    set devices(value: TelemetryLatest[]) { this.telemetry.devicesCache.set(value); }
  
    constructor(
    public auth: AuthService,
    public realtime: RealtimeService,
    private telemetry: TelemetryService
  ) { }

  ngOnInit() {
    // Conexión WS primero para recibir datos mientras carga la HTTP inicial
    // WebSocket para actualizaciones en tiempo real
    this.realtime.connect();
    this.unsubscribeWS = this.realtime.onUpdate((u) => this.applyUpdate(u));

    // Carga inicial con reintentos automáticos
    // Si falla, reintenta cada 3s hasta 5 veces antes de mostrar error
    this.loadInitial();

    // Polling solo como respaldo cuando el WS está caído
    // Intervalo largo (30s) porque el WS ya cubre el tiempo real
    this.startFallbackPolling();
  }

  public loadInitial() {
    this.isInitialLoading = true;
    this.loadError = false;

    this.telemetry.getLatest().pipe(
      timeout(8000), // Aumentamos el timeout por Tailscale
      // Reintentos automáticos con delay
      retry({
        count: 5,
        delay: (error, retryCount) => {
          console.warn(`Error en carga inicial (intento ${retryCount}):`, error);
          return timer(3000); // Espera 3s antes de reintentar
        }
      }),

      // Si se agotan los intentos, capturamos el error para mostrar mensaje al usuario
      catchError((err) => {
        console.error('Carga inicial fallida tras reintentos:', err);
        this.loadError = true;
        this.isInitialLoading = false; // Detenemos el spinner de carga
        return EMPTY; 
      }),
      finalize(() => {
        this.isInitialLoading = false;
      })
    ).subscribe(data => {
      if (data) {
        // Primera carga: asignación directa, no hay nada que preservar
        this.devices = data;
        this.lastUpdate = new Date();
        this.loadError = false; // Aseguramos que el error se limpia si finalmente carga bien
      }
    });
  }

  private startFallbackPolling() {
    timer(30000, 30000).pipe(
      takeUntilDestroyed(this.destroyRef),
      // Actúa solo si el WS está caído
      // Si el WS está connected, entonces el polling no hace nada
      filter(() => this.realtime.status() !== 'connected'),
      exhaustMap(() => {
        this.isRefreshing = true;

        return this.telemetry.getLatest().pipe(
          timeout(8000), // Aumentamos un poco el margen por Tailscale
          catchError(() => EMPTY),
          finalize(() => {
            this.isRefreshing = false; })
        );
      })
    ).subscribe(data => {
      if (data) {
        // Merge inteligente: no reemplaza objetos que no cambiaron
        this.mergeDevices(data);
        this.lastUpdate = new Date();
      }
    });
  }

  /**
   * Actualiza solo los objetos que realmente cambiaron.
   * Si el objeto tiene la misma referencia, Angular no toca el DOM → sin parpadeo.
   */
  private mergeDevices(freshData: TelemetryLatest[]) {
    if (this.devices.length === 0) {
      this.devices = freshData;
      return;
    }

    const freshMap = new Map(freshData.map(d => [d.device_id, d]));
    let hasChanges = false;

    const merged = this.devices.map(existing => {
      const fresh = freshMap.get(existing.device_id);
      if (!fresh) return existing; // No hay datos nuevos para este dispositivo

      // Solo crea nuevo objeto si hay un cambio real de datos
      const changed =
        fresh.value !== existing.value ||
        fresh.raw_state !== existing.raw_state ||
        fresh.recorded_at !== existing.recorded_at;

      if (changed) {
        hasChanges = true;
        return { ...existing, ...fresh };
      }

      // Misma referencia, si Angular detecta que no hay cambios entonces no toca el DOM
      return existing;
    });

    // Agregar dispositivos que aparecieron nuevos
    freshData.forEach(f => {
      if (!this.devices.find(d => d.device_id === f.device_id)) {
        merged.push(f);
        hasChanges = true;
      }
    });

    // Solo reasignar el array si algo cambió de verdad
    if (hasChanges) this.devices = merged;
  }

/*   manualRefresh() {
    // Reutilizamos la misma lógica de seguridad
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.telemetry.getLatest().pipe(
      timeout(6000),
      catchError(() => EMPTY),
      finalize(() => {
        this.isRefreshing = false; })
    ).subscribe(data => {
      if (data) {
        this.mergeDevices(data); // También usa merge, no reemplazo total
        this.lastUpdate = new Date();
      }
    });
  } */

  /**
   * Actualización desde WebSocket
   */
  private applyUpdate(update: RealtimeUpdate) {
    const idx = this.devices.findIndex(d => d.device_id === update.device_id);

    if (idx !== -1) {
      // Clonamos el objeto para asegurar que Angular vea el cambio
      const newDevices = [...this.devices];
      newDevices[idx] = { ...newDevices[idx], ...update };
      this.devices = newDevices;
    } else {
      this.devices = [...this.devices, update as any];
    }

    this.lastUpdate = new Date();
    this.recentlyUpdated.add(update.device_id);
    setTimeout(() => this.recentlyUpdated.delete(update.device_id), 1500);
  }

  // Botón manual: útil en desarrollo, pero puede ocultarse en modo TV
  manualRefresh() {
    if (this.isRefreshing || this.isInitialLoading) return;
    this.isRefreshing = true;
    this.telemetry.getLatest().pipe(
      timeout(6000),
      catchError(() => EMPTY),
      finalize(() => {
        this.isRefreshing = false; })
    ).subscribe(data => {
      if (data) {
        this.mergeDevices(data);
        this.lastUpdate = new Date();
      }
    });
  }

  rtLabel() {
    const status = this.realtime.status();
    if (status === 'connected') return 'En vivo';
    if (status === 'connecting') return 'Sincronizando...';
    return 'Desconectado';
  }

  ngOnDestroy() {
    this.unsubscribeWS?.();
  }
}
