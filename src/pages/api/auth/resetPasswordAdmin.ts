import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma'
// import { matchPassword } from '@/utils/helpers'
import { compare, genSalt, hash } from 'bcrypt';
import authMiddleware from '@/lib/authMiddleware';
import { newPasswordProblem } from '@/lib/passwordPolicy';
import { positiveInt } from '@/lib/inputTypes';

const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    throw new Error('SECRET_KEY environment variable is not set');
}


const handler = async (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'POST') {
        const { user_id: rawUserId, old_password, new_password } = req.body ?? {}; // ASVS 4.1.1: body null ไม่ทำให้ล้มเป็น HTTP 500 ที่ไม่มี Content-Type
        if (!rawUserId || !old_password || !new_password) {
            return res.status(401).json({ message: 'พารามิเตอร์ไม่ครบ' });
        }
        // ASVS 1.2.4: ตรวจชนิดก่อนส่งให้ Prisma (src/lib/inputTypes.ts)
        const user_id = positiveInt(rawUserId);
        if (!user_id || typeof old_password !== 'string') {
            return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
        }
        const problem = newPasswordProblem(new_password); // ASVS 6.2.8 6.2.4
        if (problem) return res.status(400).json({ message: problem });
        try {
            
           const user = await prisma.users.findFirst({
                where: {
                    users_id         : user_id
                }
            })

            if (!user) {
                return res.status(401).json({ message: 'User ไม่ถูกต้อง' });
            }
            const isPasswordMatch = await matchPassword(user.users_passwd, old_password);
            if (!isPasswordMatch) {
                return res.status(401).json({ message: 'Password ไม่ถูกต้อง' });
            }

            await prisma.users.update({
                where: {
                    users_id: user_id
                },
                data:{
                    // OWASP Password Storage Cheat Sheet: bcrypt work factor ขั้นต่ำ 10 (เดิม 8)
                    users_passwd: await hash(new_password, await genSalt(10))
                }
            });

            return res.status(200).json({ message: 'Success' });

        } catch (error) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};

export const matchPassword = async (oldPassword: string, password: string): Promise<boolean> => {
    return compare(password, oldPassword);
};

export default authMiddleware(handler);