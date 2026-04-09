from fastapi import FastAPI, Depends
from routes import auth_routes
from auth.auth_bearer import RoleChecker

app = FastAPI(title="Laboratorio Inteligente API")

# Incluimos las rutas de autenticación
app.include_router(auth_routes.router)

@app.get("/")
async def root():
    return {"message": "API del Laboratorio Operacional"}

# RUTA PROTEGIDA: Solo para Administradores
@app.get("/admin/config", dependencies=[Depends(RoleChecker(["admin"]))])
async def secure_config():
    return {"status": "Acceso concedido al panel de administración"}

# RUTA PROTEGIDA: Para Docentes y Admins
@app.get("/telemetria", dependencies=[Depends(RoleChecker(["admin", "docente"]))])
async def get_telemetry():
    return {"temperatura": 24.5, "humedad": 45}




# --- CONFIGURACIÓN DE CORS ---

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware # IMPORTANTE
from routes import auth_routes
from auth.auth_bearer import RoleChecker

app = FastAPI(title="Laboratorio Inteligente API")

# --- CONFIGURACIÓN DE CORS ---
origins = [
    "http://localhost:4200",      # Desarrollo local de Angular
    "http://127.0.0.1:4200",
    "*"                           # En desarrollo puedes usar "*" para permitir todo, 
                                  # pero por rigor profesional, mejor especifica las IPs.
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ------------------------------

app.include_router(auth_routes.router)

@app.get("/")
async def root():
    return {"message": "API del Laboratorio Operacional"}

# Rutas de ejemplo para probar los roles
@app.get("/admin/config", dependencies=[Depends(RoleChecker(["admin"]))])
async def secure_config():
    return {"status": "Acceso concedido al panel de administración"}

@app.get("/telemetria", dependencies=[Depends(RoleChecker(["admin", "docente"]))])
async def get_telemetry():
    return {"temperatura": 24.5, "humedad": 45}