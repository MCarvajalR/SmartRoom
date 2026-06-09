import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs';
import { DeviceService } from '../../../core/services/device.service';
import { Device, DeviceType, DeviceUpdate, Visibility } from '../../../core/models/device.model';
import { API_BASE_URL } from '../../../core/api.config';

interface DiscoveredEntity {
  entity_id: string;
  friendly_name: string;
  state: string;
  unit: string | null;
  device_class: string | null;
  already_registered: boolean;
}

const DC_MAP: Record<string, DeviceType> = {
  temperature: 'temperature',
  humidity: 'humidity',
  power: 'plug',
  energy: 'plug',
  lock: 'lock',
  illuminance: 'light',
};

const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
  { value: 'temperature', label: 'Temperatura' },
  { value: 'humidity', label: 'Humedad' },
  { value: 'power', label: 'Potencia instantánea' },
  { value: 'energy', label: 'Consumo energético acumulado' },
  { value: 'plug', label: 'Enchufe inteligente' },
  { value: 'lock', label: 'Cerradura' },
  { value: 'light', label: 'Iluminación' },
  { value: 'binary_sensor', label: 'Sensor binario' },
  { value: 'input_boolean', label: 'Interruptor simulado' },
  { value: 'switch', label: 'Interruptor' },
  { value: 'device_tracker', label: 'Rastreador de dispositivo' },
  { value: 'climate', label: 'Climatización' },
  { value: 'cover', label: 'Persiana o cubierta' },
  { value: 'sensor', label: 'Sensor genérico' },
  { value: 'other', label: 'Otro' },
];

@Component({
  selector: 'app-admin-devices',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">Administración</p>
          <h2>Gestión de dispositivos</h2>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" (click)="toggleDiscover()" [class.active]="showDiscover">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>Descubrir desde HA</span>
          </button>
        </div>
      </div>

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

      @if (editingDevice) {
        <section class="form-card">
          <div class="form-heading">
            <div>
              <p class="eyebrow">Dispositivo seleccionado</p>
              <h3>Editar metadatos</h3>
              <p>Estos datos determinan cómo se identifica y representa el dispositivo en DAMBA.</p>
            </div>
            <button class="btn-text" type="button" (click)="closeEditor()">Cerrar</button>
          </div>

          <form [formGroup]="editForm" (ngSubmit)="saveDevice()">
            <div class="form-grid">
              <div class="field">
                <label>Nombre descriptivo</label>
                <input formControlName="name" />
              </div>

              <div class="field">
                <label>Entity ID</label>
                <input formControlName="entityId" readonly />
                <small>Identificador protegido de Home Assistant.</small>
              </div>

              <div class="field">
                <label>Tipo de dispositivo</label>
                <select formControlName="deviceType">
                  @for (type of deviceTypes; track type.value) {
                    <option [value]="type.value">{{ type.label }}</option>
                  }
                </select>
                <small>Define el análisis y las gráficas aplicables.</small>
              </div>

              <div class="field">
                <label>Unidad de medida</label>
                <input formControlName="unit" placeholder="Ej. °C, %, W o kWh" />
              </div>

              <div class="field">
                <label>Visibilidad</label>
                <select formControlName="visibility">
                  <option value="public">Público</option>
                  <option value="docente">Docentes y administradores</option>
                  <option value="admin">Solo administradores</option>
                </select>
              </div>

              <label class="toggle-field">
                <input type="checkbox" formControlName="isActive" />
                <span>Recolectar datos de este dispositivo</span>
              </label>
            </div>

            @if (editError) {
              <p class="error-msg">{{ editError }}</p>
            }

            <div class="form-actions">
              <button class="btn-secondary" type="button" (click)="closeEditor()">Cancelar</button>
              <button class="btn-primary" type="submit" [disabled]="editForm.invalid || savingDevice">
                {{ savingDevice ? 'Guardando...' : 'Guardar cambios' }}
              </button>
            </div>
          </form>
        </section>
      }

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nombre</th><th>Entity ID</th><th>Tipo</th>
              <th>Unidad</th><th>Visibilidad</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (d of devices; track d.id) {
              <tr [class.selected-row]="editingDevice?.id === d.id" [class.hidden-row]="!d.is_active">
                <td>{{ d.name }}</td>
                <td class="mono">{{ d.entity_id }}</td>
                <td>{{ typeLabel(d.device_type) }}</td>
                <td>{{ d.unit ?? '-' }}</td>
                <td><span class="vis-badge vis-{{ d.visibility }}">{{ visibilityLabel(d.visibility) }}</span></td>
                <td>
                  <span class="status-dot" [class.active]="d.is_active"></span>
                  {{ d.is_active ? 'Activo' : 'Inactivo' }}
                </td>
                <td class="actions">
                  <button class="btn-icon" type="button" (click)="openEditor(d)" title="Editar dispositivo" aria-label="Editar dispositivo">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="btn-icon" type="button" (click)="toggleActive(d)" [title]="d.is_active ? 'Desactivar dispositivo' : 'Activar dispositivo'" [attr.aria-label]="d.is_active ? 'Desactivar dispositivo' : 'Activar dispositivo'">
                    <i class="fa-solid" [class.fa-pause]="d.is_active" [class.fa-play]="!d.is_active"></i>
                  </button>
                  <button class="btn-icon danger" type="button" (click)="delete(d.id)" title="Eliminar dispositivo" aria-label="Eliminar dispositivo">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </td>
              </tr>
            }
            @if (devices.length === 0) {
              <tr><td colspan="7" class="empty-cell">No hay dispositivos registrados</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styleUrl: './admin-devices.component.scss'
})
export class AdminDevicesComponent implements OnInit {
  devices: Device[] = [];
  showDiscover = false;
  importing = false;
  loadingDiscover = false;
  discoverError = '';
  discovered: DiscoveredEntity[] = [];
  selectedEntities = new Set<string>();
  editingDevice: Device | null = null;
  savingDevice = false;
  editError = '';
  readonly deviceTypes = DEVICE_TYPES;

  editForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    entityId: [{ value: '', disabled: true }],
    deviceType: ['other' as DeviceType, Validators.required],
    unit: ['', Validators.maxLength(20)],
    visibility: ['public' as Visibility, Validators.required],
    isActive: [true],
  });

  constructor(
    private deviceSvc: DeviceService,
    private http: HttpClient,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() { this.loadDevices(); }

  openEditor(device: Device) {
    this.editingDevice = device;
    this.editError = '';
    this.editForm.reset({
      name: device.name,
      entityId: device.entity_id,
      deviceType: device.device_type,
      unit: device.unit ?? '',
      visibility: device.visibility,
      isActive: device.is_active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeEditor() {
    this.editingDevice = null;
    this.editError = '';
  }

  saveDevice() {
    if (!this.editingDevice || this.editForm.invalid) return;

    const value = this.editForm.getRawValue();
    const payload: DeviceUpdate = {
      name: value.name!.trim(),
      device_type: value.deviceType!,
      unit: value.unit?.trim() || null,
      visibility: value.visibility!,
      is_active: value.isActive!,
    };

    this.savingDevice = true;
    this.editError = '';
    this.deviceSvc.update(this.editingDevice.id, payload)
      .pipe(finalize(() => {
        this.savingDevice = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: updated => {
          this.devices = this.devices.map(device => device.id === updated.id ? updated : device);
          this.closeEditor();
        },
        error: err => {
          this.editError = this.errorDetail(err.error?.detail) || 'No fue posible guardar los cambios.';
        },
      });
  }

  loadDevices() {
    this.deviceSvc.getAllForAdmin().subscribe({
      next: (d) => {
        this.devices = d;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando dispositivos:', err);
      }
    });
  }

  toggleDiscover() {
    this.showDiscover = !this.showDiscover;
    if (this.showDiscover && this.discovered.length === 0) this.loadDiscover();
  }

  loadDiscover() {
    this.loadingDiscover = true;
    this.discoverError = '';
    this.http.get<DiscoveredEntity[]>(`${API_BASE_URL}/devices/discover`).subscribe({
      next: data => {
        this.discovered = data;
        this.loadingDiscover = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.discoverError = 'No se pudo conectar a Home Assistant';
        this.loadingDiscover = false;
        this.cdr.detectChanges();
      }
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
        entity_id: e.entity_id,
        name: e.friendly_name,
        device_type: DC_MAP[e.device_class ?? ''] ?? 'other',
        unit: e.unit,
        visibility: 'public',
      }));

    this.http.post(`${API_BASE_URL}/devices/discover/import`, { entities }).subscribe({
      next: () => {
        this.selectedEntities.clear();
        this.loadDevices();
        this.loadDiscover();
        this.importing = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.discoverError = 'Error al importar dispositivos';
        this.importing = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleActive(d: Device) {
    this.deviceSvc.update(d.id, { is_active: !d.is_active }).subscribe({
      next: () => {
        this.loadDevices();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error actualizando dispositivo:', err);
      }
    });
  }

  changeVisibility(d: Device, event: Event) {
    const newVisibility = (event.target as HTMLSelectElement).value as Visibility;
    this.deviceSvc.update(d.id, { visibility: newVisibility }).subscribe({
      next: () => {
        this.loadDevices();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cambiando visibilidad:', err);
      }
    });
  }

  typeLabel(type: DeviceType) {
    return this.deviceTypes.find(option => option.value === type)?.label ?? type;
  }

  visibilityLabel(visibility: Visibility) {
    return { public: 'Público', docente: 'Docentes', admin: 'Administradores' }[visibility];
  }

  private errorDetail(detail: unknown) {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(item => item?.msg).filter(Boolean).join(' ');
    return '';
  }

  delete(id: number) {
    if (!confirm('¿Eliminar este dispositivo? También se eliminará de Home Assistant.')) return;
    this.deviceSvc.delete(id).subscribe({
      next: () => {
        this.loadDevices();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error eliminando dispositivo:', err);
      }
    });
  }
}
