import { ChangeDetectorRef, Component, OnInit } from '@angular/core'; import { DatePipe } from '@angular/common';
import { AccessService } from '../../core/services/access.service';
import { finalize } from 'rxjs';

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
  status = 'locked';
  logs: any[] = [];
  loading = false;

  constructor(
    private access: AccessService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadStatus();
    this.loadLogs();
  }

  loadStatus() {
    console.log('Consultando estado de puerta...');

    this.access.getStatus().subscribe({
      next: (res) => {
        console.log('Estado recibido desde backend:', res);
        this.status = res.state;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error consultando estado de puerta:', err);
      }
    });
  }

  loadLogs() {
    console.log('Consultando historial de acceso...');

    this.access.getLogs().subscribe({
      next: (data) => {
        console.log('Historial recibido:', data);
        this.logs = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error consultando historial:', err);
      }
    });
  }

  unlock() {
    console.log('Intentando abrir puerta...');
    this.loading = true;
    this.cdr.detectChanges();

    this.access.unlock()
      .pipe(finalize(() => {
        console.log('Finalizó petición de abrir');
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          console.log('Puerta abierta correctamente');
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
    console.log('Intentando cerrar puerta...');
    this.loading = true;
    this.cdr.detectChanges();

    this.access.lock()
      .pipe(finalize(() => {
        console.log('Finalizó petición de cerrar');
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          console.log('Puerta cerrada correctamente');
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
