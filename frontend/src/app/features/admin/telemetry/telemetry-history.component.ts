import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_BASE_URL } from '../../../core/api.config';
import { Device } from '../../../core/models/device.model';
import { DeviceService } from '../../../core/services/device.service';

interface TelemetryHistoryItem {
  device_id: number;
  device_name: string;
  entity_id: string;
  value: number | null;
  raw_state: string;
  recorded_at: string;
}

interface ChartPoint {
  item: TelemetryHistoryItem;
  x: number;
  y: number;
}

interface StatusBucket {
  label: string;
  count: number;
  width: number;
}

interface DeviceBucket {
  label: string;
  entityId: string;
  count: number;
  width: number;
}

type RangePreset = 'today' | '24h' | '7d' | 'custom';
type AnalysisMode = 'mixed' | 'numeric' | 'energy' | 'access' | 'state';

interface HistoryCacheState {
  devices: Device[];
  history: TelemetryHistoryItem[];
  selectedDeviceId: number | null;
  deviceSearchTerm: string;
  rangePreset: RangePreset;
  startDateTime: string;
  endDateTime: string;
  limit: number;
  fetchedAt: number;
}

@Component({
  selector: 'app-telemetry-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">Analítica de telemetría</p>
          <h2>Historial de sensores</h2>
        </div>
        <div class="header-actions">
          @if (updatedAt) {
            <span class="updated-label">{{ updatedAgoLabel }}</span>
          }
          <button class="btn-refresh" (click)="loadHistory()" [disabled]="loading">
            {{ loading ? 'Consultando...' : 'Actualizar' }}
          </button>
        </div>
      </div>

      <section class="filters-section" aria-label="Filtros de historial">
        <div class="filter-group device-filter">
          <label>Dispositivo</label>
          <div class="device-search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input
              type="text"
              [(ngModel)]="deviceSearchTerm"
              (ngModelChange)="onDeviceSearchChange()"
              placeholder="Buscar dispositivo"
              aria-label="Buscar dispositivo" />
            @if (deviceSearchTerm) {
              <button type="button" class="clear-search" (click)="clearDeviceSearch()" aria-label="Limpiar búsqueda">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            }
          </div>
          @if (deviceSearchTerm) {
            <div class="search-results" role="listbox" aria-label="Resultados de busqueda de dispositivos">
              @if (filteredDevices.length > 0) {
                @for (d of visibleSearchResults; track d.id) {
                  <button
                    type="button"
                    class="search-result"
                    [class.selected]="d.id === selectedDeviceId"
                    (click)="selectDeviceFromSearch(d)">
                    <span>{{ getDeviceSearchLabel(d) }}</span>
                    <small>{{ d.entity_id }}</small>
                  </button>
                }
                @if (filteredDevices.length > visibleSearchResults.length) {
                  <div class="search-more">
                    {{ filteredDevices.length - visibleSearchResults.length }} resultados mas
                  </div>
                }
              } @else {
                <div class="search-empty">Sin coincidencias</div>
              }
            </div>
          }
          <select [(ngModel)]="selectedDeviceId" (change)="loadHistory()">
            <option [ngValue]="null">Todos los dispositivos</option>
            @if (selectedDevice && deviceSearchTerm && !isDeviceVisibleInSearch(selectedDevice)) {
              <option [ngValue]="selectedDevice.id">{{ selectedDevice.name }}</option>
            }
            @if (filteredWeatherDevices.length) {
              <optgroup label="Clima exterior">
                @for (d of filteredWeatherDevices; track d.id) {
                  <option [ngValue]="d.id">{{ weatherMetricLabel(d) }}</option>
                }
              </optgroup>
            }
            @if (filteredRegularDevices.length) {
              <optgroup label="Dispositivos">
                @for (d of filteredRegularDevices; track d.id) {
                  <option [ngValue]="d.id">{{ d.name }}</option>
                }
              </optgroup>
            }
            @if (deviceSearchTerm && filteredDevices.length === 0) {
              <option [ngValue]="selectedDeviceId" disabled>
                Sin coincidencias
              </option>
            }
            @if (!deviceSearchTerm && devices.length === 0) {
              <option [ngValue]="null" disabled>
                No hay dispositivos cargados
              </option>
            }
          </select>
        </div>

        <div class="filter-group">
          <label>Periodo</label>
          <select [(ngModel)]="rangePreset" (change)="applyPreset()">
            <option value="today">Hoy</option>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 días</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        <div class="filter-group">
          <label>Desde</label>
          <input type="datetime-local" [(ngModel)]="startDateTime" (change)="setCustomRange()" />
        </div>

        <div class="filter-group">
          <label>Hasta</label>
          <input type="datetime-local" [(ngModel)]="endDateTime" (change)="setCustomRange()" />
        </div>

        <div class="filter-group compact">
          <label>Registros</label>
          <select [(ngModel)]="limit" (change)="loadHistory()">
            <option [ngValue]="50">50</option>
            <option [ngValue]="100">100</option>
            <option [ngValue]="250">250</option>
            <option [ngValue]="500">500</option>
            <option [ngValue]="1000">1000</option>
          </select>
        </div>
      </section>

      @if (errorMessage) {
        <div class="error-banner">{{ errorMessage }}</div>
      }

      @if (loading && history.length === 0) {
        <div class="loading">Cargando historial de telemetría...</div>
      }

      @if (loading && history.length > 0) {
        <div class="refresh-banner">Actualizando historial...</div>
      }

      @if (history.length > 0) {
        <section class="summary-grid" aria-label="Resumen de telemetria">
          <article class="metric-card">
            <span class="metric-label">Registros</span>
            <strong>{{ history.length }}</strong>
            <small>{{ activeRangeLabel }}</small>
          </article>
          <article class="metric-card">
            @if (analysisMode === 'mixed') {
              <span class="metric-label">Dispositivos</span>
              <strong>{{ deviceBuckets.length }}</strong>
              <small>Representados en la consulta</small>
            } @else if (analysisMode === 'energy') {
              <span class="metric-label">Potencia promedio</span>
              <strong>{{ averageValueLabel }}</strong>
              <small>{{ selectedUnitLabel }}</small>
            } @else {
              <span class="metric-label">Promedio</span>
              <strong>{{ averageValueLabel }}</strong>
              <small>{{ selectedUnitLabel }}</small>
            }
          </article>
          <article class="metric-card">
            @if (analysisMode === 'mixed') {
              <span class="metric-label">Lecturas numéricas</span>
              <strong>{{ numericHistory.length }}</strong>
              <small>Dentro de los registros consultados</small>
            } @else if (analysisMode === 'energy') {
              <span class="metric-label">Pico de demanda</span>
              <strong>{{ maxValueLabel }}</strong>
              <small>{{ selectedUnitLabel }}</small>
            } @else {
              <span class="metric-label">Mínimo / Máximo</span>
              <strong>{{ minValueLabel }} / {{ maxValueLabel }}</strong>
              <small>Valores numéricos</small>
            }
          </article>
          <article class="metric-card">
            <span class="metric-label">Ultima lectura</span>
            <strong>{{ latestRecord?.raw_state ?? '-' }}</strong>
            <small>{{ latestRecord?.recorded_at | date:'yyyy-MM-dd HH:mm' }}</small>
          </article>
        </section>

        @if (analysisMode === 'mixed') {
          <section class="overview-grid">
            <article class="chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Actividad por dispositivo</h3>
                  <p>Cantidad de lecturas incluidas en la consulta</p>
                </div>
              </div>
              <div class="status-list">
                @for (bucket of deviceBuckets; track bucket.entityId) {
                  <div class="status-row">
                    <div class="status-meta">
                      <span title="{{ bucket.entityId }}">{{ bucket.label }}</span>
                      <strong>{{ bucket.count }}</strong>
                    </div>
                    <div class="bar-track">
                      <span class="bar-fill" [style.width.%]="bucket.width"></span>
                    </div>
                  </div>
                }
              </div>
            </article>

            <article class="chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Estados más frecuentes</h3>
                  <p>Panorama general de los dispositivos visibles</p>
                </div>
              </div>
              <ng-container *ngTemplateOutlet="statusDistribution"></ng-container>
            </article>
          </section>
        } @else if (analysisMode === 'energy') {
          <section class="energy-summary">
            <article>
              <span>Potencia actual</span>
              <strong>{{ latestRecord?.value ?? '-' }} {{ selectedUnitLabel }}</strong>
            </article>
            <article>
              <span>Consumo estimado</span>
              <strong>{{ estimatedEnergyLabel }}</strong>
            </article>
            <article>
              <span>Nivel de carga</span>
              <strong>{{ currentLoadLabel }}</strong>
            </article>
          </section>

          <section class="analytics-grid">
            <article class="chart-panel primary-chart">
              <div class="panel-header">
                <div>
                  <h3>Demanda energética</h3>
                  <p>Variación de potencia durante el periodo</p>
                </div>
                <span class="record-chip">{{ numericHistory.length }} mediciones</span>
              </div>
              <ng-container *ngTemplateOutlet="numericChart"></ng-container>
            </article>

            <article class="chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Distribución de carga</h3>
                  <p>Tiempo relativo por nivel de consumo</p>
                </div>
              </div>
              <div class="status-list">
                @for (bucket of energyLoadBuckets; track bucket.label) {
                  <div class="status-row">
                    <div class="status-meta">
                      <span>{{ bucket.label }}</span>
                      <strong>{{ bucket.count }}</strong>
                    </div>
                    <div class="bar-track">
                      <span class="bar-fill" [style.width.%]="bucket.width"></span>
                    </div>
                  </div>
                }
              </div>
            </article>
          </section>
        } @else if (analysisMode === 'access') {
          <section class="access-analysis-grid">
            <article class="chart-panel access-panel">
              <div class="panel-header">
                <div>
                  <h3>Comportamiento de la puerta</h3>
                  <p>Resumen de aperturas, cierres y cambios de estado</p>
                </div>
              </div>

              <div class="access-metrics">
                <div>
                  <span>Aperturas</span>
                  <strong>{{ accessSummary.openCount }}</strong>
                </div>
                <div>
                  <span>Cierres</span>
                  <strong>{{ accessSummary.closedCount }}</strong>
                </div>
                <div>
                  <span>Transiciones</span>
                  <strong>{{ accessSummary.transitionCount }}</strong>
                </div>
              </div>

              <div class="event-timeline">
                @for (event of accessEvents; track event.recorded_at + event.raw_state) {
                  <div class="event-item" [class.open]="isOpenState(event.raw_state)">
                    <span class="event-dot"></span>
                    <div>
                      <strong>{{ doorStateLabel(event.raw_state) }}</strong>
                      <small>{{ event.recorded_at | date:'yyyy-MM-dd HH:mm:ss' }}</small>
                    </div>
                  </div>
                }
                @if (accessEvents.length === 0) {
                  <div class="empty-chart">No hay cambios de estado suficientes para construir una línea de tiempo.</div>
                }
              </div>
            </article>

            <article class="chart-panel">
              <div class="panel-header">
                <div>
                  <h3>Distribución de estados</h3>
                  <p>Frecuencia de estados reportados por la puerta</p>
                </div>
              </div>
              <ng-container *ngTemplateOutlet="statusDistribution"></ng-container>
            </article>
          </section>
        } @else {
          <section class="analytics-grid">
          <article class="chart-panel primary-chart">
            <div class="panel-header">
              <div>
                <h3>Evolución temporal</h3>
                <p>{{ selectedDeviceLabel }}</p>
              </div>
              <span class="record-chip">{{ numericHistory.length }} puntos numéricos</span>
            </div>

            <ng-container *ngTemplateOutlet="numericChart"></ng-container>
          </article>

          <article class="chart-panel">
            <div class="panel-header">
              <div>
                <h3>Distribución de estados</h3>
                <p>Frecuencia de lecturas por estado reportado</p>
              </div>
            </div>
            <ng-container *ngTemplateOutlet="statusDistribution"></ng-container>
          </article>
          </section>
        }

        <section class="table-section">
          <div class="panel-header">
            <div>
              <h3>Detalle de lecturas</h3>
              <p>{{ visibleHistory.length }} de {{ history.length }} registros ordenados desde el más reciente</p>
            </div>
            @if (history.length > initialRecordLimit) {
              <button class="btn-secondary" type="button" (click)="showAllRecords = !showAllRecords">
                {{ showAllRecords ? 'Mostrar menos' : 'Mostrar todos' }}
              </button>
            }
          </div>

          <div class="table-scroll">
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
                @for (h of visibleHistory; track h.recorded_at + h.device_id + h.raw_state) {
                  <tr>
                    <td>{{ h.recorded_at | date:'yyyy-MM-dd HH:mm:ss' }}</td>
                    <td>{{ h.device_name }}</td>
                    <td class="mono">{{ h.entity_id }}</td>
                    <td>{{ h.value ?? '-' }}</td>
                    <td><span class="state-pill">{{ h.raw_state }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (!loading && history.length === 0 && !errorMessage) {
        <div class="empty-msg">No se encontraron registros para los filtros seleccionados.</div>
      }

      <ng-template #statusDistribution>
        <div class="status-list">
          @for (bucket of statusBuckets; track bucket.label) {
            <div class="status-row">
              <div class="status-meta">
                <span>{{ bucket.label }}</span>
                <strong>{{ bucket.count }}</strong>
              </div>
              <div class="bar-track">
                <span class="bar-fill" [style.width.%]="bucket.width"></span>
              </div>
            </div>
          }
        </div>
      </ng-template>

      <ng-template #numericChart>
        @if (chartPoints.length > 1) {
          <div class="chart-frame">
            <svg viewBox="0 0 720 300" role="img" aria-label="Gráfica de línea de telemetría">
              <line class="axis" x1="56" y1="24" x2="56" y2="250" />
              <line class="axis" x1="56" y1="250" x2="692" y2="250" />
              @for (tick of yTicks; track tick.label) {
                <line class="grid-line" [attr.x1]="56" [attr.x2]="692" [attr.y1]="tick.y" [attr.y2]="tick.y" />
                <text class="tick-label" x="48" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
              }
              <polyline class="series-line" [attr.points]="linePoints" />
              @for (point of chartPoints; track point.item.recorded_at + point.item.device_id) {
                <circle class="series-dot" [attr.cx]="point.x" [attr.cy]="point.y" r="3.8">
                  <title>{{ point.item.device_name }} - {{ point.item.value }} {{ selectedUnitLabel }} - {{ point.item.recorded_at | date:'yyyy-MM-dd HH:mm:ss' }}</title>
                </circle>
              }
              <text class="x-label" x="56" y="282">{{ firstRecordDate }}</text>
              <text class="x-label" x="692" y="282" text-anchor="end">{{ lastRecordDate }}</text>
            </svg>
          </div>
        } @else {
          <div class="empty-chart">
            No hay suficientes valores numéricos para construir una gráfica de línea.
          </div>
        }
      </ng-template>
    </div>
  `,
  styleUrl: './telemetry-history.component.scss'
})
export class TelemetryHistoryComponent implements OnInit, OnDestroy {
  private static cache: HistoryCacheState | null = null;
  private historyRequest?: Subscription;
  private clockTimer?: ReturnType<typeof setInterval>;

  devices: Device[] = [];
  history: TelemetryHistoryItem[] = [];
  loading = false;
  errorMessage = '';

  selectedDeviceId: number | null = null;
  deviceSearchTerm = '';
  rangePreset: RangePreset = '24h';
  startDateTime = '';
  endDateTime = '';
  limit = 50;
  showAllRecords = false;
  readonly initialRecordLimit = 8;
  updatedAt: number | null = null;
  nowTimestamp = Date.now();

  constructor(
    private http: HttpClient,
    private deviceSvc: DeviceService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.clockTimer = setInterval(() => {
      this.nowTimestamp = Date.now();
      this.cdr.markForCheck();
    }, 10000);

    const routeDeviceId = this.route.snapshot.queryParamMap.get('deviceId');
    const cachedState = TelemetryHistoryComponent.cache;
    if (cachedState && !routeDeviceId) {
      this.restoreCache(cachedState);

      if (this.rangePreset !== 'custom') {
        this.applyPreset(false);
      }

      this.loadDevices(true);
      this.loadHistory(true);
      return;
    }

    this.applyPreset(false);
    if (routeDeviceId) {
      const parsedDeviceId = Number(routeDeviceId);
      this.selectedDeviceId = Number.isFinite(parsedDeviceId) ? parsedDeviceId : null;
      this.deviceSearchTerm = '';
    }
    this.loadDevices();
    this.loadHistory();
  }

  ngOnDestroy() {
    this.historyRequest?.unsubscribe();
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  get latestRecord(): TelemetryHistoryItem | null {
    return this.history[0] ?? null;
  }

  get selectedDevice(): Device | null {
    if (!this.selectedDeviceId) return null;
    return this.devices.find(device => device.id === this.selectedDeviceId) ?? null;
  }

  get weatherDevices(): Device[] {
    return this.devices.filter(device => device.entity_id.toLowerCase().startsWith('weather.'));
  }

  get regularDevices(): Device[] {
    return this.devices.filter(device => !device.entity_id.toLowerCase().startsWith('weather.'));
  }

  get filteredDevices(): Device[] {
    const term = this.normalizedDeviceSearchTerm;
    if (!term) return this.devices;
    return this.devices.filter(device => this.deviceMatchesSearch(device, term));
  }

  get filteredWeatherDevices(): Device[] {
    return this.filteredDevices.filter(device => device.entity_id.toLowerCase().startsWith('weather.'));
  }

  get filteredRegularDevices(): Device[] {
    return this.filteredDevices.filter(device => !device.entity_id.toLowerCase().startsWith('weather.'));
  }

  get normalizedDeviceSearchTerm(): string {
    return this.normalizeSearchText(this.deviceSearchTerm);
  }

  get visibleSearchResults(): Device[] {
    return this.filteredDevices.slice(0, 6);
  }

  get analysisMode(): AnalysisMode {
    const device = this.selectedDevice;
    if (!device) return 'mixed';
    if (this.isEnergyDevice(device)) return 'energy';
    if (this.isAccessDevice(device)) return 'access';
    if (this.isNumericRequirementDevice(device)) return 'numeric';
    return this.numericHistory.length > 1 ? 'numeric' : 'state';
  }

  get visibleHistory(): TelemetryHistoryItem[] {
    return this.showAllRecords ? this.history : this.history.slice(0, this.initialRecordLimit);
  }

  get numericHistory(): TelemetryHistoryItem[] {
    return this.history
      .filter(item => item.value !== null && Number.isFinite(item.value))
      .slice()
      .reverse();
  }

  get selectedDeviceLabel(): string {
    if (!this.selectedDeviceId) return 'Todos los dispositivos visibles';
    const device = this.devices.find(item => item.id === this.selectedDeviceId);
    if (!device) return 'Dispositivo seleccionado';
    return device.entity_id.toLowerCase().startsWith('weather.')
      ? `Clima exterior · ${this.weatherMetricLabel(device)}`
      : device.name;
  }

  get updatedAgoLabel(): string {
    if (!this.updatedAt) return '';
    const elapsedSeconds = Math.max(0, Math.floor((this.nowTimestamp - this.updatedAt) / 1000));
    if (elapsedSeconds < 10) return 'Actualizado ahora';
    if (elapsedSeconds < 60) return `Actualizado hace ${elapsedSeconds} segundos`;

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    return `Actualizado hace ${elapsedMinutes} min`;
  }

  get selectedUnitLabel(): string {
    if (!this.selectedDeviceId) return 'unidades mixtas';
    const unit = this.devices.find(device => device.id === this.selectedDeviceId)?.unit;
    return unit || 'sin unidad';
  }

  weatherMetricLabel(device: Device): string {
    return device.name.replace(/^Forecast Casa\s*-\s*/i, '').trim();
  }

  get activeRangeLabel(): string {
    const start = this.formatDateLabel(this.startDateTime);
    const end = this.formatDateLabel(this.endDateTime);
    return `${start} - ${end}`;
  }

  get numericValues(): number[] {
    return this.numericHistory.map(item => item.value as number);
  }

  get averageValueLabel(): string {
    if (!this.numericValues.length) return '-';
    const total = this.numericValues.reduce((sum, value) => sum + value, 0);
    return this.formatNumber(total / this.numericValues.length);
  }

  get minValueLabel(): string {
    return this.numericValues.length ? this.formatNumber(Math.min(...this.numericValues)) : '-';
  }

  get maxValueLabel(): string {
    return this.numericValues.length ? this.formatNumber(Math.max(...this.numericValues)) : '-';
  }

  get chartPoints(): ChartPoint[] {
    const data = this.numericHistory;
    if (data.length < 2) return [];

    const values = data.map(item => item.value as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const left = 56;
    const right = 692;
    const top = 24;
    const bottom = 250;

    return data.map((item, index) => ({
      item,
      x: left + (index / (data.length - 1)) * (right - left),
      y: bottom - (((item.value as number) - min) / range) * (bottom - top),
    }));
  }

  get linePoints(): string {
    return this.chartPoints.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  }

  get yTicks() {
    if (!this.numericValues.length) return [];
    const min = Math.min(...this.numericValues);
    const max = Math.max(...this.numericValues);
    const range = max - min || 1;
    return [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
      y: 250 - ratio * (250 - 24),
      label: this.formatNumber(min + ratio * range),
    })).reverse();
  }

  get firstRecordDate(): string {
    return this.numericHistory[0]?.recorded_at
      ? this.formatDateLabel(this.numericHistory[0].recorded_at)
      : '';
  }

  get lastRecordDate(): string {
    const item = this.numericHistory[this.numericHistory.length - 1];
    return item?.recorded_at ? this.formatDateLabel(item.recorded_at) : '';
  }

  get statusBuckets(): StatusBucket[] {
    const counts = new Map<string, number>();
    this.history.forEach(item => {
      const label = item.raw_state || 'sin estado';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    const max = Math.max(...counts.values(), 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({
        label,
        count,
        width: Math.max(6, (count / max) * 100),
      }));
  }

  get deviceBuckets(): DeviceBucket[] {
    const counts = new Map<number, { label: string; entityId: string; count: number }>();
    this.history.forEach(item => {
      const current = counts.get(item.device_id);
      counts.set(item.device_id, {
        label: item.device_name,
        entityId: item.entity_id,
        count: (current?.count ?? 0) + 1,
      });
    });

    const max = Math.max(...[...counts.values()].map(item => item.count), 1);
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        ...item,
        width: Math.max(6, (item.count / max) * 100),
      }));
  }

  get estimatedEnergyLabel(): string {
    const data = this.numericHistory;
    if (data.length < 2) return '-';

    let wattHours = 0;
    for (let index = 1; index < data.length; index += 1) {
      const previous = data[index - 1];
      const current = data[index];
      const hours = (new Date(current.recorded_at).getTime() - new Date(previous.recorded_at).getTime()) / 3600000;
      wattHours += (((previous.value as number) + (current.value as number)) / 2) * Math.max(0, hours);
    }

    return `${this.formatNumber(wattHours / 1000)} kWh`;
  }

  get currentLoadLabel(): string {
    const value = this.latestRecord?.value;
    if (value === null || value === undefined) return '-';
    if (value < 150) return 'Baja';
    if (value < 500) return 'Media';
    return 'Alta';
  }

  get energyLoadBuckets(): StatusBucket[] {
    const bands = [
      { label: 'Carga baja (< 150 W)', count: 0 },
      { label: 'Carga media (150-500 W)', count: 0 },
      { label: 'Carga alta (> 500 W)', count: 0 },
    ];

    this.numericValues.forEach(value => {
      if (value < 150) bands[0].count += 1;
      else if (value < 500) bands[1].count += 1;
      else bands[2].count += 1;
    });

    const max = Math.max(...bands.map(band => band.count), 1);
    return bands.map(band => ({
      ...band,
      width: Math.max(6, (band.count / max) * 100),
    }));
  }

  get accessEvents(): TelemetryHistoryItem[] {
    const chronological = this.history.slice().reverse();
    return chronological.filter((item, index) => {
      if (index === 0) return true;
      return item.raw_state !== chronological[index - 1].raw_state;
    }).slice(-8).reverse();
  }

  get accessSummary() {
    const states = this.history.map(item => item.raw_state);
    let transitionCount = 0;

    states.slice().reverse().forEach((state, index, chronological) => {
      if (index > 0 && state !== chronological[index - 1]) transitionCount += 1;
    });

    return {
      openCount: states.filter(state => this.isOpenState(state)).length,
      closedCount: states.filter(state => this.isClosedState(state)).length,
      transitionCount,
    };
  }

  loadDevices(background = false) {
    this.deviceSvc.getAllForAdmin().subscribe({
      next: devices => {
        this.devices = devices;
        this.persistCache();
        this.cdr.markForCheck();
      },
      error: () => {
        if (!background) this.errorMessage = 'No se pudo cargar el listado de dispositivos.';
        this.cdr.markForCheck();
      },
    });
  }

  onDeviceSearchChange() {
    this.persistCache();
  }

  clearDeviceSearch() {
    this.deviceSearchTerm = '';
    this.persistCache();
  }

  selectDeviceFromSearch(device: Device) {
    this.selectedDeviceId = device.id ?? null;
    this.loadHistory();
    this.persistCache();
  }

  loadHistory(background = false) {
    this.historyRequest?.unsubscribe();
    if (!background) this.loading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.historyRequest = this.http.get<TelemetryHistoryItem[]>(this.buildHistoryUrl()).subscribe({
      next: data => {
        this.history = data;
        this.showAllRecords = false;
        this.updatedAt = Date.now();
        this.nowTimestamp = this.updatedAt;
        this.persistCache();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (!background) this.history = [];
        this.loading = false;
        if (!background) this.errorMessage = 'No se pudo consultar el historial de telemetría.';
        this.cdr.markForCheck();
      }
    });
  }

  applyPreset(shouldLoad = true) {
    const now = new Date();
    const start = new Date(now);

    if (this.rangePreset === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (this.rangePreset === '7d') {
      start.setDate(now.getDate() - 7);
    } else if (this.rangePreset === '24h') {
      start.setHours(now.getHours() - 24);
    } else if (shouldLoad) {
      this.loadHistory();
      return;
    }

    this.startDateTime = this.toLocalDateTimeValue(start);
    this.endDateTime = this.toLocalDateTimeValue(now);

    if (shouldLoad) this.loadHistory();
  }

  setCustomRange() {
    this.rangePreset = 'custom';
    this.loadHistory();
  }

  private buildHistoryUrl(): string {
    const params = new URLSearchParams({
      limit: String(this.limit),
      offset: '0',
    });

    if (this.selectedDeviceId) params.set('device_id', String(this.selectedDeviceId));
    if (this.startDateTime) params.set('start', new Date(this.startDateTime).toISOString());
    if (this.endDateTime) params.set('end', new Date(this.endDateTime).toISOString());

    return `${API_BASE_URL}/telemetry/history?${params.toString()}`;
  }

  private restoreCache(cache: HistoryCacheState) {
    this.devices = cache.devices;
    this.history = cache.history;
    this.selectedDeviceId = cache.selectedDeviceId;
    this.deviceSearchTerm = cache.deviceSearchTerm ?? '';
    this.rangePreset = cache.rangePreset;
    this.startDateTime = cache.startDateTime;
    this.endDateTime = cache.endDateTime;
    this.limit = cache.limit;
    this.updatedAt = cache.fetchedAt;
    this.nowTimestamp = Date.now();
    this.loading = false;
    this.errorMessage = '';
    this.showAllRecords = false;
  }

  private persistCache() {
    TelemetryHistoryComponent.cache = {
      devices: this.devices,
      history: this.history,
      selectedDeviceId: this.selectedDeviceId,
      deviceSearchTerm: this.deviceSearchTerm,
      rangePreset: this.rangePreset,
      startDateTime: this.startDateTime,
      endDateTime: this.endDateTime,
      limit: this.limit,
      fetchedAt: this.updatedAt ?? Date.now(),
    };
  }

  isDeviceVisibleInSearch(device: Device): boolean {
    const term = this.normalizedDeviceSearchTerm;
    return !term || this.deviceMatchesSearch(device, term);
  }

  getDeviceSearchLabel(device: Device): string {
    return device.entity_id.toLowerCase().startsWith('weather.')
      ? this.weatherMetricLabel(device)
      : device.name;
  }

  private deviceMatchesSearch(device: Device, term: string): boolean {
    const haystack = [
      device.name,
      device.entity_id,
      device.device_type,
      device.unit ?? '',
      this.weatherMetricLabel(device),
    ].map(value => this.normalizeSearchText(value)).join(' ');

    return haystack.includes(term);
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  isOpenState(rawState: string): boolean {
    return ['open', 'opened', 'unlocked', 'on', 'true'].includes(rawState.toLowerCase());
  }

  isClosedState(rawState: string): boolean {
    return ['closed', 'locked', 'off', 'false'].includes(rawState.toLowerCase());
  }

  doorStateLabel(rawState: string): string {
    if (this.isOpenState(rawState)) return 'Puerta abierta';
    if (this.isClosedState(rawState)) return 'Puerta cerrada';
    return `Estado: ${rawState}`;
  }

  private isAccessDevice(device: Device): boolean {
    const entityId = device.entity_id.toLowerCase();
    const name = device.name.toLowerCase();
    const type = device.device_type.toLowerCase();
    return type === 'lock' || entityId.includes('puerta') || entityId.startsWith('lock.') || name.includes('puerta');
  }

  private isEnergyDevice(device: Device): boolean {
    const type = device.device_type.toLowerCase();
    const entityId = device.entity_id.toLowerCase();
    const unit = (device.unit ?? '').toLowerCase();
    return ['power', 'energy', 'plug'].includes(type)
      || ['w', 'kw', 'wh', 'kwh'].includes(unit)
      || entityId.includes('energy')
      || entityId.includes('power')
      || entityId.includes('consumo');
  }

  private isNumericRequirementDevice(device: Device): boolean {
    const type = device.device_type.toLowerCase();
    const entityId = device.entity_id.toLowerCase();
    return ['temperature', 'humidity', 'light', 'plug', 'sensor'].includes(type)
      || entityId.includes('temperatura')
      || entityId.includes('temperature')
      || entityId.includes('humedad')
      || entityId.includes('humidity')
      || entityId.includes('illuminance')
      || entityId.includes('energy')
      || entityId.includes('power');
  }

  private toLocalDateTimeValue(date: Date): string {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  private formatDateLabel(value: string): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 2,
    }).format(value);
  }
}
