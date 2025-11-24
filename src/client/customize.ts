import { createConfig } from "@hey-api/client-fetch";
import { client } from "./services.gen";


// export const API_BASE_URL = 'http://localhost:80';
export const API_BASE_URL = 'https://www.chimeracoffee.top:8448';

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