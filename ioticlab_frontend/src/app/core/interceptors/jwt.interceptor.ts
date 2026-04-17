import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// Interceptor funcional (Angular 15+):
// agrega el header Authorization a TODAS las peticiones salientes si hay token
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth  = inject(AuthService);
  const token = auth.token();

  if (token) {
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next(cloned);
  }

  // Sin token: deja pasar la petición sin modificar (para endpoints públicos)
  return next(req);
};
