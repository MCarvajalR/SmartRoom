# DAMBA Frontend — Angular 19

Panel de monitoreo IoT para el sistema DAMBA.  
Stack: **Angular 19 standalone** · **SCSS** · **Signals** · **Lazy-loading**

---

## 🚀 Instalación desde cero

> **Prerequisito:** Node.js >= 20, Angular CLI >= 19
> ```bash
> npm install -g @angular/cli
> ```

### Opción A — Copiar sobre proyecto nuevo (recomendado)

```bash
# 1. Crear el proyecto base con Angular CLI
ng new damba_frontend --routing --style=scss --standalone
cd damba_frontend

# 2. Eliminar los archivos que Angular genera por defecto
rm src/app/app.component.ts src/app/app.component.spec.ts
rm src/app/app.routes.ts src/app/app.config.ts
rm src/styles.css   # usamos .scss

# 3. Copiar TODO el contenido de esta carpeta sobre el proyecto
#    Reemplaza los archivos existentes cuando te lo pida.

# 4. Instalar dependencias (no hay extras, todo es Angular puro)
npm install

# 5. Arrancar
ng serve --open
```

### Opción B — Usar directamente (si ya tienes un proyecto)
```bash
cp -r damba_frontend/src/app/* TU_PROYECTO/src/app/
cp damba_frontend/src/styles.scss TU_PROYECTO/src/styles.scss
cp damba_frontend/src/main.ts TU_PROYECTO/src/main.ts
cp damba_frontend/src/index.html TU_PROYECTO/src/index.html
```

---

## 📁 Estructura del proyecto

```
src/app/
├── core/
│   ├── models/
│   │   ├── user.model.ts          # Tipos: User, LoginRequest, TokenResponse, UserCreate
│   │   ├── device.model.ts        # Tipos: Device, DeviceCreate, DeviceUpdate, DeviceType
│   │   └── telemetry.model.ts     # Tipos: TelemetryLatest, TelemetryRecord
│   ├── services/
│   │   ├── auth.service.ts        # Login, logout, perfil, usuarios — usa Signals
│   │   ├── telemetry.service.ts   # getLatest(), getHistory(), triggerCollection()
│   │   ├── device.service.ts      # CRUD de dispositivos
│   │   └── access.service.ts      # unlock(), lock(), getLogs()
│   ├── guards/
│   │   ├── auth.guard.ts          # Redirige a /login si no hay token
│   │   └── role.guard.ts          # roleGuard('admin') — factory funcional
│   └── interceptors/
│       └── jwt.interceptor.ts     # Agrega Authorization: Bearer <token> a cada request
│
├── layout/
│   ├── topbar/                    # Barra superior con logo, rol y botón logout
│   └── sidebar/                   # Navegación lateral (visibilidad según rol)
│
├── features/
│   ├── auth/login/                # Formulario de login reactivo
│   ├── dashboard/                 # Tarjetas de telemetría en tiempo real (30s)
│   ├── access/                    # Abrir/cerrar puerta + historial de logs
│   └── admin/
│       ├── devices/               # CRUD completo de dispositivos
│       └── users/                 # Crear y listar usuarios
│
├── app.component.ts               # Shell: topbar + sidebar + router-outlet
├── app.config.ts                  # provideRouter, provideHttpClient, jwtInterceptor
└── app.routes.ts                  # Rutas lazy-load con guards
```

---

## 🔐 Sistema de roles

| Ruta          | Anónimo | Docente | Admin |
|---------------|:-------:|:-------:|:-----:|
| /dashboard    | ✅       | ✅       | ✅    |
| /access       | ❌       | ✅       | ✅    |
| /admin/devices| ❌       | ❌       | ✅    |
| /admin/users  | ❌       | ❌       | ✅    |

---

## 🔧 Variables de entorno

El API base está hardcodeado en los servicios como `http://localhost:8000/api/v1`.  
Para producción, usa `environment.ts`:

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api/v1'
};
```

Y en los servicios reemplaza el string literal:
```typescript
import { environment } from '../../../environments/environment';
const API = environment.apiUrl;
```

---

## 💡 Conceptos clave de la arquitectura

### Signals (AuthService)
```typescript
// Signal reactivo — cuando cambia, los templates se actualizan solos
private _token = signal<string | null>(localStorage.getItem('token'));
readonly token = this._token.asReadonly();

// En el template: auth.token() — no necesita async pipe ni subscribe
```

### Guards funcionales (Angular 15+)
```typescript
// Factory que retorna un CanActivateFn con los roles inyectados
export const roleGuard = (...roles: UserRole[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  return auth.hasRole(...roles) ? true : router.navigate(['/dashboard']);
};

// En las rutas:
canActivate: [authGuard, roleGuard('admin')]
```

### Interceptor funcional
```typescript
// Se registra en app.config.ts:
provideHttpClient(withInterceptors([jwtInterceptor]))
// Sin clases, sin NgModules
```

### Lazy loading
```typescript
// Angular descarga el componente solo cuando el usuario navega a esa ruta
loadComponent: () => import('./features/dashboard/dashboard.component')
               .then(m => m.DashboardComponent)
```

---

## 📦 Agregar un nuevo dispositivo (desde la UI)

1. Iniciar sesión como **admin**
2. Ir a **Admin → Dispositivos**
3. Click en **"+ Agregar dispositivo"**
4. Ingresar:
   - **Entity ID**: el `entity_id` exacto de Home Assistant (ej: `sensor.oficina_temp`)
   - **Nombre**: nombre visible en el dashboard
   - **Tipo**: temperature, humidity, plug, lock, light u other
   - **Unidad**: °C, %, W, etc.
   - **Visibilidad**: public (todos), docente (logueados), admin (solo admin)
5. Guardar — aparece automáticamente en el dashboard en el siguiente ciclo de recolección

---

## 🎨 Modo oscuro

El modo oscuro es automático según preferencia del sistema.  
El toggle en el topbar permite cambiarlo manualmente.  
Los tokens CSS en `styles.scss` controlan ambos temas.

---

## 📡 Backend requerido

- FastAPI corriendo en `http://localhost:8000`
- Endpoints usados:
  - `POST /api/v1/auth/login`
  - `GET  /api/v1/auth/me`
  - `GET  /api/v1/auth/users`
  - `POST /api/v1/auth/users`
  - `GET  /api/v1/telemetry/latest`
  - `GET  /api/v1/telemetry/history`
  - `POST /api/v1/telemetry/collect`
  - `GET  /api/v1/devices`
  - `POST /api/v1/devices`
  - `PATCH /api/v1/devices/:id`
  - `DELETE /api/v1/devices/:id`
  - `GET  /api/v1/access/door/status`
  - `POST /api/v1/access/door/unlock`
  - `POST /api/v1/access/door/lock`
  - `GET  /api/v1/access/logs`
