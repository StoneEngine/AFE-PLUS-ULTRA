import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import jwt from 'jsonwebtoken';
import moment from 'moment';
import prisma from '@/lib/prisma';
const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    throw new Error('SECRET_KEY environment variable is not set');
}

const authMiddleware = (handler: NextApiHandler) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {

            if (!req.headers.authorization) {
                return res.status(401).json({ message: 'Authorization header is required' });
            }

            const token = req.headers.authorization.split(' ')[1];

            try {
                let user = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] }) as jwt.JwtPayload;

                // ASVS 7.2.4 7.4.1 7.4.2: ตรวจกับฐานข้อมูลทุกคำขอ
                // - jti ต้องตรงกับเลข session ล่าสุดของผู้ใช้ (ล็อกอินใหม่ ออกจากระบบ หรือถูกเปลี่ยนสถานะ = เลขเปลี่ยนหรือถูกล้าง)
                // - บัญชียังเป็นเจ้าหน้าที่ที่เปิดใช้งาน (status_id 3, users_status_onweb 1, users_status_active 1) ตามเงื่อนไขเดียวกับ login.ts
                // ทำตาม OWASP Session Management Cheat Sheet ("Enforce session expiration on the server and invalidate the session when the user logs out")
                const row = await prisma.users.findUnique({
                    where: { users_id: Number(user.userId) },
                    select: { users_token: true, status_id: true, users_status_onweb: true, users_status_active: true },
                });
                if (!user.jti || !row || row.users_token !== user.jti
                    || row.status_id !== 3 || row.users_status_onweb !== 1 || row.users_status_active !== 1) {
                    return res.status(401).json({ success: false, message: "User not authorized" });
                }

                if(moment.unix((user as any).exp).subtract(10, 'minute').isBefore(moment())){
                    const accessToken = jwt.sign({
                        userName  : (user as any).userName,
                        userId    : (user as any).userId,
                        permission: (user as any).permission
                    }, SECRET_KEY, { expiresIn: '1h', jwtid: user.jti }); // ต่ออายุโดยคงเลข session เดิม
                    (req as any).userAccessToken = accessToken;
                }
                (req as any).user = user;
            } catch (err) {
                // console.log("🚀 ~ return ~ err:", err)
                return res.status(401).json({ success: false, message: "User not authorized" });
            }

            // ASVS 4.1.1: await handler เพื่อให้ error ที่หลุดจาก handler ตอบ 500 แบบ JSON ที่นี่
            // (เดิม return handler() ไม่ await error ไปถึง Next.js ที่ตอบ 500 "Internal Server Error" ไม่มี Content-Type)
            // แยกจาก catch ด้านบน เพื่อไม่ให้ error ของ handler กลายเป็น 401
            try {
                return await handler(req, res);
            } catch (err) {
                console.error("authMiddleware: handler error", err);
                if (!res.headersSent) {
                    return res.status(500).json({ success: false, message: "Internal server error" });
                }
            }

    };
};

export default authMiddleware;
