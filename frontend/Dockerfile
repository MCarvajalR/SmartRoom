# ─── Etapa 1: Construcción (Node.js) ─────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Copiamos solo los archivos de dependencias primero para aprovechar la caché de Docker
COPY package*.json ./
RUN npm ci

# Copiamos el resto del código y construimos
COPY . .
RUN npm run build --configuration=production

# ─── Etapa 2: Servidor (Nginx) ───────────────────────────────
FROM nginx:alpine

# Copiamos el resultado de la compilación basado en el nombre de tu proyecto
COPY --from=build /app/dist/smartroom_frontend/browser /usr/share/nginx/html

# Copiamos la configuración del enrutador
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]