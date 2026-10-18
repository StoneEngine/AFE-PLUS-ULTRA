import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma';
import { positiveInt } from '@/lib/inputTypes';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'GET') {
        try {
            const { name, name_borrow, status } = req.query;
            // ASVS 2.2.1: name name_borrow ต้องเป็นข้อความตัวเดียว ส่งซ้ำ (?name=a&name=b) ได้ array ที่ contains ของ Prisma ไม่รับ (เดิมได้ HTTP 500)
            if ((name !== undefined && typeof name !== 'string') || (name_borrow !== undefined && typeof name_borrow !== 'string')) {
                return res.status(400).json({ message: 'error', data: 'name และ name_borrow ต้องเป็นข้อความ' });
            }

            const filters: any = {
                borrow_delete_date: null,
                borrow_equipment_status: 2, // ✅ ใช้สถานะที่ถูกต้อง
                borrow_name: {
                    contains: name_borrow as string,
                },
                OR: [
                    {
                        users_id_ref: {
                            users_fname: {
                                contains: name as string,
                            },
                        },
                    },
                    {
                        users_id_ref: {
                            users_sname: {
                                contains: name as string,
                            },
                        },
                    },
                ],
            };

            if (status) {
                // ASVS 2.2.1: สถานะต้องเป็นจำนวนเต็มบวก (หน้าแอดมินส่ง '' หรือ '1' '2' '3') เดิม parseInt รับ "2abc" เป็น 2
                const statusId = positiveInt(status);
                if (!statusId) return res.status(400).json({ message: 'error', data: 'status ไม่ถูกต้อง' });
                filters.borrow_status = statusId;
            }

            // ✅ คิวรี่ข้อมูลการยืมอุปกรณ์
            const borrowequipment = await prisma.borrowequipment.findMany({
                where: filters,
                // ASVS 15.3.1: ผู้เรียก (pages/admin/return_equipment.tsx ผ่าน lib/service/borrowEquipment.ts) อ่านแค่ช่องที่เหลือ
                // ไม่คืน borrow_return (หน้าเว็บอ่านแค่ในบรรทัดคอมเมนต์) borrow_address borrow_tel borrow_objective borrow_create_date borrow_update_date
                // และ borrowequipment_list[].borrow_equipment_id borrow_equipment_status equipment_id (เดิม select 18 ช่อง + relation)
                select: {
                    borrow_id: true,
                    borrow_name: true,
                    borrow_date: true,
                    borrow_status: true,
                    users_id_ref: {
                        select: {
                            users_fname: true,
                            users_sname: true,
                        },
                    },
                    borrow_equipment_status: true,
                    borrowequipment_list: {
                        select: {
                            equipment: { // ✅ ดึงข้อมูลอุปกรณ์ที่ถูกยืม
                                select: {
                                    equipment_name: true,
                                    equipment_code: true,
                                },
                            },
                        },
                    },
                    borrow_approver_ref: {
                        select: {
                            users_fname: true,
                            users_sname: true,
                        },
                    },
                    borrow_approver_date: true,
                    borrow_return_user_ref: { // ✅ แสดงชื่อผู้คืนอุปกรณ์
                        select: {
                            users_fname: true,
                            users_sname: true,
                        },
                    },
                    borrow_return_date: true,
                },
                orderBy: {
                    borrow_id: 'desc',
                },
            });

            return res.status(200).json({ message: 'Success', data: borrowequipment });

        } catch (error) {
            console.error("🚀 ~ handler ~ error:", error);
            return res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลได้' });
        }
    } else {
        return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);
