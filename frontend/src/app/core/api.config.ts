const apiHost = globalThis.location?.hostname || 'localhost';
const apiProtocol = globalThis.location?.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
const localDevHost = apiHost === 'localhost' || apiHost === '127.0.0.1';
const localDevPort = !!globalThis.location?.port && !['80', '443'].includes(globalThis.location.port);
const apiPort = localDevHost && localDevPort ? ':8000' : '';

export const API_BASE_URL = `${apiProtocol}//${apiHost}${apiPort}/api/v1`;
export const WS_TELEMETRY_URL = `${wsProtocol}//${apiHost}${apiPort}/api/v1/ws/telemetry`;
