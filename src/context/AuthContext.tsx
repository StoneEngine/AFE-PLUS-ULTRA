import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/router';

import { handleAxiosError } from '@/lib/service/helpFunction';
import { loginService, getSessionService, logoutService } from '@/lib/service/auth';

import { useDispatch } from 'react-redux';
import { setDataUser, removeDataUser } from '@/redux/features/user';
import { AppDispatch } from '@/redux/store';
import Cookies from 'js-cookie';

// ASVS 3.3.1: cookie ต้องมี Secure และชื่อขึ้นต้นด้วย __Host- (เดิมชื่อ currentUser ไม่มี Secure)
// __Host- บังคับ Secure + path=/ + ไม่ระบุ Domain · ทำตาม OWASP CSRF Prevention Cheat Sheet หัวข้อ
// Using Cookies with Host Prefixes to Identify Origins (ใช้ __Host- คู่กับ SameSite)
const USER_COOKIE = '__Host-currentUser';
const USER_COOKIE_OPTIONS = { secure: true, sameSite: 'strict' as const, path: '/' };
const setUserCookie = (user: unknown) => {
    Cookies.remove('currentUser'); // ลบ cookie ชื่อเดิมที่ยังค้างในเบราว์เซอร์
    Cookies.set(USER_COOKIE, JSON.stringify(user), USER_COOKIE_OPTIONS);
};

interface AuthContextProps {
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const isAuthenticated = !!token;
    const router = useRouter();
    const dispatch = useDispatch<AppDispatch>();

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            setToken(storedToken);
            getUser(storedToken)
            
        }else{
            setLoading(false);
        }

    }, []);

    const getUser = async (storedToken: string) => {
        try {
            const response = await getSessionService(storedToken);
            setLoading(false);
            if(response){
                let accessToken =  localStorage.getItem('token');
                if(response?.accessToken){
                    setToken(response?.accessToken);
                    localStorage.setItem('token', response?.accessToken);
                    accessToken = response?.accessToken;
                }
                dispatch(setDataUser({...response?.user, accessToken}));
                setUserCookie(response?.user);
            }else{
                logout();
            }
        } catch (error) {
            setLoading(false);
            const errorMessage = handleAxiosError(error);
            logout();
        }
    }
    const login = async (username: string, password: string) => {
        try {
            const response = await loginService(username, password);
            if(response){
                if(response?.accessToken){
                    setToken(response?.accessToken);
                    localStorage.setItem('token', response?.accessToken);
                }
               
                dispatch(setDataUser({...response?.user, accessToken: response?.accessToken}));
                setUserCookie(response?.user)
            }
            router.push('/admin/dashboard');
        } catch (error) {
            const errorMessage = handleAxiosError(error);
            throw errorMessage;
        }
    };

    const logout = () => {
        // ASVS 7.4.1: แจ้งเซิร์ฟเวอร์ให้ยกเลิก session ก่อน (ถ้า Token ใช้ไม่ได้แล้วจะได้ 401 ซึ่งไม่เป็นไร)
        const storedToken = localStorage.getItem('token');
        if (storedToken) logoutService(storedToken).catch(() => {});
        setToken(null);
        localStorage.removeItem('token');
        dispatch(removeDataUser());
        Cookies.remove('currentUser');
        Cookies.remove(USER_COOKIE, USER_COOKIE_OPTIONS);
        router.push('/admin/login');
    };
// console.log('isAuthenticated', isAuthenticated)
    return (
        <AuthContext.Provider value={{ token, isAuthenticated, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextProps => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
