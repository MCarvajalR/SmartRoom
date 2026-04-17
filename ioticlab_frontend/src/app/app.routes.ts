import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  // Ruta raíz → redirige al dashboard (público) o login
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  // LOGIN — no requiere autenticación
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },

  // DASHBOARD — público, no requiere token
  // Los componentes internos filtran qué muestran según el rol
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },

  // CONTROL DE ACCESO — requiere al menos docente
  {
    path: 'access',
    canActivate: [authGuard, roleGuard('admin', 'docente')],
    loadComponent: () =>
      import('./features/access/access.component').then(m => m.AccessComponent)
  },

  // PANEL ADMIN — solo admin
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent)
      },
      {
        path: 'devices',
        loadComponent: () =>
          import('./features/admin/devices/admin-devices.component').then(m => m.AdminDevicesComponent)
      },
      { path: '', redirectTo: 'users', pathMatch: 'full' }
    ]
  },

  // Cualquier ruta desconocida → dashboard
  { path: '**', redirectTo: 'dashboard' }
];
