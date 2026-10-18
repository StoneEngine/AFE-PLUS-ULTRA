import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withLineUser } from '@/lib/withLineUser';
import { positiveInt } from '@/lib/inputTypes';

// ขอรายการยืมได้เฉพาะของตัวเอง (userId ต้องเป็น users_id ของคนที่ล็อกอิน)
// ASVS 2.2.1: ตรวจ userId ด้วย positiveInt (เดิม Number()/parseInt รับ "1e0" " 1" "+1" เป็น 1)
export default withLineUser(handle, (req, usersId) => positiveInt(req.query.userId) === usersId);

async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      // อ่าน userId จาก query parameter และตรวจสอบว่ามีค่าหรือไม่
      const userId = positiveInt(req.query.userId);
      if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      // ดึงรายการการยืมที่ผ่านการอนุมัติจากแอดมิน (borrow_equipment_status = 2)
      // และกรองเฉพาะรายการที่ผู้ใช้คนนั้นเป็นผู้ยืม (borrow_user_id = userId)
      const borrowedItems = await prisma.borrowequipment.findMany({
        where: {
          borrow_equipment_status: 2,
          borrow_user_id: userId,
        },
        // ASVS 15.3.1: เลือกเฉพาะช่องที่ผู้เรียกคนเดียว (pages/borrowequipment/return_of.tsx fetchBorrowedItems) อ่าน
        // + equipment_status ที่ใช้กรองด้านล่าง (ตัดออกก่อนส่งกลับ) — เดิมคืนทั้งแถว 23 ช่อง + equipment ทั้งแถว
        // คง borrow_return ไว้ เพราะ return_of.tsx:62 อ่านค่าลง endDate (ตอนนี้แสดงแค่ในบรรทัดคอมเมนต์ :142)
        select: {
          borrow_date: true,
          borrow_return: true,
          borrowequipment_list: {
            select: {
              borrow_equipment_id: true,
              equipment: { select: { equipment_name: true, equipment_code: true, equipment_status: true } },
            },
          },
        },
        orderBy: { borrow_create_date: 'desc' },
      });

      // กรองเฉพาะอุปกรณ์ในแต่ละรายการที่ยังถูกยืมอยู่ (equipment_status = 0)
      const filteredItems = borrowedItems
        .map((item: typeof borrowedItems[number]) => ({
          borrow_date: item.borrow_date,
          borrow_return: item.borrow_return,
          borrowequipment_list: item.borrowequipment_list
            .filter((eq: typeof item.borrowequipment_list[number]) => eq.equipment?.equipment_status === 0)
            .map((eq: typeof item.borrowequipment_list[number]) => ({
              borrow_equipment_id: eq.borrow_equipment_id,
              equipment: eq.equipment ? { equipment_name: eq.equipment.equipment_name, equipment_code: eq.equipment.equipment_code } : null,
            })),
        }))
        .filter((item) => item.borrowequipment_list.length > 0);

      return res.status(200).json({ message: 'success', data: filteredItems });
    } catch (error) {
      console.error("🚀 ~ GET /api/borrowequipment/list ~ error:", error);
      return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', data: error });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: `Method ${req.method} not allowed` });
  }
}
