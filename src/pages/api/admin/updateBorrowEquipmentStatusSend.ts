import type { NextApiRequest, NextApiResponse } from 'next';
import authMiddleware from '@/lib/authMiddleware';
import prisma from '@/lib/prisma';
import { replyNotificationSendDocQuery } from '@/utils/apiLineReply';
import { decrypt, encrypt } from '@/utils/helpers';
import { positiveInt } from '@/lib/inputTypes';
import { APPROVAL, canSendQuestionnaire } from '@/lib/borrowWorkflow';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'PUT') {
        try {
            const { status: rawStatus, user_id: rawUserId, borrow_id: rawBorrowId } = req.body;
            if (!rawStatus || !rawUserId || !rawBorrowId) {
                return res.status(401).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            }
            // ASVS 1.2.4: ตรวจชนิดก่อนส่งให้ Prisma (src/lib/inputTypes.ts)
            // ASVS 2.2.1: status user_id ตรวจด้วย positiveInt และ status 1–3 แบบ updateBorrowEquipmentStatus.ts (เดิมตรวจแค่ว่ามีค่า "abc" {} ผ่าน)
            const status = positiveInt(rawStatus), user_id = positiveInt(rawUserId), borrow_id = positiveInt(rawBorrowId);
            if (!status || !user_id || !borrow_id || !Object.values(APPROVAL).includes(status as 1 | 2 | 3)) {
                return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
            }

            const borrowequipment = await prisma.borrowequipment.findFirst({
                where: {
                    borrow_id: borrow_id
                },
                select: {
                    borrow_equipment_status: true,
                    borrow_send_status: true,
                    borrow_status: true,
                    users_id_ref: {
                        select: {
                            users_line_id: true
                        }
                    }
                }
            });

            // ASVS 2.3.1: ส่งแบบสอบถามได้เมื่ออนุมัติการยืมแล้วและยังไม่ปิดการคืน (src/lib/borrowWorkflow.ts)
            if (!borrowequipment) return res.status(404).json({ message: 'ไม่พบรายการยืม' });
            const outOfOrder = canSendQuestionnaire(borrowequipment);
            if (outOfOrder) return res.status(409).json({ message: outOfOrder });

            // ตรวจสอบว่ามีค่า users_line_id หรือไม่
            const replyToken = borrowequipment?.users_id_ref?.users_line_id ?? '';
            if (replyToken) {
                await replyNotificationSendDocQuery({
                    replyToken,
                    userData: {
                        borrow_id: encrypt(borrow_id.toString())
                    }
                });
                await prisma.borrowequipment.update({
                    where: {
                        borrow_id: borrow_id
                    },
                    data: {
                        borrow_send_status: 2,
                        borrow_send_date: new Date()
                    }
                });
            } else {
                return res.status(401).json({ message: 'ไม่พบข้อมูลผู้ยืม' });
            }

            return res.status(200).json({ message: 'Success' });
        } catch (error) {
            console.log("🚀 ~ handler ~ error:", error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลได้', error: errorMessage });
        }
    } else {
        // ASVS 4.1.1: method อื่นตอบ 405 (เดิมไม่ตอบ คำขอค้าง)
        return res.status(405).json({ message: 'Method not allowed' });
    }
};

export default authMiddleware(handler);
