import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma'
import { positiveInt } from '@/lib/inputTypes'
import { RETURN, canConfirmReturn } from '@/lib/borrowWorkflow'

const handler = async (req: NextApiRequest, res: NextApiResponse ) => {
    if (req.method === 'PUT') {
        try {
            const { status: rawStatus, user_id: rawUserId, borrow_id: rawBorrowId } = req.body;
            if(!rawStatus || !rawUserId || !rawBorrowId){
                return res.status(401).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            }
            // ASVS 1.2.4: ตรวจชนิดก่อนส่งให้ Prisma (src/lib/inputTypes.ts)
            const status = positiveInt(rawStatus), user_id = positiveInt(rawUserId), borrow_id = positiveInt(rawBorrowId);
            if (!status || !user_id || !borrow_id || !Object.values(RETURN).includes(status as 1 | 2 | 3)) {
                return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
            }
            // ASVS 2.3.1: ยืนยันผลการคืนได้เมื่ออนุมัติ + ส่งแบบสอบถามแล้ว · คืนสำเร็จต้องคืนครบทุกชิ้นก่อน (src/lib/borrowWorkflow.ts)
            const current = await prisma.borrowequipment.findUnique({ where: { borrow_id } });
            if (!current) return res.status(404).json({ message: 'ไม่พบรายการยืม' });
            const itemsLeft = await prisma.borrowequipment_list.count({ where: { borrow_id } });
            const outOfOrder = canConfirmReturn(current, status, itemsLeft);
            if (outOfOrder) return res.status(409).json({ message: outOfOrder });

            await prisma.borrowequipment.update({
                where: {
                    borrow_id: borrow_id
                },
                data: {
                    borrow_status        : status,
                    borrow_return_user_id: user_id,
                    borrow_return_date   : new Date(),
                    borrow_update_date   : new Date(),
                    borrow_update_user_id: user_id
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