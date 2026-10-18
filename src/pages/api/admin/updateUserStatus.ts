import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma'
import { positiveInt } from '@/lib/inputTypes'

const handler = async (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'PUT') {
        try {
            const { id: rawId, status: rawStatus } = req.body;
            if(!rawId || !rawStatus){
                return res.status(401).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            }
            // ASVS 1.2.4: ตรวจชนิดก่อนส่งให้ Prisma (src/lib/inputTypes.ts)
            const id = positiveInt(rawId), status = positiveInt(rawStatus);
            // ASVS 2.2.1: สถานะที่มีในระบบ 1 ผู้ดูแล · 2 ผู้มีภาวะพึ่งพิง · 3 เจ้าหน้าที่ (ตาราง status) — docs/INPUT-VALIDATION.md หัวข้อ 4
            if (!id || !status || status > 3) {
                return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
            }
            await prisma.users.update({
                where: {
                    users_id: id
                },
                data: {
                    users_status_id: {
                        connect: {
                          status_id: status
                        }
                    },
                    users_status_onweb: status > 1 ? 1 : 0,
                    // ASVS 7.4.2: เปลี่ยนสิทธิ์หรือปิดสิทธิ์ใช้หน้าเว็บ = ยกเลิก session เดิมของผู้ใช้คนนั้นทันที (authMiddleware ตรวจ users_token)
                    // ทำตาม OWASP Session Management Cheat Sheet ("permission changes" ต้องออกเลข session ใหม่)
                    users_token: null
                }
            })

            return res.status(200).json({ message: 'Success'});
            
        } catch (error) {
            console.log("🚀 ~ handler ~ error:", error)
            return res.status(401).json({ message: 'ไม่สามารถดึงข้อมูลได้' });
        }
    }else{
       return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);