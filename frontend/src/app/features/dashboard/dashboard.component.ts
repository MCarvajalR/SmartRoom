import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, of, timer } from 'rxjs';
import { catchError, exhaustMap, filter, finalize, retry, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { DeviceService } from '../../core/services/device.service';
import { RealtimeService, RealtimeUpdate } from '../../core/services/realtime.service';
import { TelemetryService } from '../../core/services/telemetry.service';
import { DevicesByArea } from '../../core/models/device.model';
import { OutdoorWeather, TelemetryLatest } from '../../core/models/telemetry.model';

interface DashboardArea {
  area_id: string;
  area_name: string;
  devices: TelemetryLatest[];
}

type WeatherAttribute =
  | 'temperature' | 'humidity' | 'pressure' | 'wind_speed'
  | 'wind_bearing' | 'dew_point' | 'cloud_coverage' | 'uv_index';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe, NgClass],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  lastUpdate: Date | null = null;
  recentlyUpdated = new Set<number>();
  isInitialLoading = true;
  isRefreshing = false;
  loadError = false;
  controllingDeviceIds = new Set<number>();
  outdoorWeather: OutdoorWeather = {
    location: 'Popayan', source: 'Open-Meteo', condition: 'unknown', is_day: true,
    temperature: null, humidity: null, apparent_temperature: null, cloud_coverage: null,
    pressure: null, precipitation: null, wind_speed: null, wind_direction: null,
    recorded_at: null, available: false,
  };

  private destroyRef = inject(DestroyRef);
  private unsubscribeWS!: () => void;
  private unsubscribeAreaWS!: () => void;
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
        .filter((device): device is TelemetryLatest => !!device && !this.isClimateDevice(device));

      areaDevices.forEach(device => usedDeviceIds.add(device.device_id));
      groups.push({
        area_id: area.area_id,
        area_name: area.area_name || area.area_id,
        devices: areaDevices,
      });
    }

    const unassigned = this.devices.filter(device => !usedDeviceIds.has(device.device_id));
    const trulyUnassigned = unassigned.filter(device => !usedDeviceIds.has(device.device_id) && !this.isClimateDevice(device));
    if (trulyUnassigned.length) {
      groups.push({
        area_id: 'unassigned',
        area_name: 'Sin área asignada',
        devices: trulyUnassigned,
      });
    }

    return groups;
  }

  get deviceCount() {
    return this.devices.length;
  }

  get logicalDeviceCount() {
    return this.devices.filter(device => !this.isLegacyOutdoorWeather(device)).length;
  }

  get areaCount() {
    return this.areaGroups.filter(area => area.area_id !== 'unassigned').length;
  }

  get unavailableCount() {
    return this.devices.filter(device => this.isUnavailable(device)).length;
  }

  get availableCount() {
    return this.deviceCount - this.unavailableCount;
  }

  get unassignedCount() {
    return this.areaGroups.find(area => area.area_id === 'unassigned')?.devices.length ?? 0;
  }

  get operationalLabel() {
    if (!this.deviceCount) return 'Esperando dispositivos';
    if (this.unavailableCount) return 'Atención requerida';
    return 'Todo operativo';
  }

  get operationalDetail() {
    if (!this.deviceCount) return 'La información aparecerá al detectar entidades';
    if (this.unavailableCount === 1) return '1 dispositivo no está disponible';
    if (this.unavailableCount > 1) return `${this.unavailableCount} dispositivos no están disponibles`;
    return `${this.availableCount} dispositivos reportando normalmente`;
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
    this.unsubscribeAreaWS = this.realtime.onAreaRegistryUpdate(() => this.refreshDashboardData());
    this.loadInitial();
    this.startFallbackPolling();
    this.startOutdoorPolling();
  }

  public loadInitial() {
    this.isInitialLoading = true;
    this.loadError = false;

    forkJoin({
      latest: this.telemetry.getLatest(),
      areas: this.devicesService.getGroupedByArea().pipe(catchError(() => of([]))),
      outdoor: this.telemetry.getOutdoorWeather().pipe(catchError(() => of(this.outdoorWeather))),
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
    ).subscribe(({ latest, areas, outdoor }) => {
      this.areaCatalog = areas ?? [];
      this.devices = latest;
      this.outdoorWeather = outdoor;
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

        return forkJoin({
          latest: this.telemetry.getLatest(),
          areas: this.devicesService.getGroupedByArea().pipe(catchError(() => of(this.areaCatalog))),
        }).pipe(
          timeout(8000),
          catchError(() => EMPTY),
          finalize(() => {
            this.isRefreshing = false;
          })
        );
      })
    ).subscribe(data => {
      if (data) {
        this.areaCatalog = data.areas;
        this.mergeDevices(data.latest);
        this.lastUpdate = new Date();
      }
    });
  }

  private startOutdoorPolling() {
    timer(300000, 300000).pipe(
      takeUntilDestroyed(this.destroyRef),
      exhaustMap(() => this.telemetry.getOutdoorWeather().pipe(catchError(() => EMPTY))),
    ).subscribe(weather => {
      if (weather) this.outdoorWeather = weather;
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
    this.refreshDashboardData(true);
  }

  private refreshDashboardData(includeOutdoor = false) {
    if (this.isRefreshing || this.isInitialLoading) return;
    this.isRefreshing = true;

    forkJoin({
      latest: this.telemetry.getLatest(),
      areas: this.devicesService.getGroupedByArea().pipe(catchError(() => of(this.areaCatalog))),
      outdoor: includeOutdoor
        ? this.telemetry.getOutdoorWeather().pipe(catchError(() => of(this.outdoorWeather)))
        : of(this.outdoorWeather),
    }).pipe(
      timeout(6000),
      catchError(() => EMPTY),
      finalize(() => {
        this.isRefreshing = false;
      })
    ).subscribe(data => {
      if (data) {
        this.areaCatalog = data.areas;
        this.outdoorWeather = data.outdoor;
        this.mergeDevices(data.latest);
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
    return ['on', 'open', 'unlocked', 'active', 'detected', 'home'].includes(rawState.toLowerCase());
  }

  isUnavailable(device: TelemetryLatest): boolean {
    return ['unavailable', 'unknown', 'null', 'sin datos', ''].includes((device.raw_state ?? '').toLowerCase());
  }

  isSwitchDevice(deviceType: string): boolean {
    const switchTypes = ['input_boolean', 'switch', 'lock', 'binary_sensor', 'door', 'window'];
    return switchTypes.includes(deviceType.toLowerCase());
  }

  canControlDevice(device: TelemetryLatest): boolean {
    if (!this.auth.hasRole('admin') || this.isUnavailable(device)) return false;
    const domain = this.getEntityDomain(device.entity_id);
    return ['switch', 'input_boolean', 'light', 'lock', 'cover', 'button'].includes(domain);
  }

  isControlling(deviceId: number): boolean {
    return this.controllingDeviceIds.has(deviceId);
  }

  getControlLabel(device: TelemetryLatest): string {
    const domain = this.getEntityDomain(device.entity_id);
    const active = this.isOnState(device.raw_state);
    const accessLike = this.isAccessLikeDevice(device);

    if (domain === 'button') return 'Presionar';
    if (domain === 'lock') return active ? 'Cerrar' : 'Abrir';
    if (domain === 'cover') return active ? 'Cerrar' : 'Abrir';
    if (accessLike) return active ? 'Cerrar' : 'Abrir';
    return active ? 'Apagar' : 'Encender';
  }

  getControlIcon(device: TelemetryLatest): string {
    const domain = this.getEntityDomain(device.entity_id);
    const active = this.isOnState(device.raw_state);

    if (domain === 'button') return 'fa-hand-pointer';
    if (domain === 'lock') return active ? 'fa-lock' : 'fa-lock-open';
    if (domain === 'cover' || this.isAccessLikeDevice(device)) return active ? 'fa-door-closed' : 'fa-door-open';
    return active ? 'fa-toggle-off' : 'fa-toggle-on';
  }

  controlDevice(device: TelemetryLatest, event: MouseEvent) {
    event.stopPropagation();
    if (!this.canControlDevice(device) || this.isControlling(device.device_id)) return;

    const action = this.nextControlAction(device);
    this.controllingDeviceIds = new Set(this.controllingDeviceIds).add(device.device_id);

    this.devicesService.control(device.device_id, action).pipe(
      finalize(() => {
        const next = new Set(this.controllingDeviceIds);
        next.delete(device.device_id);
        this.controllingDeviceIds = next;
      })
    ).subscribe({
      next: result => {
        if (result.raw_state) {
          this.updateDeviceState(device.device_id, result.raw_state);
        }
        this.refreshDashboardData();
      },
      error: err => {
        console.error('Error controlando dispositivo:', err);
      },
    });
  }

  isAccessDevice(device: TelemetryLatest): boolean {
    const entityId = device.entity_id.toLowerCase();
    const deviceName = device.device_name.toLowerCase();
    return device.device_type.toLowerCase() === 'lock' || entityId.includes('puerta') || deviceName.includes('puerta');
  }

  private isAccessLikeDevice(device: TelemetryLatest): boolean {
    const text = `${device.entity_id} ${device.device_name}`.toLowerCase();
    return this.isAccessDevice(device) || text.includes('door') || text.includes('window') || text.includes('ventana');
  }

  private getEntityDomain(entityId: string): string {
    return entityId.toLowerCase().split('.', 1)[0] ?? '';
  }

  private nextControlAction(device: TelemetryLatest): 'on' | 'off' | 'open' | 'close' {
    const active = this.isOnState(device.raw_state);
    const domain = this.getEntityDomain(device.entity_id);
    if (domain === 'button') return 'on';
    if (domain === 'lock' || domain === 'cover' || this.isAccessLikeDevice(device)) {
      return active ? 'close' : 'open';
    }
    return active ? 'off' : 'on';
  }

  private updateDeviceState(deviceId: number, rawState: string) {
    this.devices = this.devices.map(device =>
      device.device_id === deviceId
        ? { ...device, raw_state: rawState, value: Number.isFinite(Number(rawState)) ? Number(rawState) : null, recorded_at: new Date().toISOString() }
        : device
    );
    this.lastUpdate = new Date();
    this.recentlyUpdated.add(deviceId);
    setTimeout(() => this.recentlyUpdated.delete(deviceId), 1500);
  }

  isLegacyOutdoorWeather(device: TelemetryLatest): boolean {
    return device.entity_id.toLowerCase().startsWith('weather.')
      || device.device_name.toLowerCase().includes('exterior');
  }

  getWeatherMetric(devices: TelemetryLatest[], attribute: WeatherAttribute): TelemetryLatest | undefined {
    return devices.find(device => device.entity_id.toLowerCase().endsWith(`::attr::${attribute}`));
  }

  getWeatherValue(devices: TelemetryLatest[], attribute: WeatherAttribute): string {
    const metric = this.getWeatherMetric(devices, attribute);
    if (!metric) return '—';
    return `${this.getFriendlyValue(metric)}${this.cleanUnit(metric.unit) ? ` ${this.cleanUnit(metric.unit)}` : ''}`;
  }

  get interiorTemperature(): TelemetryLatest | undefined { return this.findInteriorMetric('temperature'); }
  get interiorHumidity(): TelemetryLatest | undefined { return this.findInteriorMetric('humidity'); }

  private findInteriorMetric(type: 'temperature' | 'humidity'): TelemetryLatest | undefined {
    return this.devices
      .filter(device => this.isInteriorMetricCandidate(device, type))
      .sort((a, b) => this.interiorPriority(b) - this.interiorPriority(a))[0];
  }

  private interiorPriority(device: TelemetryLatest): number {
    const text = `${device.entity_id} ${device.device_name}`.toLowerCase();
    let score = 0;

    if (device.entity_id.toLowerCase().startsWith('sensor.')) score += 40;
    if (text.includes('sonoff') || text.includes('snzb')) score += 30;
    if (text.includes('laboratorio') || text.includes('lab')) score += 20;
    if (text.includes('prueba')) score += 10;

    return score;
  }

  private isInteriorMetricCandidate(device: TelemetryLatest, type: 'temperature' | 'humidity'): boolean {
    if (device.device_type.toLowerCase() !== type || this.isLegacyOutdoorWeather(device)) return false;

    const entityId = device.entity_id.toLowerCase();
    const text = `${entityId} ${device.device_name}`.toLowerCase();
    const blockedTerms = [
      'comfort',
      'offset',
      'min',
      'max',
      'display',
      'identify',
      'battery',
      'forecast',
    ];

    if (!entityId.startsWith('sensor.')) return false;
    if (blockedTerms.some(term => text.includes(term))) return false;

    return entityId.endsWith(`_${type}`)
      || entityId.includes(`_${type}_`)
      || text.includes(type === 'temperature' ? 'temperatura' : 'humedad')
      || text.includes(type);
  }

  isClimateDevice(device: TelemetryLatest): boolean {
    return this.isLegacyOutdoorWeather(device)
      || device.device_id === this.interiorTemperature?.device_id
      || device.device_id === this.interiorHumidity?.device_id;
  }

  formatWeatherValue(value: number | null, unit: string): string {
    if (value === null || value === undefined) return '—';
    return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  }

  get weatherConditionLabel(): string {
    const labels: Record<string, string> = {
      'clear-night': 'Noche despejada', cloudy: 'Nublado', fog: 'Niebla', hail: 'Granizo',
      lightning: 'Tormenta eléctrica', 'lightning-rainy': 'Tormenta con lluvia',
      partlycloudy: 'Parcialmente nublado', pouring: 'Lluvia intensa', rainy: 'Lluvia',
      snowy: 'Nieve', 'snowy-rainy': 'Aguanieve', sunny: 'Soleado', windy: 'Ventoso',
      'windy-variant': 'Ventoso y nublado',
    };
    const condition = this.outdoorWeather.condition.toLowerCase();
    if (labels[condition]) return labels[condition];
    if (!this.outdoorWeather.is_day) return 'Noche';

    const cloudCoverage = this.outdoorWeather.cloud_coverage;
    if (cloudCoverage === null || cloudCoverage === undefined) return 'Condiciones exteriores';
    if (cloudCoverage >= 85) return 'Muy nublado';
    if (cloudCoverage >= 60) return 'Nublado';
    if (cloudCoverage >= 30) return 'Parcialmente nublado';
    return 'Cielo despejado';
  }

  get weatherConditionIcon(): string {
    if (!this.outdoorWeather.is_day) return 'fa-moon';
    if (this.isStormyWeather) return 'fa-cloud-bolt';
    if (this.isRainyWeather) return 'fa-cloud-rain';
    if (this.outdoorWeather.condition === 'sunny') return 'fa-sun';
    return 'fa-cloud-sun';
  }

  get isRainyWeather(): boolean {
    return ['rainy', 'pouring', 'lightning-rainy', 'snowy-rainy'].includes(this.outdoorWeather.condition.toLowerCase());
  }

  get isStormyWeather(): boolean {
    return ['lightning', 'lightning-rainy'].includes(this.outdoorWeather.condition.toLowerCase());
  }

  get isCloudyWeather(): boolean {
    return ['cloudy', 'partlycloudy', 'windy-variant', 'rainy', 'pouring', 'lightning', 'lightning-rainy'].includes(this.outdoorWeather.condition.toLowerCase());
  }

  get windDirection(): string {
    const bearing = this.outdoorWeather.wind_direction;
    if (bearing === null || bearing === undefined) return '—';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round(bearing / 45) % 8];
  }

  isPowerDevice(device: TelemetryLatest): boolean {
    const unit = this.cleanUnit(device.unit).toLowerCase();
    return ['power', 'energy', 'plug'].includes(device.device_type.toLowerCase())
      || ['w', 'kw', 'wh', 'kwh'].includes(unit);
  }

  isBatteryDevice(device: TelemetryLatest): boolean {
    return device.entity_id.toLowerCase().includes('battery');
  }

  getDeviceContext(device: TelemetryLatest): string {
    const entityId = device.entity_id.toLowerCase();
    if (this.isPowerDevice(device)) return 'Consumo actual';
    if (entityId.includes('apparent_temperature')) return 'Sensación térmica';
    if (entityId.includes('dew_point')) return 'Punto de rocío';
    if (entityId.includes('cloud_coverage')) return 'Cobertura de nubes';
    if (entityId.includes('uv_index')) return 'Índice UV';
    if (entityId.includes('wind_gust')) return 'Ráfagas de viento';
    if (entityId.includes('wind_speed')) return 'Velocidad del viento';
    if (entityId.includes('wind_bearing')) return 'Dirección del viento';
    if (entityId.includes('pressure')) return 'Presión atmosférica';
    if (entityId.includes('visibility')) return 'Visibilidad exterior';
    if (device.device_type.toLowerCase() === 'temperature') return 'Temperatura';
    if (device.device_type.toLowerCase() === 'humidity') return 'Humedad';
    if (this.isBatteryDevice(device)) return 'Nivel de batería';
    if (device.device_type.toLowerCase() === 'device_tracker') return 'Ubicación';
    if (this.isAccessDevice(device)) return 'Control de acceso';
    return 'Estado actual';
  }

  getFriendlyValue(device: TelemetryLatest): string {
    if (device.value !== null) return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(device.value);
    if (device.raw_state === 'not_home') return 'Fuera';
    if (device.raw_state === 'home') return 'Presente';
    if (device.raw_state === 'discharging') return 'En uso';
    if (device.raw_state === 'charging') return 'Cargando';
    if (device.raw_state === 'none') return 'Sin cargador';
    return this.getStateLabel(device);
  }

  cleanUnit(unit: string | null): string {
    return (unit ?? '').replace('Â°C', '°C');
  }

  getDisplayName(name: string): string {
    return name
      .replace(/\s*\((simulado|simulada)\)\s*/gi, '')
      .replace(/^Forecast Casa\s*-\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getStateLabel(device: TelemetryLatest): string {
    if (this.isUnavailable(device)) return 'NO DISPONIBLE';

    const state = device.raw_state.toLowerCase();
    const type = device.device_type.toLowerCase();

    if (type === 'lock') return state === 'unlocked' ? 'DESBLOQUEADA' : 'BLOQUEADA';
    if (['door', 'window', 'binary_sensor'].includes(type) || this.isAccessDevice(device)) {
      return this.isOnState(state) ? 'ABIERTA' : 'CERRADA';
    }

    return this.isOnState(state) ? 'ACTIVO' : 'INACTIVO';
  }

  getAreaStatus(area: DashboardArea): string {
    const unavailable = area.devices.filter(device => this.isUnavailable(device)).length;
    if (!unavailable) return 'Operativa';
    return unavailable === 1 ? '1 sin conexión' : `${unavailable} sin conexión`;
  }

  openDeviceHistory(device: TelemetryLatest) {
    this.router.navigate(['/admin/telemetry'], {
      queryParams: { deviceId: device.device_id },
    });
  }

  getDeviceIcon(deviceType: string, rawState: string): string {
    const type = deviceType.toLowerCase();
    const on = this.isOnState(rawState);

    if (type === 'input_boolean' || type === 'switch') return on ? 'fa-toggle-on' : 'fa-toggle-off';
    if (type === 'lock') return on ? 'fa-lock-open' : 'fa-lock';
    if (type === 'binary_sensor' || type === 'door' || type === 'window') return on ? 'fa-door-open' : 'fa-door-closed';
    if (type === 'temperature') return 'fa-temperature-half';
    if (type === 'humidity') return 'fa-droplet';
    if (type === 'power' || type === 'energy' || type === 'plug') return 'fa-bolt';
    if (type === 'device_tracker') return 'fa-location-dot';
    if (type === 'weather') return 'fa-cloud-sun';
    if (type === 'sensor') return 'fa-gauge-high';
    if (type === 'light') return 'fa-lightbulb';
    return 'fa-microchip';
  }

  ngOnDestroy() {
    this.unsubscribeWS?.();
    this.unsubscribeAreaWS?.();
  }
}
