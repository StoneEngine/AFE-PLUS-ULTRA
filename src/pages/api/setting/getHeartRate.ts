import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { positiveInt } from '@/lib/inputTypes'

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const takecare_id = req.query.takecare_id
                const users_id = req.query.users_id
                const id = req.query.id

                let heartrate_settings = null
                // ASVS 15.3.1: ผู้เรียก (pages/settingHeartRate.tsx · api/lineProfile.ts แล้ว utils/apiLineReply.ts replySetting) อ่านแค่ 2 ช่องนี้
                // min_bpm ที่ apiLineReply อ่านอยู่ในบรรทัดคอมเมนต์ (เดิมคืนทั้งแถว 5 ช่อง)
                const select = { id: true, max_bpm: true }

                // ASVS 2.2.2: รหัสต้องเป็นจำนวนเต็มบวก (docs/INPUT-VALIDATION.md หัวข้อ 6) เดิมค่าอื่นทำให้ Prisma ล้มเป็น HTTP 500
                if (id && !positiveInt(id)) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ id ไม่ใช่ตัวเลข' });
                }
                if (id) {
                    heartrate_settings = await prisma.heartrate_settings.findFirst({
                        where: { id: Number(id) },
                        select,
                    });
                } else {
                    // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม isNaN(Number()) รับ "1e0" " 1")
                    if (!positiveInt(takecare_id) || !positiveInt(users_id)) {
                        return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ takecare_id หรือ users_id ไม่ใช่ตัวเลข' });
                    }

                    heartrate_settings = await prisma.heartrate_settings.findFirst({
                        where: {
                            users_id: Number(users_id),
                            takecare_id: Number(takecare_id),
                        },
                        select,
                    });
                }

                return res.status(200).json({ message: 'success', data: heartrate_settings });

            } catch (error) {
                console.error("Error fetching heartrate settings:", error)
                return res.status(500).json({ message: 'error', data: error });
            }
        } else {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
        }
    }
);
