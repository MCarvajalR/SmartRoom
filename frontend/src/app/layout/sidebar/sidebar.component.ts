import { Component, HostBinding } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed">
      <!-- 1. LOGO: Identidad visual -->
      <div class="sidebar-logo">
        <span class="logo-mark"><i class="fa-brands fa-battle-net"></i></span>
        <h2>SMARTROOM</h2>
        <button
          type="button"
          class="sidebar-toggle"
          (click)="toggleCollapsed()"
          [attr.aria-label]="collapsed ? 'Expandir menu' : 'Comprimir menu'"
          [attr.title]="collapsed ? 'Expandir menu' : 'Comprimir menu'"
        >
          <i class="fa-solid" [class.fa-angles-right]="collapsed" [class.fa-angles-left]="!collapsed"></i>
        </button>
      </div>
      
      <nav class="sidebar-nav">
        <ul>
          <!-- 2. DASHBOARD: Acceso universal -->
          <li>
            <a routerLink="/dashboard" routerLinkActive="active">
              <i class="fa-regular fa-rectangle-list"></i> <span class="nav-label">Dashboard</span>
            </a>
          </li>
          
          <!-- 3. ACCESO: Ahora protegido (Admin y Docente) -->
          @if (auth.hasRole('admin', 'docente')) {
            <li>
              <a routerLink="/access" routerLinkActive="active">
                <i class="fa-brands fa-keycdn"></i> <span class="nav-label">Acceso</span>
              </a>
            </li>
          }

          <!-- 4. GESTION ADMIN: Solo visible si tiene permisos -->
          @if (auth.hasRole('admin', 'docente')) {
            <li class="menu-separator">Gesti&oacute;n Laboratorio</li>
            
            <li>
              <a routerLink="/admin/telemetry" routerLinkActive="active">
                <i class="fa-solid fa-chart-line"></i> <span class="nav-label">Historial</span>
              </a>
            </li>
            
            @if (auth.hasRole('admin')) {
              <li>
                <a routerLink="/admin/devices" routerLinkActive="active">
                  <i class="fa-brands fa-connectdevelop"></i> <span class="nav-label">Dispositivos</span>
                </a>
              </li>
              <li>
                <a routerLink="/admin/users" routerLinkActive="active">
                  <i class="fa-solid fa-chalkboard-user"></i> <span class="nav-label">Usuarios</span>
                </a>
              </li>
              <li>
                <a routerLink="/admin/settings" routerLinkActive="active">
                  <i class="fa-solid fa-gear"></i> <span class="nav-label">Configuraci&oacute;n</span>
                </a>
              </li>
            }
          }
        </ul>
      </nav>

      <!-- 5. FOOTER: Boton de salida -->
      <div class="sidebar-footer">
        <button (click)="auth.logout()" class="btn-logout">
          <i class="fas fa-sign-out-alt"></i> <span class="nav-label">Cerrar Sesi&oacute;n</span>
        </button>
      </div>
    </aside>
  `,
  // No olvides que los estilos deben estar en sidebar.component.scss 
  // o ser globales en styles.scss para que funcionen las clases.
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  collapsed = window.innerWidth <= 760;

  constructor(public auth: AuthService) {}

  @HostBinding('class.sidebar-collapsed')
  get isCollapsed() {
    return this.collapsed;
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed;
  }
}
