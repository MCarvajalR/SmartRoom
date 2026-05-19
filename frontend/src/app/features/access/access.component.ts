import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AccessService } from '../../core/services/access.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-access',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="access-page">
      <section class="access-hero">
        <div class="access-heading">
          <h2>Control de acceso</h2>
          <p>Estado y apertura de la puerta del laboratorio</p>
        </div>

        <div class="door-card">
          <div class="door-status" [class.unlocked]="status === 'unlocked'">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              @if (status === 'locked') {
                <rect x="5" y="11" width="14" height="10" rx="2" stroke-linecap="round"/>
                <path d="M8 11V7a4 4 0 1 1 8 0v4" stroke-linecap="round"/>
              } @else {
                <rect x="5" y="11" width="14" height="10" rx="2" stroke-linecap="round"/>
                <path d="M8 11V5a4 4 0 0 1 7.5-2" stroke-linecap="round" />
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
      </section>

      <section class="logs-section">
        <div class="section-title">
          <h3>Historial de acceso</h3>
          <span>{{ logs.length }} registros</span>
        </div>

        <div class="table-wrap">
          <table class="logs-table">
            <thead>
              <tr><th>Fecha</th><th>Acción</th><th>Usuario</th></tr>
            </thead>
            <tbody>
              @for (log of visibleLogs; track log.id) {
                <tr>
                  <td>{{ log.triggered_at | date:'dd/MM/yy HH:mm:ss' }}</td>
                  <td><span class="action-badge action-{{ log.action }}">{{ actionLabel(log.action) }}</span></td>
                  <td>{{ log.triggered_by }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (logs.length > initialLogLimit) {
          <button class="toggle-logs" type="button" (click)="showAllLogs = !showAllLogs">
            {{ showAllLogs ? 'Mostrar menos' : 'Mostrar todos' }}
          </button>
        }
      </section>
    </div>
  `,
  styleUrl: './access.component.scss'
})
export class AccessComponent implements OnInit {
  status = 'locked';
  logs: any[] = [];
  loading = false;
  showAllLogs = false;
  readonly initialLogLimit = 5;

  constructor(
    private access: AccessService,
    private cdr: ChangeDetectorRef
  ) {}

  get visibleLogs() {
    return this.showAllLogs ? this.logs : this.logs.slice(0, this.initialLogLimit);
  }

  ngOnInit() {
    this.loadStatus();
    this.loadLogs();
  }

  loadStatus() {
    this.access.getStatus().subscribe({
      next: (res) => {
        this.status = res.state;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error consultando estado de puerta:', err);
      }
    });
  }

  loadLogs() {
    this.access.getLogs().subscribe({
      next: (data) => {
        this.logs = data.filter(log =>
          (log.action === 'lock' || log.action === 'unlock') && log.triggered_by !== 'homeassistant'
        );
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error consultando historial:', err);
      }
    });
  }

  actionLabel(action: string) {
    const labels: Record<string, string> = {
      unlock: 'Abrir',
      lock: 'Cerrar',
    };

    return labels[action] ?? action;
  }

  unlock() {
    this.loading = true;
    this.cdr.detectChanges();

    this.access.unlock()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.status = 'unlocked';
          this.loadLogs();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error al abrir la puerta:', err);
        }
      });
  }

  lock() {
    this.loading = true;
    this.cdr.detectChanges();

    this.access.lock()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.status = 'locked';
          this.loadLogs();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error al cerrar la puerta:', err);
        }
      });
  }
}
