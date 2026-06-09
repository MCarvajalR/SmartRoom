import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserCreate, UserRole, UserUpdate } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [ReactiveFormsModule, SlicePipe],
  template: `
    <div class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">Administración</p>
          <h2>Gestión de usuarios</h2>
        </div>
        <button class="btn-primary" (click)="openCreate()">
          {{ showForm && !editingUser ? 'Cancelar' : 'Agregar usuario' }}
        </button>
      </div>

      <section class="summary-grid">
        <article><span>Total</span><strong>{{ users.length }}</strong></article>
        <article><span>Activos</span><strong>{{ activeCount }}</strong></article>
        <article><span>Administradores</span><strong>{{ adminCount }}</strong></article>
        <article><span>Docentes</span><strong>{{ teacherCount }}</strong></article>
      </section>

      @if (showForm) {
        <section class="form-card">
          <div class="form-heading">
            <div>
              <h3>{{ editingUser ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
              <p>{{ editingUser ? 'Actualiza los datos y permisos de la cuenta.' : 'Registra una nueva cuenta en el sistema.' }}</p>
            </div>
            <button class="btn-text" type="button" (click)="closeForm()">Cerrar</button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="form-grid">
              <div class="field">
                <label>Usuario</label>
                <input formControlName="username" />
              </div>
              <div class="field">
                <label>Correo electrónico</label>
                <div class="email-control">
                  <input formControlName="emailLocal" type="text" placeholder="nombre.apellido" />
                  <span>@unicauca.edu.co</span>
                </div>
              </div>
              <div class="field">
                <label>{{ editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</label>
                <input formControlName="password" type="password" />
                <small class="password-rules">Mínimo 8 caracteres, una mayúscula, una minúscula y un número.</small>
              </div>
              <div class="field">
                <label>Rol</label>
                <select formControlName="role">
                  <option value="admin">Administrador</option>
                  <option value="docente">Docente</option>
                </select>
              </div>
              @if (editingUser) {
                <label class="toggle-field">
                  <input type="checkbox" formControlName="is_active" />
                  <span>Cuenta activa</span>
                </label>
              }
            </div>

            @if (formError) {
              <p class="error-msg">{{ formError }}</p>
            }

            <button type="submit" class="btn-primary" [disabled]="form.invalid || saving">
              {{ saving ? 'Guardando...' : (editingUser ? 'Guardar cambios' : 'Crear usuario') }}
            </button>
          </form>
        </section>
      }

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users; track u.id) {
              <tr [class.inactive-row]="!u.is_active">
                <td class="user-cell">
                  <div class="avatar">{{ u.username[0].toUpperCase() }}</div>
                  {{ u.username }}
                  @if (u.id === auth.user()?.id) { <span class="you-badge">Tú</span> }
                </td>
                <td class="muted">{{ u.email }}</td>
                <td><span class="role-badge role-{{ u.role }}">{{ roleLabel(u.role) }}</span></td>
                <td>
                  <span class="status-dot" [class.active]="u.is_active"></span>
                  {{ u.is_active ? 'Activo' : 'Inactivo' }}
                </td>
                <td class="muted small">{{ u.created_at | slice:0:10 }}</td>
                <td class="actions">
                  <button class="btn-action" type="button" (click)="openEdit(u)">Editar</button>
                  <button class="btn-action" type="button" (click)="toggleActive(u)" [disabled]="u.id === auth.user()?.id">
                    {{ u.is_active ? 'Desactivar' : 'Activar' }}
                  </button>
                  <button class="btn-action danger" type="button" (click)="remove(u)" [disabled]="u.id === auth.user()?.id">
                    Eliminar
                  </button>
                </td>
              </tr>
            }
            @if (users.length === 0) {
              <tr><td colspan="6" class="empty-cell">No hay usuarios registrados</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  users: User[] = [];
  showForm = false;
  editingUser: User | null = null;
  saving = false;
  formError = '';

  form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    emailLocal: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]+$/)]],
    password: ['', Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)],
    role: ['docente' as UserRole, Validators.required],
    is_active: [true],
  });

  constructor(
    public auth: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.auth.loadProfile().subscribe();
    this.load();
  }

  get activeCount() { return this.users.filter(user => user.is_active).length; }
  get adminCount() { return this.users.filter(user => user.role === 'admin').length; }
  get teacherCount() { return this.users.filter(user => user.role === 'docente').length; }

  load() {
    this.auth.getUsers().subscribe({
      next: users => {
        this.users = users;
        this.cdr.detectChanges();
      }
    });
  }

  openCreate() {
    if (this.showForm && !this.editingUser) {
      this.closeForm();
      return;
    }

    this.editingUser = null;
    this.form.reset({ role: 'docente', is_active: true });
    this.form.controls.password.setValidators([
      Validators.required,
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/),
    ]);
    this.form.controls.password.updateValueAndValidity();
    this.formError = '';
    this.showForm = true;
  }

  openEdit(user: User) {
    this.editingUser = user;
    this.form.reset({
      username: user.username,
      emailLocal: user.email.split('@')[0],
      password: '',
      role: user.role,
      is_active: user.is_active,
    });
    this.form.controls.password.setValidators([
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/),
    ]);
    this.form.controls.password.updateValueAndValidity();
    this.formError = '';
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.editingUser = null;
    this.formError = '';
  }

  save() {
    if (this.form.invalid) return;
    this.saving = true;
    this.formError = '';

    const value = this.form.getRawValue();
    const request = this.editingUser
      ? this.auth.updateUser(this.editingUser.id, {
          username: value.username!,
          email: `${value.emailLocal!}@unicauca.edu.co`,
          role: value.role!,
          is_active: value.is_active!,
          ...(value.password ? { password: value.password } : {}),
        } satisfies UserUpdate)
      : this.auth.createUser({
          username: value.username!,
          email: `${value.emailLocal!}@unicauca.edu.co`,
          password: value.password!,
          role: value.role!,
        } satisfies UserCreate);

    request.pipe(finalize(() => {
      this.saving = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: () => {
        this.closeForm();
        this.load();
      },
      error: err => {
        this.formError = err.error?.detail ?? 'No fue posible guardar el usuario.';
      },
    });
  }

  toggleActive(user: User) {
    this.auth.updateUser(user.id, { is_active: !user.is_active }).subscribe({
      next: () => this.load(),
      error: err => this.formError = err.error?.detail ?? 'No fue posible actualizar el estado.',
    });
  }

  remove(user: User) {
    if (!confirm(`¿Eliminar la cuenta de ${user.username}? Esta acción no se puede deshacer.`)) return;
    this.auth.deleteUser(user.id).subscribe({
      next: () => this.load(),
      error: err => this.formError = err.error?.detail ?? 'No fue posible eliminar el usuario.',
    });
  }

  roleLabel(role: UserRole) {
    return { admin: 'Administrador', docente: 'Docente', anonimo: 'Anónimo' }[role];
  }
}
