import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, of, timer } from 'rxjs';
import { catchError, exhaustMap, filter, finalize, retry, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { DeviceService } from '../../core/services/device.service';
import { RealtimeService, RealtimeUpdate } from '../../core/services/realtime.service';
import { TelemetryService } from '../../core/services/telemetry.service';
import { DevicesByArea } from '../../core/models/device.model';
import { TelemetryLatest } from '../../core/models/telemetry.model';

interface DashboardArea {
  area_id: string;
  area_name: string;
  devices: TelemetryLatest[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, NgClass, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  lastUpdate: Date | null = null;
  recentlyUpdated = new Set<number>();
  isInitialLoading = true;
  isRefreshing = false;
  loadError = false;

  private destroyRef = inject(DestroyRef);
  private unsubscribeWS!: () => void;
  private areaCatalog: DevicesByArea[] = [];

  get devices(): TelemetryLatest[] {
    return this.telemetry.devicesCache();
  }

  set devices(value: TelemetryLatest[]) {
    this.telemetry.devicesCache.set(value);
  }

  get areaGroups(): DashboardArea[] {
    if (!this.devices.length) return [];

    const devicesById = new Map(this.devices.map(device => [device.device_id, device]));
    const usedDeviceIds = new Set<number>();
    const groups: DashboardArea[] = [];

    for (const area of this.areaCatalog) {
      const areaDevices = area.devices
        .map(device => device.id ? devicesById.get(device.id) : undefined)
        .filter((device): device is TelemetryLatest => !!device);

      if (!areaDevices.length) continue;

      areaDevices.forEach(device => usedDeviceIds.add(device.device_id));
      groups.push({
        area_id: area.area_id,
        area_name: area.area_name || area.area_id,
        devices: areaDevices,
      });
    }

    const unassigned = this.devices.filter(device => !usedDeviceIds.has(device.device_id));
    if (unassigned.length) {
      groups.push({
        area_id: 'unassigned',
        area_name: 'Sin área asignada',
        devices: unassigned,
      });
    }

    return groups;
  }

  get deviceCount() {
    return this.devices.length;
  }

  get areaCount() {
    return this.areaGroups.length;
  }

  constructor(
    public auth: AuthService,
    public realtime: RealtimeService,
    private telemetry: TelemetryService,
    private devicesService: DeviceService,
    private router: Router
  ) {}

  ngOnInit() {
    this.realtime.connect();
    this.unsubscribeWS = this.realtime.onUpdate((update) => this.applyUpdate(update));
    this.loadInitial();
    this.startFallbackPolling();
  }

  public loadInitial() {
    this.isInitialLoading = true;
    this.loadError = false;

    forkJoin({
      latest: this.telemetry.getLatest(),
      areas: this.devicesService.getGroupedByArea().pipe(catchError(() => of([]))),
    }).pipe(
      timeout(8000),
      retry({
        count: 5,
        delay: () => timer(3000),
      }),
      catchError((err) => {
        console.error('Carga inicial fallida tras reintentos:', err);
        this.loadError = true;
        this.isInitialLoading = false;
        return EMPTY;
      }),
      finalize(() => {
        this.isInitialLoading = false;
      })
    ).subscribe(({ latest, areas }) => {
      this.areaCatalog = areas ?? [];
      this.devices = latest;
      this.lastUpdate = new Date();
      this.loadError = false;
    });
  }

  private startFallbackPolling() {
    timer(30000, 30000).pipe(
      takeUntilDestroyed(this.destroyRef),
      filter(() => this.realtime.status() !== 'connected'),
      exhaustMap(() => {
        this.isRefreshing = true;

        return this.telemetry.getLatest().pipe(
          timeout(8000),
          catchError(() => EMPTY),
          finalize(() => {
            this.isRefreshing = false;
          })
        );
      })
    ).subscribe(data => {
      if (data) {
        this.mergeDevices(data);
        this.lastUpdate = new Date();
      }
    });
  }

  private mergeDevices(freshData: TelemetryLatest[]) {
    if (this.devices.length === 0) {
      this.devices = freshData;
      return;
    }

    const freshMap = new Map(freshData.map(device => [device.device_id, device]));
    let hasChanges = false;

    const merged = this.devices.map(existing => {
      const fresh = freshMap.get(existing.device_id);
      if (!fresh) return existing;

      const changed =
        fresh.value !== existing.value ||
        fresh.raw_state !== existing.raw_state ||
        fresh.recorded_at !== existing.recorded_at;

      if (changed) {
        hasChanges = true;
        return { ...existing, ...fresh };
      }

      return existing;
    });

    freshData.forEach(fresh => {
      if (!this.devices.find(device => device.device_id === fresh.device_id)) {
        merged.push(fresh);
        hasChanges = true;
      }
    });

    if (hasChanges) this.devices = merged;
  }

  private applyUpdate(update: RealtimeUpdate) {
    const idx = this.devices.findIndex(device => device.device_id === update.device_id);

    if (idx !== -1) {
      const newDevices = [...this.devices];
      newDevices[idx] = { ...newDevices[idx], ...update };
      this.devices = newDevices;
    } else {
      this.devices = [...this.devices, update as TelemetryLatest];
    }

    this.lastUpdate = new Date();
    this.recentlyUpdated.add(update.device_id);
    setTimeout(() => this.recentlyUpdated.delete(update.device_id), 1500);
  }

  manualRefresh() {
    if (this.isRefreshing || this.isInitialLoading) return;
    this.isRefreshing = true;

    this.telemetry.getLatest().pipe(
      timeout(6000),
      catchError(() => EMPTY),
      finalize(() => {
        this.isRefreshing = false;
      })
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

  isOnState(rawState: string): boolean {
    return ['on', 'open', 'unlocked', 'unavailable'].includes(rawState.toLowerCase());
  }

  isSwitchDevice(deviceType: string): boolean {
    const switchTypes = ['input_boolean', 'switch', 'lock', 'binary_sensor', 'door', 'window'];
    return switchTypes.includes(deviceType.toLowerCase());
  }

  isAccessDevice(device: TelemetryLatest): boolean {
    const entityId = device.entity_id.toLowerCase();
    const deviceName = device.device_name.toLowerCase();
    return device.device_type.toLowerCase() === 'lock' || entityId.includes('puerta') || deviceName.includes('puerta');
  }

  openAccess(device: TelemetryLatest) {
    if (this.isAccessDevice(device)) {
      this.router.navigate(['/access']);
    }
  }

  getDeviceIcon(deviceType: string, rawState: string): string {
    const type = deviceType.toLowerCase();
    const on = this.isOnState(rawState);

    if (type === 'input_boolean' || type === 'switch') return on ? 'fa-toggle-on' : 'fa-toggle-off';
    if (type === 'lock') return on ? 'fa-lock-open' : 'fa-lock';
    if (type === 'binary_sensor' || type === 'door' || type === 'window') return on ? 'fa-door-open' : 'fa-door-closed';
    if (type === 'temperature') return 'fa-temperature-half';
    if (type === 'humidity') return 'fa-droplet';
    if (type === 'sensor') return 'fa-gauge-high';
    if (type === 'light') return 'fa-lightbulb';
    return 'fa-microchip';
  }

  ngOnDestroy() {
    this.unsubscribeWS?.();
  }
}
