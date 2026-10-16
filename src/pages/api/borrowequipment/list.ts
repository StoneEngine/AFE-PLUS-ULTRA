import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withLineUser } from '@/lib/withLineUser';

// ขอรายการยืมได้เฉพาะของตัวเอง (userId ต้องเป็น users_id ของคนที่ล็อกอิน)
export default withLineUser(handle, (req, usersId) => Number(req.query.userId) === usersId);

async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      // อ่าน userId จาก query parameter และตรวจสอบว่ามีค่าหรือไม่
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : null;
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
        include: {
          borrowequipment_list: {
            include: {
              equipment: true,
            },
          },
        },
        orderBy: { borrow_create_date: 'desc' },
      });

      // กรองเฉพาะอุปกรณ์ในแต่ละรายการที่ยังถูกยืมอยู่ (equipment_status = 0)
      const filteredItems = borrowedItems
        .map((item: typeof borrowedItems[number]) => ({
          ...item,
          borrowequipment_list: item.borrowequipment_list.filter(
            (eq: typeof item.borrowequipment_list[number]) => eq.equipment?.equipment_status === 0
          ),
        }))
        .filter((item: typeof borrowedItems[number]) => item.borrowequipment_list.length > 0);

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
