import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withLineUser } from '@/lib/withLineUser';
import { positiveIntList } from '@/lib/inputTypes';
import { canReturn } from '@/lib/borrowWorkflow';

// คืนได้เฉพาะรายการที่ตัวเองยืม — ทุก borrow_equipment_id ใน returnList ต้องอยู่ในการยืมของคนที่ล็อกอิน
export default withLineUser(handle, async (req, usersId) => {
    const ids = positiveIntList(req.body?.returnList) ?? [];
    if (ids.length === 0) return true; // handler ตอบ 400 เอง
    const owned = await prisma.borrowequipment_list.count({
        where: { borrow_equipment_id: { in: ids }, borrow_id_ref: { borrow_user_id: usersId } },
    });
    return owned === ids.length;
});

async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            // รับรายการอุปกรณ์ที่ต้องการคืน (array ของ borrow_equipment_id)
            // ASVS 1.2.4: ต้องเป็นรายการจำนวนเต็มบวก ก่อนใส่ลง in: ของ Prisma (src/lib/inputTypes.ts)
            const returnList = positiveIntList(req.body?.returnList);

            if (!returnList) {
                return res.status(400).json({ message: 'ไม่มีรายการอุปกรณ์ที่ต้องคืน' });
            }

            // ASVS 2.3.1: คืนได้เมื่อการยืมได้รับอนุมัติ ส่งแบบสอบถามแล้ว และยังไม่ปิดการคืน (src/lib/borrowWorkflow.ts)
            const borrows = await prisma.borrowequipment.findMany({
                where: { borrowequipment_list: { some: { borrow_equipment_id: { in: returnList } } } },
                select: { borrow_equipment_status: true, borrow_send_status: true, borrow_status: true },
            });
            const outOfOrder = borrows.map(canReturn).find((problem) => problem);
            if (borrows.length === 0 || outOfOrder) {
                return res.status(409).json({ message: outOfOrder || 'ไม่พบรายการยืม' });
            }

            // ดึงรายการ equipment_id ที่เกี่ยวข้องกับ borrow_equipment_id ที่คืน
            const returnedEquipments = await prisma.borrowequipment_list.findMany({
                where: { borrow_equipment_id: { in: returnList } },
                select: { equipment_id: true }
            });

            const equipmentIds = returnedEquipments.map((item: typeof returnedEquipments[number]) => item.equipment_id);

            // อัปเดตสถานะของอุปกรณ์ให้เป็น 1 (ว่าง)
            await prisma.equipment.updateMany({
                where: { equipment_id: { in: equipmentIds } },
                data: { equipment_status: 1 }
            });

            // ลบรายการใน borrowequipment_list ที่เกี่ยวข้องกับอุปกรณ์ที่ถูกคืน
            await prisma.borrowequipment_list.deleteMany({
                where: { borrow_equipment_id: { in: returnList } }
            });

            return res.status(200).json({ message: 'คืนอุปกรณ์สำเร็จ' });
        } catch (error) {
            console.error('Error updating return status:', error);
            return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการคืนอุปกรณ์' });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `Method ${req.method} not allowed` });
    }
}
