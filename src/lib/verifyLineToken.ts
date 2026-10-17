import { createPublicKey, type JsonWebKey, type KeyObject } from 'crypto';
import jwt from 'jsonwebtoken';

// ASVS 9.1.2: รับเฉพาะอัลกอริทึมในรายการอนุญาต — LIFF ออก LINE ID Token แบบ ES256 (เอกสาร LINE "Verify ID token")
// ASVS 9.1.3: กุญแจที่ใช้ตรวจมาจากที่อยู่ที่ตั้งไว้ล่วงหน้าของ LINE เท่านั้น ไม่อ่าน jku / x5u / jwk ที่แนบมากับ Token
// ทำตาม OWASP JSON Web Token Cheat Sheet (กำหนดอัลกอริทึมที่รับไว้ในโค้ด · ใช้กุญแจจาก jwks_uri ของผู้ออก Token ไม่ใช้กุญแจใน header)
const ALLOWED_ALGS: jwt.Algorithm[] = ['ES256'];
const LINE_JWKS_URL = 'https://api.line.me/oauth2/v2.1/certs';
const LINE_ISSUER = 'https://access.line.me';
const JWKS_TTL_MS = 60 * 60 * 1000;

let jwksCache: { at: number; keys: Map<string, KeyObject> } | null = null;

async function lineKey(kid: string): Promise<KeyObject | null> {
    const fresh = jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS;
    if (!fresh || !jwksCache!.keys.has(kid)) {
        const res = await fetch(LINE_JWKS_URL);
        if (!res.ok) return null;
        const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
        jwksCache = { at: Date.now(), keys: new Map(keys.map(k => [k.kid, createPublicKey({ key: k, format: 'jwk' })])) };
    }
    return jwksCache!.keys.get(kid) ?? null;
}

// ตรวจลายเซ็นในแอปเองก่อน: อัลกอริทึมต้องอยู่ในรายการ · กุญแจต้องเป็นของ LINE ตาม kid · ผู้ออกและผู้รับต้องตรง
async function verifySignatureLocally(idToken: string): Promise<boolean> {
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') return false;
    const { alg, kid } = decoded.header;
    if (!ALLOWED_ALGS.includes(alg as jwt.Algorithm) || !kid) return false;
    const key = await lineKey(kid);
    if (!key) return false;
    jwt.verify(idToken, key, {
        algorithms: ALLOWED_ALGS,
        issuer: LINE_ISSUER,
        audience: process.env.LINE_LOGIN_CHANNEL_ID || '',
    });
    return true;
}

/**
 * Verify LINE ID Token: ตรวจลายเซ็นในแอปเอง แล้วถาม LINE API ซ้ำตามเดิม
 * คืน sub (LINE user ID) ถ้า token ถูกต้อง, null ถ้าผิด/หมดอายุ
 */
export async function verifyLineToken(idToken: string): Promise<string | null> {
    try {
        if (!(await verifySignatureLocally(idToken))) return null;

        const params = new URLSearchParams();
        params.append('id_token', idToken);
        params.append('client_id', process.env.LINE_LOGIN_CHANNEL_ID || '');

        const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const data = await res.json();
        if (!res.ok || data.error) return null;
        return data.sub as string;
    } catch (e) {
        console.error('verifyLineToken error:', (e as Error).message);
        return null;
    }
}
