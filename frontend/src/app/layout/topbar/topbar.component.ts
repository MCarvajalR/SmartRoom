import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="topbar-left">
        @if (auth.hasRole('admin')) {
          <a href="http://100.118.222.115:8123" target="_blank" class="btn-ha">
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
          <button class="profile-button" type="button">
            <i class="fa-solid fa-user"></i>
            <span>{{ auth.user()?.username ?? auth.role() }}</span>
          </button>
        } @else {
          <a class="btn-login" routerLink="/login">Iniciar sesión</a>
        }
      </div>
    </header>
  `,
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent implements OnInit {
  constructor(public auth: AuthService, public theme: ThemeService) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe();
    }
  }
}
