import { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import basePrisma from './prisma';
import { verifyLineToken } from './verifyLineToken';
import { decrypt } from '@/utils/helpers';
import { positiveInt } from './inputTypes';

type RlsPrisma = Prisma.TransactionClient | typeof basePrisma;

type Handler = (
    req: NextApiRequest,
    res: NextApiResponse,
    prisma: RlsPrisma
) => Promise<any> | any;

/**
 * ห่อ API handler — บังคับให้ verify ตัวตนก่อนเข้า
 *
 * รองรับ 2 ทาง:
 *  1. LIFF frontend → ส่ง `Authorization: Bearer <line_id_token>`
 *  2. Internal server (webhook, lineProfile) → ส่ง `x-internal-key: <env INTERNAL_API_KEY>`
 *     + ส่ง users_id ใน body/query ตามปกติ
 *
 * users_id จะถูกดึงจากแหล่งที่ verify แล้ว — body/query ถูกเพิกเฉย (สำหรับ LIFF path)
 */
export function withRlsAuth(handler: Handler) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        let verifiedUserId: number | null = null;

        // ทาง 1: Internal API key (สำหรับ webhook/lineProfile)
        const internalKey = req.headers['x-internal-key'];
        if (internalKey && internalKey === process.env.INTERNAL_API_KEY) {
            const fromBody = req.body?.users_id ?? req.body?.uId ?? req.body?.uid;
            const fromQuery = req.query?.users_id ?? req.query?.uId;
            let raw = fromBody ?? fromQuery;

            // fallback: ถ้า id อยู่ใน URL path (encrypted) เช่น /api/user/getUserTakecareperson/[id]
            if (!raw && req.query?.id && typeof req.query.id === 'string') {
                try {
                    const decrypted = decrypt(req.query.id);
                    if (decrypted) raw = Array.isArray(decrypted) ? decrypted[0] : decrypted;
                } catch {}
            }

            // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม Number() รับ "1e0" " 1" "0x1" เป็นผู้ใช้ 1 และ "Infinity" "1.5" "99999999999" ทำให้ HTTP 500)
            verifiedUserId = positiveInt(raw);
        } else {
            // ทาง 2: LINE ID Token (สำหรับ LIFF)
            const auth = req.headers.authorization;
            if (!auth?.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Unauthorized: Missing Bearer token' });
            }
            const idToken = auth.split(' ')[1];
            const lineId = await verifyLineToken(idToken);
            if (!lineId) {
                return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
            }
            // ASVS 7.4.2: บัญชีที่ถูกปิด (users_status_active ไม่ใช่ 1) ใช้ Token ต่อไม่ได้ ตรงกับ getUser/[id] ที่กรอง active อยู่แล้ว
            const user = await basePrisma.users.findFirst({ where: { users_line_id: lineId, users_status_active: 1 } });
            if (!user) {
                return res.status(401).json({ message: 'Unauthorized: User not registered' });
            }
            verifiedUserId = user.users_id;
        }

        if (!verifiedUserId || isNaN(verifiedUserId)) {
            return res.status(401).json({ message: 'Unauthorized: Cannot determine user' });
        }

        return basePrisma.$transaction(async (tx) => {
            // ต้อง SET ROLE ก่อน — connection ต่อด้วย postgres ซึ่งเป็น superuser + BYPASSRLS
            // ไม่สลับ role = policy ทั้ง 28 ตัวไม่มีผล (เหมือนใน withRls.ts)
            await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
            await tx.$executeRaw`SELECT set_config('app.current_user_id', ${String(verifiedUserId)}, true)`;
            return handler(req, res, tx);
        });
    };
}
