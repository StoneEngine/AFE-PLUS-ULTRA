import axios from 'axios';
import liff from '@line/liff';

/**
 * ติดตั้ง axios interceptor — แนบ LINE ID Token (Bearer) ทุก request อัตโนมัติ
 *
 * เรียกครั้งเดียวใน _app.tsx (browser-only)
 * หลังจากนั้น `axios.get/post(...)` ทั่วโปรเจคจะแนบ token ให้เอง
 *   → frontend ไม่ต้องแก้รายไฟล์ → merge ง่าย
 */
let installed = false;

export function setupAxiosAuth() {
    if (installed) return;
    if (typeof window === 'undefined') return; // browser-only
    installed = true;

    axios.interceptors.request.use(async (config) => {
        try {
            // แนบเฉพาะ request ที่ไปเว็บเราเอง — กัน ID Token หลุดไปโดเมนอื่น (เช่น test_api.tsx เรียก API ภายนอก)
            const target = new URL(config.url || '', window.location.href);
            if (target.origin !== window.location.origin) return config;

            if (liff.isLoggedIn?.()) {
                const token = liff.getIDToken();
                if (token && !config.headers.Authorization) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            }
        } catch {
            // liff ยังไม่ init / ไม่ได้อยู่ใน LIFF — ข้าม
        }
        return config;
    });
}

/**
 * LIFF ของหน้าเว็บผู้ใช้ (LIFF "AFE ultra web" — Endpoint = หน้าแรกของเว็บ)
 * ไม่ได้ตั้ง env นี้ = ไม่เริ่ม LIFF หน้าเว็บทำงานแบบเดิม (ไม่แนบ token)
 */
export const LIFF_WEB_ID = process.env.NEXT_PUBLIC_LIFF_WEB_ID;

let liffWebInit: Promise<boolean> | null = null;

/**
 * เริ่ม LIFF + ล็อกอิน LINE ก่อนหน้าเว็บผู้ใช้เรียก API
 * ล็อกอินแล้ว interceptor ด้านบนจะแนบ LINE ID Token ให้ทุก request เอง
 *
 * คืน false = กำลังพาไปหน้าล็อกอิน LINE (ไม่ต้องแสดงหน้า)
 * init ไม่ผ่าน = แสดงหน้าต่อแบบไม่มี token (ด่านจริงอยู่ฝั่ง API)
 */
export function initLiffForWeb(): Promise<boolean> {
    if (liffWebInit) return liffWebInit;
    liffWebInit = (async () => {
        if (!LIFF_WEB_ID || typeof window === 'undefined') return true;
        try {
            await liff.init({ liffId: LIFF_WEB_ID });
            if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                return false;
            }
        } catch (e) {
            console.error('liff.init error:', e);
        }
        return true;
    })();
    return liffWebInit;
}
