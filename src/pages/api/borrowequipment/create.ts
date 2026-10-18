import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withLineUser } from '@/lib/withLineUser';
import { nestedValueProblem, positiveInt, positiveIntList } from '@/lib/inputTypes';
import { fieldProblem, BORROW_RULES } from '@/lib/inputRules';

// ยืมได้เฉพาะในนามตัวเอง (borrow_user_id ต้องเป็น users_id ของคนที่ล็อกอิน)
// ASVS 2.2.1: ตรวจด้วย positiveInt แบบ list.ts (เดิม Number() รับ "1e0" " 1" "0x1" true เป็น 1)
export default withLineUser(handle, (req, usersId) => positiveInt(req.body?.borrow_user_id) === usersId);

async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            const body = req.body ?? {}; // ASVS 4.1.1: body null ตอบ 400 แทน HTTP 500

            // ตรวจสอบว่ามีข้อมูลครบถ้วน
            if (!body.borrow_date || !body.borrow_return || !body.borrow_user_id ||
                !body.borrow_address || !body.borrow_tel || !body.borrow_objective ||
                !body.borrow_name || !body.borrow_list || body.borrow_list.length === 0) {
                return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            }
            // ASVS 1.2.4: รหัสที่ใส่ลง where/data ของ Prisma ต้องเป็นจำนวนเต็มบวก (src/lib/inputTypes.ts)
            const borrowUserId = positiveInt(body.borrow_user_id);
            const equipmentIds = Array.isArray(body.borrow_list)
                ? positiveIntList(body.borrow_list.map((item: { equipment_id?: unknown }) => item?.equipment_id))
                : null;
            if (!borrowUserId || !equipmentIds || nestedValueProblem(body, ['borrow_list'])) {
                return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
            }
            // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
            const fieldError = fieldProblem(body, BORROW_RULES);
            if (fieldError) return res.status(400).json({ message: fieldError });
            // (ไม่ตรวจว่าวันคืนต้องไม่ก่อนวันยืม: หน้า pages/borrowequipment/borrow.tsx:232–233 ปิดช่องวันสิ้นสุดไว้ และส่ง borrow_return
            //  เป็นเวลาที่เปิดหน้า ถ้าตรวจ ผู้ใช้ที่เลือกวันยืมในอนาคตจะยื่นคำขอไม่ได้ — docs/INPUT-VALIDATION.md หัวข้อ 7)

            // ASVS 2.1.1 (docs/INPUT-VALIDATION.md "ไม่บันทึกข้อมูลบางส่วน"): ตรวจว่าอุปกรณ์ทุกตัวมีอยู่ก่อนสร้างแถว
            // แล้วเขียนทุกแถวใน transaction เดียว (เดิมสร้างแถว borrowequipment ก่อน แล้วตอบ 400 เมื่อเจออุปกรณ์ที่ไม่มี แถวที่สร้างแล้วค้าง)
            // ASVS 2.2.1: รหัสอุปกรณ์ในรายการเดียวต้องไม่ซ้ำ
            if (new Set(equipmentIds).size !== equipmentIds.length) {
                return res.status(400).json({ message: 'รายการอุปกรณ์มีรหัสซ้ำ' });
            }
            const found = await prisma.equipment.findMany({
                where: { equipment_id: { in: equipmentIds } },
                select: { equipment_id: true, equipment_status: true }
            });
            const foundIds = new Set(found.map(e => e.equipment_id));
            const missingId = equipmentIds.find(id => !foundIds.has(id));
            if (missingId !== undefined) {
                return res.status(400).json({ message: `อุปกรณ์ ID ${missingId} ไม่พบในระบบ` });
            }
            // ASVS 2.2.1: ยืมได้เฉพาะอุปกรณ์ที่ว่าง (equipment_status = 1 เกณฑ์เดียวกับ borrowequipment/getAvailableEquipment.ts
            // ที่หน้าเว็บใช้แสดงรายการให้เลือก · ยืมแล้วระบบตั้งเป็น 0 ด้านล่าง) — เดิมส่งรหัสอุปกรณ์ที่คนอื่นยืมอยู่ได้
            const busy = found.find(e => e.equipment_status !== 1);
            if (busy) {
                return res.status(409).json({ message: `อุปกรณ์ ID ${busy.equipment_id} ไม่ว่าง` });
            }

            await prisma.$transaction(async (tx) => {
                // สร้างข้อมูลการยืมอุปกรณ์
                const borrowequipment = await tx.borrowequipment.create({
                    data: {
                        borrow_date          : new Date(body.borrow_date),
                        borrow_return        : new Date(body.borrow_return),
                        borrow_user_id       : borrowUserId,
                        borrow_address       : body.borrow_address,
                        borrow_tel           : body.borrow_tel,
                        borrow_objective     : body.borrow_objective,
                        borrow_name          : body.borrow_name,
                        borrow_create_date   : new Date(),
                        borrow_update_date   : new Date(),
                        borrow_update_user_id: borrowUserId,
                    },
                });

                // เพิ่มอุปกรณ์ที่ถูกยืมลงใน borrowequipment_list และอัปเดตสถานะอุปกรณ์
                for (const equipmentId of equipmentIds) {
                    await tx.borrowequipment_list.create({
                        data: {
                            borrow_id: borrowequipment.borrow_id,
                            equipment_id: equipmentId,
                        }
                    });

                    // อัปเดตสถานะอุปกรณ์ให้เป็น "ถูกยืมแล้ว" (0 = Borrowed)
                    await tx.equipment.update({
                        where: { equipment_id: equipmentId },
                        data: { equipment_status: 0 }
                    });
                }
            });

            return res.status(200).json({ message: 'บันทึกข้อมูลสำเร็จ' });
        } catch (error) {
            console.error("🚀 ~ handle ~ error:", error);
            return res.status(500).json({ message: 'เกิดข้อผิดพลาด', data: error });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
    }
}
