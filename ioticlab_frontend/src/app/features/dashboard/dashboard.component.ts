import { Component, OnInit, OnDestroy, inject, DestroyRef } from '@angular/core';
import { DatePipe, NgClass, DecimalPipe, DecimalPipe as NgDecimalPipe } from '@angular/common';
import { TelemetryService } from '../../core/services/telemetry.service';
import { RealtimeService, RealtimeUpdate } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { TelemetryLatest } from '../../core/models/telemetry.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, Subject, EMPTY, Subscription, timeout, exhaustMap} from 'rxjs';
import { switchMap, finalize, tap, catchError, takeUntil, repeat } from 'rxjs/operators';

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

  // CORRECCIÓN: Declaración de la propiedad para rastrear actualizaciones
  recentlyUpdated = new Set<number>();

  // --- Estados de Carga ---
  isInitialLoading = true;
  isRefreshing = false;

  // --- Utilidades y Servicios ---
  private destroyRef = inject(DestroyRef);
  private unsubscribeWS!: () => void;
  // Ya no usamos una variable local vacía, sino la del servicio
  // PROXY DE ESTADO: Vinculamos el componente con el Singleton del servicio
    get devices() { 
      return this.telemetry.devicesCache; 
    }
    
    set devices(value: TelemetryLatest[]) { 
      this.telemetry.devicesCache = value; 
    }
  constructor(
    public auth: AuthService,
    public realtime: RealtimeService,
    private telemetry: TelemetryService
  ) { }

  ngOnInit() {
    this.startPolling();
    this.realtime.connect();
    this.unsubscribeWS = this.realtime.onUpdate((u) => this.applyUpdate(u));
  }


  private startPolling() {
    timer(0, 5000).pipe(
      takeUntilDestroyed(this.destroyRef),
      exhaustMap(() => {
        this.isRefreshing = true;
        // Solo mostramos skeletons si el CACHÉ está vacío
        if (this.devices.length === 0) this.isInitialLoading = true;

        return this.telemetry.getLatest().pipe(
          timeout(8000), // Aumentamos un poco el margen por Tailscale
          catchError(() => EMPTY),
          finalize(() => {
            this.isRefreshing = false;
            this.isInitialLoading = false;
          })
        );
      })
    ).subscribe(data => {
      if (data) {
        this.devices = [...data];
        this.lastUpdate = new Date();
      }
    });
  }

  manualRefresh() {
    // Reutilizamos la misma lógica de seguridad
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.telemetry.getLatest().pipe(
      timeout(4000),
      catchError(() => EMPTY),
      finalize(() => {
        this.isRefreshing = false;
        this.isInitialLoading = false;
      })
    ).subscribe(data => {
      if (data) {
        this.devices = [...data];
        this.lastUpdate = new Date();
      }
    });
  }

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
