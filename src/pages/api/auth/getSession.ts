import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import authMiddleware from '@/lib/authMiddleware';


const handler = (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'GET') {
        // ASVS 15.3.1: ผู้เรียก (context/AuthContext.tsx getUser) เก็บ user ลง redux และ cookie ผู้อ่านใช้แค่ userName userId ไม่อ่าน permission
        const data = {
            user:{
                userName  : (req as any).user.userName,
                userId    : (req as any).user.userId,
            },
            accessToken: (req as any).userAccessToken || null
        }
        return res.status(200).json({ message: 'Success', ...data });
    }else{
       return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);