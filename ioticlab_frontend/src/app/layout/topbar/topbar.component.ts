import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <a class="topbar-brand" routerLink="/dashboard">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="var(--color-primary)"/>
          <path d="M8 24 L16 8 L24 24" stroke="white" stroke-width="2.5" stroke-linejoin="round" fill="none"/>
          <circle cx="16" cy="18" r="3" fill="white"/>
        </svg>
        <span>DAMBA</span>
      </a>

      @if (auth.hasRole('admin')) {
      <a href="http://100.118.222.115:8123" target="_blank" class="nav-item">
        <img src="assets/home-assistant-logo.ico" alt="Home Assistant Logo" width="20" height="20">
        <span>Abrir Home Assistant</span>
      </a>
      }

      <div class="topbar-right">
        @if (auth.isLoggedIn()) {
          <span class="role-badge role-{{ auth.role() }}">{{ auth.role() }}</span>
          <span class="user-name">{{ auth.user()?.username ?? auth.role() }}</span>
          <button class="btn-logout" (click)="auth.logout()">Salir</button>
        } @else {
          <a class="btn-login" routerLink="/login">Iniciar sesión</a>
        }
      </div>
    </header>
  `,
  styleUrl: './topbar.component.scss'
})
export class TopbarComponent implements OnInit {
  constructor(public auth: AuthService) { }

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe();
    }
  }
}
