import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

// Factory que devuelve un guard para un rol específico
// Uso: canActivate: [roleGuard('admin')]
export const roleGuard = (...roles: UserRole[]): CanActivateFn => {
  return () => {
    const auth   = inject(AuthService);
    const router = inject(Router);

    if (auth.hasRole(...roles)) return true;

    // Si está logueado pero no tiene el rol → manda al dashboard
    if (auth.isLoggedIn()) {
      router.navigate(['/dashboard']);
    } else {
      router.navigate(['/login']);
    }
    return false;
  };
};
