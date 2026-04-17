import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';

export interface RealtimeUpdate {
  type:        'state_update';
  device_id:   number;
  entity_id:   string;
  device_name: string;
  device_type: string;
  unit:        string | null;
  value:       number | null;
  raw_state:   string;
  recorded_at: string | null;
  visibility:  'public' | 'docente' | 'admin';
}

const WS_URL = 'ws://localhost:8000/api/v1/ws/telemetry';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  // Signal público: 'connecting' | 'connected' | 'disconnected'
  readonly status = signal<'connecting' | 'connected' | 'disconnected'>('disconnected');

  private ws: WebSocket | null = null;
  private handlers: Array<(u: RealtimeUpdate) => void> = [];
  private retryTimer: any = null;

  constructor(private auth: AuthService) {}

  /** Abre la conexión WS. Llamar desde el componente que necesite tiempo real. */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.status.set('connecting');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.status.set('connected');
      clearTimeout(this.retryTimer);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const update: RealtimeUpdate = JSON.parse(event.data);
        if (update.type === 'state_update') {
          this.dispatchUpdate(update);
        }
      } catch {
        // Mensaje malformado — ignorar
      }
    };

    this.ws.onclose = () => {
      this.status.set('disconnected');
      // Reconexión automática en 4 segundos
      this.retryTimer = setTimeout(() => this.connect(), 4000);
    };

    this.ws.onerror = () => this.ws?.close();
  }

  /** Registra un handler que recibe cada actualización.
   *  Retorna una función para cancelar la suscripción (llamar en ngOnDestroy). */
  onUpdate(handler: (u: RealtimeUpdate) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  /** Cierra la conexión limpiamente (llamar en ngOnDestroy del componente raíz). */
  disconnect(): void {
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.status.set('disconnected');
  }

  // ── privado ────────────────────────────────────────────────────────────────

  private dispatchUpdate(update: RealtimeUpdate): void {
    // Filtrar por visibilidad según el rol del usuario actual
    const role = this.auth.role();
    if (update.visibility === 'admin'   && role !== 'admin')          return;
    if (update.visibility === 'docente' && !['admin', 'docente'].includes(role ?? '')) return;

    this.handlers.forEach(h => h(update));
  }
}
