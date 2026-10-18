import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import authMiddleware from '@/lib/authMiddleware';


// ASVS 15.3.1: ไม่มีผู้เรียก (lib/service/auth.ts checkTokenService ไม่มีใคร import) คืนแค่ผลว่า Token ยังใช้ได้
// (เดิมคืน payload JWT ทั้งก้อน userName userId permission iat exp jti)
const handler = (req: NextApiRequest, res: NextApiResponse ) => {
    res.status(200).json({ message: 'Success' });
};

export default authMiddleware(handler);