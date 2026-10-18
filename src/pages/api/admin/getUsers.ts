import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma'

const handler = async (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'GET') {
        try {
            const { name } = req.query;
            // ASVS 2.2.1: name ต้องเป็นข้อความตัวเดียว ส่งซ้ำ (?name=a&name=b) ได้ array ที่ contains ของ Prisma ไม่รับ (เดิมล้มไปที่ catch ได้ HTTP 401)
            if (name !== undefined && typeof name !== 'string') {
                return res.status(400).json({ message: 'name ต้องเป็นข้อความ' });
            }
            const user = await prisma.users.findMany({
                where: {
                    NOT: {
                        users_id: 2
                    },
                    OR: [
                        {
                            users_fname: {
                                contains: name as string
                            }
                        },
                        {
                            users_sname: {
                                contains: name as string
                            }
                        }
                    ]
                },
                // ASVS 15.3.1: ผู้เรียก (pages/admin/user_management.tsx ผ่าน lib/service/userManagement.ts) อ่านแค่ 6 ช่องนี้ ไม่อ่าน status_id (เดิม 7 ช่อง)
                select:{
                    users_id:true,
                    users_fname: true,
                    users_sname: true,
                    users_status_id:{
                        select:{
                            status_name: true
                        }
                    },
                    users_status_onweb: true,
                    users_status_active: true
                }
            })
            let items:any = user;
            return res.status(200).json({ message: 'Success', data:items});
            
        } catch (error) {
            return res.status(401).json({ message: 'ไม่สามารถดึงข้อมูลได้' });
        }
    }else{
       return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);