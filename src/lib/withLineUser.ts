import { NextApiRequest, NextApiResponse } from 'next';
import basePrisma from './prisma';
import { verifyLineToken } from './verifyLineToken';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any> | any;
type IsOwner = (req: NextApiRequest, usersId: number) => boolean | Promise<boolean>;

/**
 * ห่อ API ที่หน้าเว็บ (LIFF) ส่ง users_id หรือรหัสรายการมาเอง (เช่น borrowequipment)
 * ให้ทำได้เฉพาะกับข้อมูลของผู้ใช้ที่ล็อกอินอยู่
 *
 * ผ่านได้ 2 ทาง:
 *  1. เซิร์ฟเวอร์เราเอง → `x-internal-key` (ทำงานแทนผู้ใช้หลายคน จึงไม่ตรวจเจ้าของ)
 *  2. หน้าเว็บ → `Authorization: Bearer <LINE ID Token>` → หา users_id จาก users_line_id
 *     แล้ว isOwner(req, users_id) ต้องเป็นจริง — ส่งข้อมูลของคนอื่นมา = 403
 *
 * ใช้แทน withRlsAuth ได้กับตารางที่ไม่ได้เปิด RLS (borrowequipment, borrowequipment_list)
 */
export function withLineUser(handler: Handler, isOwner: IsOwner) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const internalKey = req.headers['x-internal-key'];
        if (internalKey && internalKey === process.env.INTERNAL_API_KEY) {
            return handler(req, res);
        }

        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: Missing Bearer token' });
        }
        const lineId = await verifyLineToken(auth.split(' ')[1]);
        if (!lineId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
        }
        // ASVS 7.4.2: บัญชีที่ถูกปิด (users_status_active ไม่ใช่ 1) ใช้ Token ต่อไม่ได้
        const user = await basePrisma.users.findFirst({ where: { users_line_id: lineId, users_status_active: 1 } });
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: User not registered' });
        }
        if (!(await isOwner(req, user.users_id))) {
            return res.status(403).json({ message: 'Forbidden: ทำได้เฉพาะข้อมูลของตัวเอง' });
        }
        return handler(req, res);
    };
}
