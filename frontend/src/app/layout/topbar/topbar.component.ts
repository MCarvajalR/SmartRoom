import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <!-- Lado Izquierdo: Acciones Administrativas -->
      <div class="topbar-left">
        @if (auth.hasRole('admin')) {
          <a href="http://100.118.222.115:8123" target="_blank" class="btn-ha">
            <i class="fa-solid fa-house-signal"></i>
            <span>Abrir Home Assistant</span>
          </a>
        }
      </div>

      <!-- Lado Derecho: Usuario y Sesión -->
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
