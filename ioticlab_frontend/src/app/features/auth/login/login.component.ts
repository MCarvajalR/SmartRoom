import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Iniciar sesión</h1>
        <p class="sub">Panel de monitoreo DAMBA</p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="username">Usuario</label>
            <input id="username" type="text" formControlName="username" />
          </div>
          <div class="field">
            <label for="password">Contraseña</label>
            <input id="password" type="password" formControlName="password" />
          </div>

          @if (error) {
            <p class="error-msg">{{ error }}</p>
          }

          <button type="submit" class="btn-submit" [disabled]="loading">
            {{ loading ? 'Ingresando...' : 'Ingresar' }}
          </button>
        </form>
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
  error   = '';

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {}

  submit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.error   = '';

    const { username, password } = this.form.value;
    this.auth.login({ username: username!, password: password! }).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => {
        this.error   = 'Credenciales incorrectas';
        this.loading = false;
      }
    });
  }
}
