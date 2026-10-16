import { NextApiRequest, NextApiResponse } from 'next';
import { verifyLineToken } from './verifyLineToken';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any> | any;

/**
 * ห่อ API ที่รับ LINE user ID ของเจ้าของข้อมูลมาในคำขอ (เช่น /api/user/getUser/[id])
 * ให้ส่งข้อมูลกลับเฉพาะเจ้าของบัญชีเท่านั้น
 *
 * ผ่านได้ 2 ทาง:
 *  1. เซิร์ฟเวอร์เราเอง (webhook, lineProfile, listAPI) → ส่ง `x-internal-key`
 *  2. หน้าเว็บ (LIFF) → ส่ง `Authorization: Bearer <LINE ID Token>`
 *     และ LINE user ID ใน Token ต้องตรงกับ LINE user ID ที่ขอ — ขอของคนอื่น = 403
 *
 * ต่างจาก withRlsAuth: ผู้ใช้ที่ยังไม่ลงทะเบียนผ่านได้ (หน้า registration เรียกก่อนสมัคร)
 */
export function withLineOwner(
    handler: Handler,
    getLineId: (req: NextApiRequest) => unknown = (req) => req.query.id
) {
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
        if (lineId !== getLineId(req)) {
            return res.status(403).json({ message: 'Forbidden: ขอได้เฉพาะข้อมูลของตัวเอง' });
        }
        return handler(req, res);
    };
}
