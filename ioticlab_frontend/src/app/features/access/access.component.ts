import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AccessService } from '../../core/services/access.service';

@Component({
  selector: 'app-access',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="access-page">
      <h2>Control de acceso</h2>

      <div class="door-card">
        <div class="door-status" [class.unlocked]="status === 'unlocked'">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            @if (status === 'locked') {
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            } @else {
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            }
          </svg>
          <span>{{ status === 'locked' ? 'Cerrado' : 'Abierto' }}</span>
        </div>

        <div class="door-actions">
          <button class="btn-unlock" (click)="unlock()" [disabled]="loading">
            Abrir
          </button>
          <button class="btn-lock" (click)="lock()" [disabled]="loading">
            Cerrar
          </button>
        </div>
      </div>

      <div class="logs-section">
        <h3>Historial de acceso</h3>
        <table class="logs-table">
          <thead>
            <tr><th>Fecha</th><th>Acción</th><th>Usuario</th></tr>
          </thead>
          <tbody>
            @for (log of logs; track log.id) {
              <tr>
                <td>{{ log.triggered_at | date:'dd/MM/yy HH:mm:ss' }}</td>
                <td><span class="action-badge action-{{ log.action }}">{{ log.action }}</span></td>
                <td>{{ log.triggered_by }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styleUrl: './access.component.scss'
})
export class AccessComponent implements OnInit {
  status  = 'locked';
  logs: any[] = [];
  loading = false;

  constructor(private access: AccessService) {}

  ngOnInit() {
    this.loadStatus();
    this.loadLogs();
  }

  loadStatus() {
    this.access.getStatus().subscribe(res => this.status = res.state);
  }

  loadLogs() {
    this.access.getLogs().subscribe(data => this.logs = data);
  }

  unlock() {
    this.loading = true;
    this.access.unlock().subscribe({ next: () => { this.loadStatus(); this.loadLogs(); this.loading = false; }, error: () => this.loading = false });
  }

  lock() {
    this.loading = true;
    this.access.lock().subscribe({ next: () => { this.loadStatus(); this.loadLogs(); this.loading = false; }, error: () => this.loading = false });
  }
}
