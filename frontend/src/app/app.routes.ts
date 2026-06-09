import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  // 1. Redirección inicial
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  // 2. Autenticación (Público)
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },

  // 3. BLOQUE A: Monitoreo (Dashboard - Público según diseño actual)
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },

  // 4. BLOQUE B: Auditoría (Acceso - Admin y Docente)
  {
    path: 'access',
    canActivate: [authGuard, roleGuard('admin', 'docente')],
    loadComponent: () =>
      import('./features/access/access.component').then(m => m.AccessComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.component').then(m => m.ProfileComponent)
  },

  // 5. GESTIÓN OPERATIVA Y ADMINISTRATIVA
  {
    path: 'admin',
    // Elevamos el permiso del padre para permitir la entrada de docentes
    canActivate: [authGuard, roleGuard('admin', 'docente')], 
    children: [
      // Sub-bloque A: Gestión de Hardware (Admin y Docente)
      {
        path: 'devices',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/devices/admin-devices.component').then(m => m.AdminDevicesComponent)
      },
      // Sub-bloque B: Gestión de Usuarios (ESTRICTAMENTE Admin)
      {
        path: 'users',
        // Sobrescribimos con un guard más restrictivo para este hijo específico
        canActivate: [roleGuard('admin')], 
        loadComponent: () =>
          import('./features/admin/users/admin-users.component').then(m => m.AdminUsersComponent)
      },
      // Sub-bloque C: Configuración del Sistema (Solo Admin)
      {
        path: 'settings',
        canActivate: [roleGuard('admin')],
        loadComponent: () =>
          import('./features/admin/settings/admin-settings.component').then(m => m.AdminSettingsComponent)
      },
      // Sub-bloque D: Historial de Telemetría (Admin y Docente)
      {
        path: 'telemetry',
        canActivate: [roleGuard('admin', 'docente')],
        loadComponent: () =>
          import('./features/admin/telemetry/telemetry-history.component').then(m => m.TelemetryHistoryComponent)
      },
      { path: '', redirectTo: 'devices', pathMatch: 'full' }
    ]
  },

  // 6. Comodín (Wildcard)
  { path: '**', redirectTo: 'dashboard' }
];
