import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="profile-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">Cuenta personal</p>
          <h2>Editar perfil</h2>
          <p>Actualiza tus datos de acceso al sistema.</p>
        </div>
        <span class="role-badge">{{ roleLabel }}</span>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()" class="profile-form">
        <section>
          <h3>Información personal</h3>
          <div class="form-grid">
            <div class="field">
              <label>Nombre de usuario</label>
              <input formControlName="username" />
            </div>
            <div class="field">
              <label>Correo institucional</label>
              <div class="email-control">
                <input formControlName="emailLocal" />
                <span>@unicauca.edu.co</span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3>Cambiar contraseña</h3>
          <p class="section-description">Déjala vacía si no deseas modificarla.</p>
          <div class="form-grid">
            <div class="field">
              <label>Contraseña actual</label>
              <input formControlName="currentPassword" type="password" autocomplete="current-password" />
            </div>
            <div class="field">
              <label>Nueva contraseña</label>
              <input formControlName="newPassword" type="password" autocomplete="new-password" />
              <small>Mínimo 8 caracteres, una mayúscula, una minúscula y un número.</small>
            </div>
          </div>
        </section>

        @if (message) {
          <p class="message" [class.error]="isError">{{ message }}</p>
        }

        <button class="btn-primary" type="submit" [disabled]="form.invalid || saving">
          {{ saving ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </form>
    </div>
  `,
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  saving = false;
  message = '';
  isError = false;

  form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    emailLocal: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]+$/)]],
    currentPassword: [''],
    newPassword: ['', Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)],
  });

  constructor(public auth: AuthService, private fb: FormBuilder) {}

  ngOnInit() {
    this.auth.loadProfile().subscribe({
      next: user => {
        this.form.patchValue({
          username: user.username,
          emailLocal: user.email.split('@')[0],
        });
      },
    });
  }

  get roleLabel() {
    return { admin: 'Administrador', docente: 'Docente', anonimo: 'Anónimo' }[this.auth.role() ?? 'anonimo'];
  }

  save() {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();

    if (value.newPassword && !value.currentPassword) {
      this.message = 'Debes ingresar tu contraseña actual para establecer una nueva.';
      this.isError = true;
      return;
    }

    this.saving = true;
    this.message = '';
    this.auth.updateProfile({
      username: value.username!,
      email: `${value.emailLocal!}@unicauca.edu.co`,
      ...(value.newPassword ? {
        current_password: value.currentPassword!,
        new_password: value.newPassword,
      } : {}),
    }).pipe(finalize(() => this.saving = false)).subscribe({
      next: () => {
        this.form.patchValue({ currentPassword: '', newPassword: '' });
        this.message = 'Perfil actualizado correctamente.';
        this.isError = false;
      },
      error: err => {
        this.message = err.error?.detail ?? 'No fue posible actualizar el perfil.';
        this.isError = true;
      },
    });
  }
}
