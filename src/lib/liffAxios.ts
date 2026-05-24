import axios, { AxiosRequestConfig } from 'axios';
import liff from '@line/liff';

/**
 * Axios wrapper ที่แนบ LINE ID Token เป็น Bearer header อัตโนมัติ
 * ใช้สำหรับเรียก API ที่ป้องกันด้วย withRlsAuth จากฝั่ง LIFF
 *
 * ใช้:
 *   import { liffAxios } from '@/lib/liffAxios';
 *   await liffAxios.get('/api/setting/getSafezone?...');
 *   await liffAxios.post('/api/setting/saveSafezone', data);
 */
async function getAuthHeader(): Promise<Record<string, string>> {
    try {
        if (!liff.isLoggedIn()) return {};
        const idToken = liff.getIDToken();
        if (!idToken) return {};
        return { Authorization: `Bearer ${idToken}` };
    } catch {
        return {};
    }
}

export const liffAxios = {
    async get(url: string, config: AxiosRequestConfig = {}) {
        const authHeader = await getAuthHeader();
        return axios.get(url, {
            ...config,
            headers: { ...(config.headers || {}), ...authHeader },
        });
    },
    async post(url: string, data?: any, config: AxiosRequestConfig = {}) {
        const authHeader = await getAuthHeader();
        return axios.post(url, data, {
            ...config,
            headers: { ...(config.headers || {}), ...authHeader },
        });
    },
};
