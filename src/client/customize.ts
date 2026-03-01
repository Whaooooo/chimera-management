import { createConfig } from "@hey-api/client-fetch";
import { client } from "./services.gen";

// API Base URL - uses environment variable with fallback
// In development: uses VITE_API_BASE_URL from .env.development or .env.local
// In production: uses VITE_API_BASE_URL from .env.production
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088';

export const LOCAL_AUTH_NAME="auth";
const config = createConfig({
    baseUrl: API_BASE_URL,
    throwOnError: true
  })
client.setConfig(config);
client.interceptors.request.use((request) => {
    const auth = localStorage.getItem(LOCAL_AUTH_NAME)
    if (auth !== null) {
        request.headers.set('Authorization', auth);
    }
    return request;
});

client.interceptors.response.use((response) => {
    const auth = response.headers.get('Authorization')
    if (auth !== null) {
        localStorage.setItem(LOCAL_AUTH_NAME, auth)
    }
    return response;
});
