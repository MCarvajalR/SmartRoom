import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <!-- 1. LOGO: Identidad visual idéntica -->
      <div class="sidebar-logo">
        <h2><i class="fa-brands fa-battle-net"></i> SMARTROOM</h2>
      </div>
      
      <nav class="sidebar-nav">
        <ul>
          <!-- 2. DASHBOARD: Acceso universal -->
          <li>
            <a routerLink="/dashboard" routerLinkActive="active">
              <i class="fa-regular fa-rectangle-list"></i> Dashboard
            </a>
          </li>
          
          <!-- 3. ACCESO: Ahora protegido (Admin y Docente) -->
          @if (auth.hasRole('admin', 'docente')) {
            <li>
              <a routerLink="/access" routerLinkActive="active">
                <i class="fa-brands fa-keycdn"></i> Acceso
              </a>
            </li>
          }

          <!-- 4. GESTIÓN ADMIN: Solo visible si tiene permisos de gestión -->
          @if (auth.hasRole('admin', 'docente')) {
            <div class="menu-separator">Gestión Laboratorio</div>
            
            <li>
              <a routerLink="/admin/telemetry" routerLinkActive="active">
                <i class="fa-solid fa-chart-line"></i> Historial
              </a>
            </li>
            
            @if (auth.hasRole('admin')) {
              <li>
                <a routerLink="/admin/devices" routerLinkActive="active">
                  <i class="fa-brands fa-connectdevelop"></i> Dispositivos
                </a>
              </li>
              <li>
                <a routerLink="/admin/users" routerLinkActive="active">
                  <i class="fa-solid fa-chalkboard-user"></i> Usuarios
                </a>
              </li>
              <li>
                <a routerLink="/admin/settings" routerLinkActive="active">
                  <i class="fa-solid fa-gear"></i> Configuración
                </a>
              </li>
            }
          }
        </ul>
      </nav>

      <!-- 5. FOOTER: Botón de salida con la misma clase -->
      <div class="sidebar-footer">
        <button (click)="auth.logout()" class="btn-logout">
          <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
        </button>
      </div>
    </aside>
  `,
  // No olvides que los estilos deben estar en sidebar.component.scss 
  // o ser globales en styles.scss para que funcionen las clases.
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  constructor(public auth: AuthService) {}
}
