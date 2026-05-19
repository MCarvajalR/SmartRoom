import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="login-wrap" [class.leaving]="isLeaving">
      <div class="login-card">
        <h1>Iniciar sesión</h1>
        <p class="sub">Gestión de Laboratorio Inteligente</p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="username">Usuario</label>
            <input
              id="username"
              type="text"
              formControlName="username"
              placeholder="Ej. admin"
              autocomplete="username" />
          </div>

          <div class="field">
            <label for="password">Contraseña</label>
            <div class="password-control">
              <input
                id="password"
                [type]="passwordVisible ? 'text' : 'password'"
                formControlName="password"
                placeholder="••••••••"
                autocomplete="current-password" />
              <button
                class="password-toggle"
                type="button"
                aria-label="Mostrar contraseña mientras se mantiene pulsado"
                [attr.aria-pressed]="passwordVisible"
                (pointerdown)="showPassword($event)"
                (pointerup)="hidePassword()"
                (pointercancel)="hidePassword()"
                (pointerleave)="hidePassword()"
                (blur)="hidePassword()">
              </button>
            </div>
          </div>

          <div style="min-height: 24px;">
            @if (error) {
              <p class="error-msg" style="color: #fb7185; font-size: 0.85rem; margin-bottom: 16px;">
                <i class="fas fa-exclamation-circle"></i> {{ error }}
              </p>
            }
          </div>

          <button type="submit" class="btn-submit" [disabled]="loading">
            {{ loading ? 'Verificando...' : 'Ingresar al sistema' }}
          </button>
        </form>

        <div class="guest-link">
          <a (click)="goAsGuest()">Explorar como invitado</a>
          <span>Monitoreo de dispositivos públicos</span>
        </div>
      </div>
    </div>
  `,
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  loading = false;
  error = '';
  passwordVisible = false;
  isLeaving = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {}

  submit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.error = '';

    const { username, password } = this.form.value;
    this.auth.login({ username: username!, password: password! }).subscribe({
      next: () => this.enterDashboard(),
      error: () => {
        this.error = 'Credenciales incorrectas';
        this.loading = false;
      }
    });
  }

  showPassword(event: PointerEvent) {
    event.preventDefault();
    this.passwordVisible = true;
  }

  hidePassword() {
    this.passwordVisible = false;
  }

  goAsGuest() {
    this.enterDashboard();
  }

  private enterDashboard() {
    this.isLeaving = true;
    window.setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 340);
  }
}
