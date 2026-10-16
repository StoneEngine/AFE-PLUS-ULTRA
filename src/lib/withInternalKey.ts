import { NextApiRequest, NextApiResponse } from 'next';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any> | any;

/**
 * ห่อ API ที่มีแค่เซิร์ฟเวอร์เราเองเรียก (webhook, lineProfile, lineFunction ผ่าน listAPI)
 * ต้องส่ง `x-internal-key` ถูกต้อง ไม่งั้น 401 — หน้าเว็บและคนนอกเรียกตรงไม่ได้
 */
export function withInternalKey(handler: Handler) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const internalKey = req.headers['x-internal-key'];
        if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
            return res.status(401).json({ message: 'Unauthorized: internal API only' });
        }
        return handler(req, res);
    };
}
