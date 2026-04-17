import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DeviceService } from '../../../core/services/device.service';
import { Device, DeviceCreate, DeviceType, Visibility } from '../../../core/models/device.model';

interface DiscoveredEntity {
  entity_id:          string;
  friendly_name:      string;
  state:              string;
  unit:               string | null;
  device_class:       string | null;
  already_registered: boolean;
}

const API = 'http://localhost:8000/api/v1';

// Mapeo automático device_class de HA → device_type de DAMBA
const DC_MAP: Record<string, DeviceType> = {
  temperature: 'temperature',
  humidity:    'humidity',
  power:       'plug',
  energy:      'plug',
  lock:        'lock',
  illuminance: 'light',
};

@Component({
  selector: 'app-admin-devices',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h2>Dispositivos</h2>
        <div class="header-actions">
          <!-- Auto-discovery: el flujo preferido -->
          <button class="btn-secondary" (click)="toggleDiscover()" [class.active]="showDiscover">
            🔍 Descubrir desde HA
          </button>
          <!-- Registro manual: para casos especiales -->
          <button class="btn-primary" (click)="showForm = !showForm; showDiscover = false">
            {{ showForm ? 'Cancelar' : '+ Manual' }}
          </button>
        </div>
      </div>

      <!-- ── AUTO-DISCOVERY ──────────────────────────────────────────────── -->
      @if (showDiscover) {
        <div class="discover-card">
          <div class="discover-header">
            <h3>Entidades disponibles en Home Assistant</h3>
            <button class="btn-text" (click)="loadDiscover()" [disabled]="loadingDiscover">
              {{ loadingDiscover ? 'Cargando...' : '↺ Actualizar' }}
            </button>
          </div>

          @if (discoverError) {
            <div class="error-banner">{{ discoverError }}</div>
          }

          <div class="discover-grid">
            @for (e of discovered; track e.entity_id) {
              <div class="discover-item" [class.registered]="e.already_registered"
                   [class.selected]="selectedEntities.has(e.entity_id)"
                   (click)="!e.already_registered && toggleSelect(e)">
                <div class="discover-check">
                  @if (e.already_registered) { <span class="badge-ok">✓ Registrado</span> }
                  @else { <input type="checkbox" [checked]="selectedEntities.has(e.entity_id)" (click)="$event.stopPropagation(); toggleSelect(e)" /> }
                </div>
                <div class="discover-info">
                  <span class="discover-name">{{ e.friendly_name }}</span>
                  <span class="discover-eid">{{ e.entity_id }}</span>
                </div>
                <div class="discover-state">
                  <strong>{{ e.state }}</strong>
                  @if (e.unit) { <span>{{ e.unit }}</span> }
                </div>
              </div>
            }
            @if (discovered.length === 0 && !loadingDiscover) {
              <p class="empty-discover">No se encontraron entidades relevantes en HA</p>
            }
          </div>

          @if (selectedEntities.size > 0) {
            <div class="discover-footer">
              <span>{{ selectedEntities.size }} entidad(es) seleccionada(s)</span>
              <button class="btn-primary" (click)="importSelected()" [disabled]="importing">
                {{ importing ? 'Importando...' : 'Importar seleccionadas' }}
              </button>
            </div>
          }
        </div>
      }

      <!-- ── FORMULARIO MANUAL ───────────────────────────────────────────── -->
      @if (showForm) {
        <div class="form-card">
          <h3>Registrar dispositivo manualmente</h3>
          <form [formGroup]="form" (ngSubmit)="create()">
            <div class="form-grid">
              <div class="field">
                <label>Entity ID (Home Assistant)</label>
                <input formControlName="entity_id" placeholder="sensor.mi_sensor" />
              </div>
              <div class="field">
                <label>Nombre visible</label>
                <input formControlName="name" placeholder="Temperatura sala" />
              </div>
              <div class="field">
                <label>Tipo</label>
                <select formControlName="device_type">
                  <option value="temperature">Temperatura</option>
                  <option value="humidity">Humedad</option>
                  <option value="plug">Enchufe</option>
                  <option value="lock">Cerradura</option>
                  <option value="light">Luz</option>
                  <option value="other">Otro</option>
                </select>
              </div>
              <div class="field">
                <label>Unidad (ej: °C, %)</label>
                <input formControlName="unit" placeholder="°C" />
              </div>
              <div class="field">
                <label>Visibilidad</label>
                <select formControlName="visibility">
                  <option value="public">Público (todos)</option>
                  <option value="docente">Docente+</option>
                  <option value="admin">Solo admin</option>
                </select>
              </div>
            </div>
            @if (createError) { <p class="error-msg">{{ createError }}</p> }
            <button type="submit" class="btn-primary" [disabled]="form.invalid || creating">
              {{ creating ? 'Guardando...' : 'Guardar' }}
            </button>
          </form>
        </div>
      }

      <!-- ── TABLA DE DISPOSITIVOS REGISTRADOS ──────────────────────────── -->
      <table class="data-table">
        <thead>
          <tr>
            <th>Nombre</th><th>Entity ID</th><th>Tipo</th>
            <th>Unidad</th><th>Visibilidad</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (d of devices; track d.id) {
            <tr>
              <td>{{ d.name }}</td>
              <td class="mono">{{ d.entity_id }}</td>
              <td>{{ d.device_type }}</td>
              <td>{{ d.unit ?? '-' }}</td>
              <td><span class="vis-badge vis-{{ d.visibility }}">{{ d.visibility }}</span></td>
              <td>
                <span class="status-dot" [class.active]="d.is_active"></span>
                {{ d.is_active ? 'Activo' : 'Inactivo' }}
              </td>
              <td class="actions">
                <button class="btn-icon" (click)="toggleActive(d)">{{ d.is_active ? '⏸' : '▶' }}</button>
                <button class="btn-icon danger" (click)="delete(d.id)">✕</button>
              </td>
            </tr>
          }
          @if (devices.length === 0) {
            <tr><td colspan="7" class="empty-cell">No hay dispositivos registrados</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './admin-devices.component.scss'
})
export class AdminDevicesComponent implements OnInit {
  devices: Device[]  = [];
  showForm           = false;
  showDiscover       = false;
  creating           = false;
  importing          = false;
  loadingDiscover    = false;
  createError        = '';
  discoverError      = '';
  discovered: DiscoveredEntity[] = [];
  selectedEntities   = new Set<string>();

  form = this.fb.group({
    entity_id:   ['', Validators.required],
    name:        ['', Validators.required],
    device_type: ['temperature' as DeviceType, Validators.required],
    unit:        [''],
    visibility:  ['public' as Visibility, Validators.required],
  });

  constructor(
    private deviceSvc: DeviceService,
    private http: HttpClient,
    private fb: FormBuilder,
  ) {}

  ngOnInit() { this.loadDevices(); }

  loadDevices() {
    this.deviceSvc.getAll().subscribe(d => this.devices = d);
  }

  // ── Auto-discovery ──────────────────────────────────────────────────────

  toggleDiscover() {
    this.showDiscover = !this.showDiscover;
    this.showForm     = false;
    if (this.showDiscover && this.discovered.length === 0) this.loadDiscover();
  }

  loadDiscover() {
    this.loadingDiscover = true;
    this.discoverError   = '';
    this.http.get<DiscoveredEntity[]>(`${API}/devices/discover`).subscribe({
      next: data => { this.discovered = data; this.loadingDiscover = false; },
      error: ()  => { this.discoverError = 'No se pudo conectar a Home Assistant'; this.loadingDiscover = false; }
    });
  }

  toggleSelect(e: DiscoveredEntity) {
    if (e.already_registered) return;
    if (this.selectedEntities.has(e.entity_id)) this.selectedEntities.delete(e.entity_id);
    else this.selectedEntities.add(e.entity_id);
  }

  importSelected() {
    this.importing = true;
    const entities = this.discovered
      .filter(e => this.selectedEntities.has(e.entity_id))
      .map(e => ({
        entity_id:   e.entity_id,
        name:        e.friendly_name,
        device_type: DC_MAP[e.device_class ?? ''] ?? 'other',
        unit:        e.unit,
        visibility:  'public',
      }));

    this.http.post(`${API}/devices/discover/import`, { entities }).subscribe({
      next: () => {
        this.selectedEntities.clear();
        this.loadDevices();
        this.loadDiscover();   // refrescar para mostrar checkmarks de registrado
        this.importing = false;
      },
      error: () => { this.discoverError = 'Error al importar dispositivos'; this.importing = false; }
    });
  }

  // ── Registro manual ─────────────────────────────────────────────────────

  create() {
    if (this.form.invalid) return;
    this.creating    = true;
    this.createError = '';
    const p: DeviceCreate = {
      entity_id:   this.form.value.entity_id!,
      name:        this.form.value.name!,
      device_type: this.form.value.device_type! as DeviceType,
      unit:        this.form.value.unit || undefined,
      visibility:  this.form.value.visibility! as Visibility,
    };
    this.deviceSvc.create(p).subscribe({
      next: () => { this.loadDevices(); this.form.reset({ device_type: 'temperature', visibility: 'public' }); this.showForm = false; this.creating = false; },
      error: () => { this.createError = 'Error al crear el dispositivo'; this.creating = false; }
    });
  }

  toggleActive(d: Device) {
    this.deviceSvc.update(d.id, { is_active: !d.is_active }).subscribe(() => this.loadDevices());
  }

  delete(id: number) {
    if (!confirm('¿Eliminar este dispositivo?')) return;
    this.deviceSvc.delete(id).subscribe(() => this.loadDevices());
  }
}
