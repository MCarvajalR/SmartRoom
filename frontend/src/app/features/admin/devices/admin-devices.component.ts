import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DeviceService } from '../../../core/services/device.service';
import { Device, DeviceType, Visibility } from '../../../core/models/device.model';
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

@Component({
  selector: 'app-admin-devices',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h2>Dispositivos</h2>
        <div class="header-actions">
          <button class="btn-secondary" (click)="toggleDiscover()" [class.active]="showDiscover">
            🔍 Descubrir desde HA
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
              <td>
                <select class="vis-select" [value]="d.visibility" (change)="changeVisibility(d, $event)">
                  <option value="public">Público</option>
                  <option value="docente">Docente+</option>
                  <option value="admin">Solo admin</option>
                </select>
              </td>
              <td>
                <span class="status-dot" [class.active]="d.is_active"></span>
                {{ d.is_active ? 'Activo' : 'Inactivo' }}
              </td>
              <td class="actions">
                <button class="btn-icon" (click)="toggleActive(d)">{{ d.is_active ? '⏸' : '▶' }}</button>
                <button class="btn-icon danger" (click)="delete(d.id)" title="Eliminar">✕</button>
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
  devices: Device[] = [];
  showDiscover = false;
  importing = false;
  loadingDiscover = false;
  discoverError = '';
  discovered: DiscoveredEntity[] = [];
  selectedEntities = new Set<string>();

  constructor(
    private deviceSvc: DeviceService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() { this.loadDevices(); }

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
