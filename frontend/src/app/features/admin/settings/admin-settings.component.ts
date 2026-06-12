import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../../../core/services/settings.service';

interface SystemSettings {
  telemetry_interval_seconds: number;
  telemetry_retention_days: number;
  telemetry_retention_enabled: boolean;
  door_entity_id: string | null;
  deleted_records: number;
}

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h2>Configuración del Sistema</h2>
      </div>

      @if (loaded) {
        <div class="config-section">
          <h3>Intervalo de Telemetría</h3>
          <p class="description">Define cada cuántos segundos se recolectan los datos de telemetría desde Home Assistant.</p>
          
          <div class="interval-input">
            <input type="number" [(ngModel)]="intervalValue" (ngModelChange)="onIntervalChange()" min="10" max="3600" />
            <span>segundos</span>
            <button class="btn-primary" (click)="saveSettings()" [disabled]="saving || !hasChanged || !isIntervalValid">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
          <p class="current-value">Valor activo: {{ currentInterval }} segundos</p>
          @if (saveMessage) {
            <p class="success-msg">{{ saveMessage }}</p>
          }
        </div>

        <div class="config-section">
          <h3>Retenci&oacute;n del Historial</h3>
          <p class="description">Define durante cu&aacute;ntos d&iacute;as se conservan los registros de telemetr&iacute;a. La limpieza se ejecuta diariamente.</p>

          <div class="interval-input">
            <input type="number" [(ngModel)]="retentionDays" (ngModelChange)="onRetentionChange()" min="1" max="3650" />
            <span>d&iacute;as</span>
            <button class="btn-primary" (click)="requestRetentionConfirmation()" [disabled]="savingRetention || loadingRetentionPreview || !hasRetentionChanged || !isRetentionValid">
              {{ loadingRetentionPreview ? 'Calculando...' : 'Revisar cambio' }}
            </button>
          </div>
          <p class="current-value">
            {{ retentionEnabled ? 'Valor activo: ' + currentRetentionDays + ' dias' : 'La limpieza automatica aun no esta activada.' }}
          </p>
          @if (hasRetentionChanged && !isRetentionValid) {
            <p class="error-msg validation-msg">Ingresa un n&uacute;mero entero entre 1 y 3650 d&iacute;as.</p>
          }

          @if (retentionConfirmationPending) {
            <div class="retention-warning" role="alert">
              <strong>Esta acci&oacute;n eliminar&aacute; informaci&oacute;n permanentemente</strong>
              <p>Se borrar&aacute;n permanentemente {{ recordsToDelete.toLocaleString('es-CO') }} registros anteriores al {{ retentionCutoffLabel }}.</p>
              <p>PostgreSQL reutilizar&aacute; el espacio liberado, aunque el tama&ntilde;o del archivo puede no disminuir inmediatamente.</p>
              <div class="confirmation-actions">
                <button class="btn-secondary" type="button" (click)="cancelRetentionConfirmation()" [disabled]="savingRetention">Cancelar</button>
                <button class="btn-danger" type="button" (click)="confirmRetentionChange()" [disabled]="savingRetention">
                  {{ savingRetention ? 'Eliminando...' : 'S&iacute;, aplicar y eliminar' }}
                </button>
              </div>
            </div>
          }

          @if (retentionMessage) {
            <p class="success-msg" [class.error-msg]="retentionMessageIsError">{{ retentionMessage }}</p>
          }
        </div>

        <div class="config-section">
          <h3>Dispositivo de Control de Acceso</h3>
          <p class="description">ID del dispositivo en SmartRoom o Entity ID de Home Assistant que se acciona desde el control de acceso.</p>
          
          <div class="interval-input">
            <input type="text" [(ngModel)]="doorEntityId" (ngModelChange)="onDoorChange()" placeholder="12 o switch.interruptor" />
            <button class="btn-primary" (click)="saveSettings()" [disabled]="saving || !hasDoorChanged">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
          <p class="current-value">Valor actual: {{ currentDoorEntityId }}</p>
        </div>
      } @else {
        <div class="loading">Cargando configuración...</div>
      }
    </div>
  `,
  styleUrl: './admin-settings.component.scss'
})
export class AdminSettingsComponent implements OnInit {
  intervalValue = 60;
  currentInterval = 60;
  retentionDays = 30;
  currentRetentionDays = 30;
  retentionEnabled = false;
  doorEntityId = 'input_boolean.puerta_laboratorio_simulada';
  currentDoorEntityId = 'input_boolean.puerta_laboratorio_simulada';
  saving = false;
  savingRetention = false;
  loadingRetentionPreview = false;
  saveMessage = '';
  retentionMessage = '';
  hasChanged = false;
  hasRetentionChanged = false;
  hasDoorChanged = false;
  retentionConfirmationPending = false;
  retentionMessageIsError = false;
  recordsToDelete = 0;
  retentionCutoff: Date | null = null;
  loaded = false;

  constructor(
    private settingsSvc: SettingsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    console.log('Cargando settings...');
    this.settingsSvc.getSettings().subscribe({
      next: (s: SystemSettings) => {
        console.log('Settings recibidos:', s);
        this.intervalValue = s.telemetry_interval_seconds;
        this.currentInterval = s.telemetry_interval_seconds;
        this.retentionDays = s.telemetry_retention_days;
        this.currentRetentionDays = s.telemetry_retention_days;
        this.retentionEnabled = s.telemetry_retention_enabled;
        this.doorEntityId = s.door_entity_id || 'input_boolean.puerta_laboratorio_simulada';
        this.currentDoorEntityId = s.door_entity_id || 'input_boolean.puerta_laboratorio_simulada';
        this.hasChanged = false;
        this.hasRetentionChanged = !s.telemetry_retention_enabled;
        this.hasDoorChanged = false;
        this.loaded = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando settings:', err);
        this.loaded = true;
        this.cdr.detectChanges();
      }
    });

    setTimeout(() => {
      if (!this.loaded) {
        console.warn('Timeout esperando settings, mostrando UI con valores por defecto');
        this.loaded = true;
        this.cdr.detectChanges();
      }
    }, 5000);
  }

  onIntervalChange() {
    this.hasChanged = this.intervalValue !== this.currentInterval;
  }

  get isIntervalValid() {
    return Number.isInteger(this.intervalValue) && this.intervalValue >= 10 && this.intervalValue <= 3600;
  }

  onRetentionChange() {
    this.hasRetentionChanged = this.retentionDays !== this.currentRetentionDays || !this.retentionEnabled;
    this.retentionConfirmationPending = false;
    this.retentionMessage = '';
    this.retentionMessageIsError = false;
  }

  get isRetentionValid() {
    return Number.isInteger(this.retentionDays) && this.retentionDays >= 1 && this.retentionDays <= 3650;
  }

  get retentionCutoffLabel() {
    const cutoff = this.retentionCutoff ?? new Date();
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(cutoff);
  }

  requestRetentionConfirmation() {
    if (!this.hasRetentionChanged || !this.isRetentionValid) return;
    this.loadingRetentionPreview = true;
    this.retentionMessage = '';
    this.retentionMessageIsError = false;
    this.settingsSvc.previewRetention(this.retentionDays).subscribe({
      next: preview => {
        this.recordsToDelete = preview.records_to_delete;
        this.retentionCutoff = new Date(preview.cutoff);
        this.retentionConfirmationPending = true;
        this.loadingRetentionPreview = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.loadingRetentionPreview = false;
        this.retentionMessageIsError = true;
        this.retentionMessage = err.error?.detail || 'No fue posible calcular el impacto del cambio.';
        this.cdr.detectChanges();
      },
    });
  }

  cancelRetentionConfirmation() {
    this.retentionConfirmationPending = false;
  }

  confirmRetentionChange() {
    if (!this.retentionConfirmationPending || !this.isRetentionValid) return;

    this.savingRetention = true;
    this.retentionMessage = '';
    this.retentionMessageIsError = false;
    this.settingsSvc.updateSettings({
      telemetry_retention_days: this.retentionDays,
      confirm_retention_cleanup: true,
    }).subscribe({
      next: (s: SystemSettings) => {
        this.currentRetentionDays = s.telemetry_retention_days;
        this.retentionDays = s.telemetry_retention_days;
        this.retentionEnabled = s.telemetry_retention_enabled;
        this.hasRetentionChanged = false;
        this.retentionConfirmationPending = false;
        this.savingRetention = false;
        this.retentionMessage = `Retencion actualizada. Se eliminaron ${s.deleted_records.toLocaleString('es-CO')} registros.`;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error actualizando retencion:', err);
        this.savingRetention = false;
        this.retentionMessageIsError = true;
        this.retentionMessage = err.error?.detail || 'No fue posible actualizar la retencion.';
        this.cdr.detectChanges();
      },
    });
  }

  onDoorChange() {
    this.hasDoorChanged = this.doorEntityId !== this.currentDoorEntityId;
  }

  saveSettings() {
    if (this.hasChanged && !this.isIntervalValid) return;

    this.saving = true;
    this.saveMessage = '';
    this.cdr.detectChanges();
    
    const intervalToSave = this.hasChanged && this.intervalValue !== null ? this.intervalValue : undefined;
    
    this.settingsSvc.updateSettings({ 
      telemetry_interval_seconds: intervalToSave,
      door_entity_id: this.hasDoorChanged ? this.doorEntityId : undefined
    }).subscribe({
      next: (s: SystemSettings) => {
        this.currentInterval = s.telemetry_interval_seconds;
        this.currentDoorEntityId = s.door_entity_id || '';
        this.hasChanged = false;
        this.hasDoorChanged = false;
        this.saveMessage = 'Configuración actualizada correctamente';
        this.saving = false;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.saveMessage = '';
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (err) => {
        console.error('Error guardando:', err);
        this.saveMessage = err.error?.detail || 'Error al guardar';
        this.saving = false;
        this.cdr.detectChanges();
      }
    });
  }
}
