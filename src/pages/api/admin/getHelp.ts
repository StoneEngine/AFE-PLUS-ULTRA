import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma'
import moment from 'moment';

const handler = async (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'GET') {
        try {
            const { name } = req.query;
            const extendedhelp = await prisma.extendedhelp.findMany({
                where: {
                    exten_date:{
                        lte: new Date(`${moment().year()}-12-31`),
                        gte: new Date(`${moment().year()}-01-01`)
                    }
                },
                // ASVS 15.3.1: ผู้เรียก (pages/admin/additional_help.tsx ผ่าน lib/service/additionalHelp.ts) อ่านแค่ 2 ช่องนี้เพื่อนับรายเดือน (เดิมคืนทั้งแถว 10 ช่อง)
                select: { exten_date: true, exted_closed_date: true },
            })
            let items:any = extendedhelp;
            return res.status(200).json({ message: 'Success', data:items});
            
        } catch (error) {
            return res.status(401).json({ message: 'ไม่สามารถดึงข้อมูลได้' });
        }
    }else{
       return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);