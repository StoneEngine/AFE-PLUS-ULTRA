import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import authMiddleware from '@/lib/authMiddleware';

// ASVS 7.4.1: ออกจากระบบต้องยกเลิก session ที่เซิร์ฟเวอร์ ไม่ใช่แค่ลบ Token บนเครื่อง
// ล้างเลข session (users_token) ของผู้ใช้ JWT ทุกใบที่ออกก่อนหน้า (รวมใบที่ต่ออายุแล้ว) จึงไม่ผ่าน authMiddleware อีก
// ทำตาม OWASP Session Management Cheat Sheet หัวข้อ Logout Button ("the web application must invalidate the session at least on server side")
// และสั่งเบราว์เซอร์ล้างข้อมูลด้วย Clear-Site-Data ตามตัวอย่างในหัวข้อ Web Content Caching and Clear-Site-Data ของ cheat sheet เดียวกัน
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: 'Method not allowed' });
    }
    await prisma.users.update({
        where: { users_id: Number((req as any).user.userId) },
        data: { users_token: null },
    });
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    return res.status(200).json({ message: 'Success' });
};

export default authMiddleware(handler);
