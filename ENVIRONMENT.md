# Entornos Home Assistant

La aplicacion no debe tener URLs ni tokens de Home Assistant quemados en el codigo.
Cada entorno se elige con variables de entorno.

## Home Assistant simulado

1. Copia `.env.simulated.example` como `.env.simulated`.
2. Completa `HA_URL`, `HA_PUBLIC_URL` y `HA_TOKEN` con el Home Assistant de pruebas.
3. Levanta la app con:

```powershell
docker compose --env-file .env.simulated up -d --build
```

## Home Assistant real

1. Copia `.env.production.example` como `.env.production` o como `.env` en el servidor.
2. Completa `HA_URL`, `HA_PUBLIC_URL` y `HA_TOKEN` con el Home Assistant real.
3. Levanta la app con:

```powershell
docker compose --env-file .env.production up -d --build
```

Si el archivo se llama `.env`, Docker Compose lo carga por defecto:

```powershell
docker compose up -d --build
```

## Backfill de historial

El historial se importa al arrancar el backend y luego la app sigue recolectando
datos nuevos normalmente.

- `HA_HISTORY_BACKFILL_ENABLED=true`: importa historial al arrancar.
- `HA_HISTORY_BACKFILL_ENABLED=false`: desactiva la importacion historica.
- `HA_HISTORY_BACKFILL_DAYS=30`: maximo de dias hacia atras para una BD nueva.
- `HA_HISTORY_BACKFILL_CHUNK_HOURS=24`: tamano de cada consulta a Home Assistant.
