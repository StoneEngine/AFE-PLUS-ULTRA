import type { NextApiRequest } from 'next';

// ASVS 6.3.1: กันการเดารหัสผ่าน ตามเอกสาร docs/SECURITY-LOGIN.md (ASVS 6.1.1)
// นับเฉพาะครั้งที่ใส่รหัสผิด แยกตามคู่ "ชื่อผู้ใช้ + IP ของผู้ส่ง"
// ผิดครบ MAX_FAILS ครั้งภายใน WINDOW_MS → คู่นั้นถูกพักการเข้าสู่ระบบ BLOCK_MS แล้วกลับมาใช้ได้เอง
// ไม่ล็อกบัญชีทั้งบัญชี คนที่เข้าจาก IP อื่นยังเข้าสู่ระบบได้ จึงกันการกลั่นแกล้งให้บัญชีคนอื่นถูกล็อก
export const MAX_FAILS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const BLOCK_MS = 15 * 60 * 1000;

type Entry = { fails: number; first: number; blockedUntil: number };
const store = new Map<string, Entry>(); // อยู่ในหน่วยความจำ เริ่มใหม่ทุกครั้งที่เซิร์ฟเวอร์ restart

export function clientIp(req: NextApiRequest): string {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real) return real.trim();
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
    return first || req.socket.remoteAddress || 'unknown';
}

const keyOf = (username: string, ip: string) => `${username.toLowerCase()}|${ip}`;

// คืนจำนวนวินาทีที่ต้องรอ ถ้าคู่นี้ถูกพักอยู่ · 0 = เข้าสู่ระบบได้
export function secondsBlocked(username: string, ip: string, now = Date.now()): number {
    const e = store.get(keyOf(username, ip));
    return e && e.blockedUntil > now ? Math.ceil((e.blockedUntil - now) / 1000) : 0;
}

export function recordFail(username: string, ip: string, now = Date.now()): void {
    const k = keyOf(username, ip);
    const e = store.get(k);
    if (!e || now - e.first > WINDOW_MS) {
        store.set(k, { fails: 1, first: now, blockedUntil: 0 });
        return;
    }
    e.fails += 1;
    if (e.fails >= MAX_FAILS) e.blockedUntil = now + BLOCK_MS;
}

export function recordSuccess(username: string, ip: string): void {
    store.delete(keyOf(username, ip));
}
