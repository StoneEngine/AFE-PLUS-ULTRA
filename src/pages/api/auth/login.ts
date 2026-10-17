import type { NextApiRequest, NextApiResponse } from 'next'; 
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { compare } from 'bcrypt';
import { passwordProblem } from '@/lib/passwordPolicy';
import { clientIp, secondsBlocked, recordFail, recordSuccess } from '@/lib/loginRateLimit';

const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    throw new Error('SECRET_KEY environment variable is not set');
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(401).json({ message: 'Username and password are required' });
        }

        // ASVS 6.3.1: คู่ชื่อผู้ใช้ + IP ที่ใส่รหัสผิดครบ 5 ครั้งใน 15 นาที ถูกพัก 15 นาที (docs/SECURITY-LOGIN.md)
        const ip = clientIp(req);
        const wait = secondsBlocked(String(username), ip);
        if (wait > 0) {
            res.setHeader('Retry-After', String(wait));
            return res.status(429).json({ message: `ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ${Math.ceil(wait / 60)} นาที` });
        }

        // ASVS 6.2.8: รหัสที่ bcrypt จะตัดท้ายทิ้ง ไม่รับตั้งแต่ต้น
        const problem = passwordProblem(password);
        if (problem) {
            recordFail(String(username), ip);
            return res.status(401).json({ message: 'User หรือ Password ไม่ถูกต้อง' });
        }

        try {
            // ค้นหาผู้ใช้ตาม `username`
            const user = await prisma.users.findFirst({
                where: {
                    users_user: username,
                    status_id: 3,  // ตรวจสอบว่าตรงกับค่า `status_id` ที่คุณต้องการใช้
                    users_status_onweb: 1,
                    users_status_active: 1
                }
            });

            if (!user) {
                recordFail(String(username), ip);
                return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });

            }


            // ตรวจสอบรหัสผ่าน (เลิกพิมพ์รหัสผ่านและค่า hash ลง log)
            const isPasswordMatch = await compare(password, user.users_passwd);
            if (!isPasswordMatch) {
                recordFail(String(username), ip);
                return res.status(401).json({ message: 'User หรือ Password ไม่ถูกต้อง' });
            }
            recordSuccess(String(username), ip);

            // สร้าง token
            const accessToken = jwt.sign(
                { userName: user.users_user, userId: user.users_id, permission: user.status_id },
                SECRET_KEY,
                { expiresIn: '1h' }
            );

            return res.status(200).json({
                message: 'Success',
                user: {
                    userName: user.users_user,
                    userId: user.users_id,
                    permission: user.status_id
                },
                accessToken
            });
        } catch (error) {
            console.error("Error during login:", error);
            return res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: (error as Error).message });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: 'Method not allowed' });
    }
};
