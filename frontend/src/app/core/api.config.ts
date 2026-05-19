const apiHost = globalThis.location?.hostname || 'localhost';
const apiProtocol = globalThis.location?.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';

export const API_BASE_URL = `${apiProtocol}//${apiHost}:8000/api/v1`;
export const WS_TELEMETRY_URL = `${wsProtocol}//${apiHost}:8000/api/v1/ws/telemetry`;
