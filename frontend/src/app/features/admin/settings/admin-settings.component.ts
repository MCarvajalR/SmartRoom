import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../../../core/services/settings.service';

interface SystemSettings {
  telemetry_interval_seconds: number;
  door_entity_id: string | null;
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
            <button class="btn-primary" (click)="saveSettings()" [disabled]="saving || !hasChanged">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
          @if (saveMessage) {
            <p class="success-msg">{{ saveMessage }}</p>
          }
        </div>

<div class="config-section">
          <h3>Dispositivo de Control de Acceso</h3>
          <p class="description">Entity ID del dispositivo que controla la puerta (cerradura inteligente).</p>
          
          <div class="interval-input">
            <input type="text" [(ngModel)]="doorEntityId" (ngModelChange)="onDoorChange()" placeholder="lock.puerta_laboratorio" />
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
  doorEntityId = '';
  currentDoorEntityId = '';
  saving = false;
  saveMessage = '';
  hasChanged = false;
  hasDoorChanged = false;
  loaded = false;

  constructor(private settingsSvc: SettingsService) {}

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
        this.doorEntityId = s.door_entity_id || '';
        this.currentDoorEntityId = s.door_entity_id || '';
        this.hasChanged = false;
        this.hasDoorChanged = false;
        this.loaded = true;
      },
      error: (err) => {
        console.error('Error cargando settings:', err);
        this.loaded = true;
      }
    });

    setTimeout(() => {
      if (!this.loaded) {
        console.warn('Timeout esperando settings, mostrando UI con valores por defecto');
        this.loaded = true;
      }
    }, 5000);
  }

  onIntervalChange() {
    this.hasChanged = this.intervalValue !== this.currentInterval;
  }

  onDoorChange() {
    this.hasDoorChanged = this.doorEntityId !== this.currentDoorEntityId;
  }

  saveSettings() {
    this.saving = true;
    this.saveMessage = '';
    
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
        setTimeout(() => this.saveMessage = '', 3000);
      },
      error: (err) => {
        console.error('Error guardando:', err);
        this.saveMessage = 'Error al guardar';
        this.saving = false;
      }
    });
  }
}
