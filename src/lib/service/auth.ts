import axios from 'axios';
import { headers } from './helpFunction';

export const loginService = async (username: string, password: string) => {
    try {
        const response = await axios.post('/api/auth/login', { username, password });
        return response.data;
    } catch (error) {
        throw error
    }
}

export const getSessionService = async (token: string) => {
    try {
        const response = await axios.get('/api/auth/getSession', headers(token));
        return response.data;
    } catch (error) {
        throw error
    }
}

// ASVS 7.4.1: ให้เซิร์ฟเวอร์ยกเลิก session ก่อนลบ Token บนเครื่อง
export const logoutService = async (token: string) => {
    const response = await axios.post('/api/auth/logout', undefined, headers(token));
    return response.data;
}

export const checkTokenService = async (token: string) => {
    try {
        const response = await axios.post('/api/auth/check-session', { token },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );
        
        return response.data;
    } catch (error) {
        throw error
    }
}

export const resetPasswordAdmin = async (token: string, data:{
    user_id: number,
    old_password: string,
    new_password: string

}) => {
    try {
        const response = await axios.post('/api/auth/resetPasswordAdmin',data, headers(token));
        return response.data;
    } catch (error) {
        throw error
    }
}