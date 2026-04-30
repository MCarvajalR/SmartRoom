import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserCreate, UserRole } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [ReactiveFormsModule, SlicePipe],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <h2>Usuarios</h2>
        <button class="btn-primary" (click)="showForm = !showForm">
          {{ showForm ? 'Cancelar' : '+ Agregar usuario' }}
        </button>
      </div>

      @if (showForm) {
        <div class="form-card">
          <h3>Nuevo usuario</h3>
          <form [formGroup]="form" (ngSubmit)="create()">
            <div class="form-grid">
              <div class="field">
                <label>Usuario</label>
                <input formControlName="username" placeholder="john_doe" />
              </div>
              <div class="field">
                <label>Email</label>
                <input formControlName="email" type="email" placeholder="john@unicauca.edu.co" />
              </div>
              <div class="field">
                <label>Contraseña</label>
                <input formControlName="password" type="password" placeholder="••••••••" />
              </div>
              <div class="field">
                <label>Rol</label>
                <select formControlName="role">
                  <option value="anonimo">Anónimo (solo lectura pública)</option>
                  <option value="docente">Docente (lectura + acceso)</option>
                  <option value="admin">Admin (control total)</option>
                </select>
              </div>
            </div>
            @if (createError) { <p class="error-msg">{{ createError }}</p> }
            <button type="submit" class="btn-primary" [disabled]="form.invalid || creating">
              {{ creating ? 'Guardando...' : 'Guardar usuario' }}
            </button>
          </form>
        </div>
      }

      <table class="data-table">
        <thead>
          <tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Creado</th></tr>
        </thead>
        <tbody>
          @for (u of users; track u.id) {
            <tr>
              <td class="user-cell">
                <div class="avatar">{{ u.username[0].toUpperCase() }}</div>
                {{ u.username }}
              </td>
              <td class="muted">{{ u.email }}</td>
              <td><span class="role-badge role-{{ u.role }}">{{ u.role }}</span></td>
              <td>
                <span class="status-dot" [class.active]="u.is_active"></span>
                {{ u.is_active ? 'Activo' : 'Inactivo' }}
              </td>
              <td class="muted small">{{ u.created_at | slice:0:10 }}</td>
            </tr>
          }
          @if (users.length === 0) {
            <tr><td colspan="5" class="empty-cell">No hay usuarios registrados</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users: User[] = [];
  showForm = false;
  creating = false;
  createError = '';

  form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['anonimo' as UserRole, Validators.required],
  });

  constructor(
    private auth: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() { this.load(); }

  load() {
    this.auth.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error cargando usuarios:', err);
      }
    });
  }

  create() {
    if (this.form.invalid) return;
    this.creating = true;
    this.createError = '';
    const payload: UserCreate = {
      username: this.form.value.username!,
      email: this.form.value.email!,
      password: this.form.value.password!,
      role: this.form.value.role! as UserRole,
    };
    this.auth.createUser(payload).subscribe({
      next: () => {
        this.load();
        this.form.reset({ role: 'anonimo' });
        this.showForm = false;
        this.creating = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.createError = 'Error al crear el usuario. Verifica que el nombre de usuario no exista.';
        this.creating = false;
        this.cdr.detectChanges();

      }
    });
  }
}
