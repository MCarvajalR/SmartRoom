import { Component, HostListener, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="topbar-left">
        @if (auth.hasRole('admin') && haUrl) {
          <a [href]="haUrl" target="_blank" class="btn-ha">
            <i class="fa-solid fa-house-signal"></i>
            <span>Abrir Home Assistant</span>
          </a>
        }
      </div>

      <div class="topbar-right">
        <button
          class="theme-toggle"
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.mode() === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'">
          <i class="fa-solid" [class.fa-moon]="theme.mode() === 'dark'" [class.fa-sun]="theme.mode() !== 'dark'"></i>
          <span>{{ theme.mode() === 'dark' ? 'Noche' : 'Día' }}</span>
        </button>

        @if (auth.isLoggedIn()) {
          <div class="account-menu">
            <button
              class="profile-button"
              type="button"
              aria-haspopup="menu"
              [attr.aria-expanded]="menuOpen"
              (click)="toggleMenu()">
              <i class="fa-solid fa-user"></i>
              <span>{{ auth.user()?.username ?? auth.role() }}</span>
              <i class="fa-solid fa-chevron-down menu-chevron" [class.open]="menuOpen"></i>
            </button>

            @if (menuOpen) {
              <div class="account-dropdown" role="menu">
                <div class="account-summary">
                  <strong>{{ auth.user()?.username ?? 'Usuario' }}</strong>
                  <span>{{ auth.user()?.email }}</span>
                </div>

                <a routerLink="/profile" role="menuitem" (click)="closeMenu()">
                  <i class="fa-solid fa-user-pen"></i>
                  <span>Editar perfil</span>
                </a>

                @if (auth.hasRole('admin')) {
                  <a routerLink="/admin/settings" role="menuitem" (click)="closeMenu()">
                    <i class="fa-solid fa-gear"></i>
                    <span>Configuración del sistema</span>
                  </a>
                }

                <button class="logout-option" type="button" role="menuitem" (click)="logout()">
                  <i class="fa-solid fa-arrow-right-from-bracket"></i>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            }
          </div>
        } @else {
          <a class="btn-login" routerLink="/login">Iniciar sesión</a>
        }
      </div>
    </header>
  `,
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent implements OnInit {
  menuOpen = false;
  haUrl = '';

  constructor(
    public auth: AuthService,
    public theme: ThemeService,
    private settingsService: SettingsService,
  ) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe();
    }
    this.settingsService.getSettings().subscribe({
      next: (s) => {
        if (s.ha_public_url) this.haUrl = s.ha_public_url;
      },
    });
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  logout() {
    this.closeMenu();
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: Event) {
    const target = event.target as Element | null;
    if (this.menuOpen && !target?.closest('.account-menu')) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape() {
    this.closeMenu();
  }
}
