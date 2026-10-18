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
                // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม isNaN(Number()) รับ "1e0" " 1")
                if (!positiveInt(takecare_id) || !positiveInt(users_id)) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ takecare_id หรือ users_id ไม่ใช่ตัวเลข' })
                }
                // ASVS 2.2.2: รหัสต้องเป็นจำนวนเต็มบวก (docs/INPUT-VALIDATION.md หัวข้อ 6) เดิมค่าอื่นทำให้ Prisma ล้มเป็น HTTP 500
                if (id && !positiveInt(id)) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ id ไม่ใช่ตัวเลข' })
                }
                let safezone = null
                // ASVS 15.3.1: ผู้เรียก (pages/location.tsx · pages/setting.tsx · lib/listAPI.ts แล้ว lib/lineFunction.ts
                // · api/webhook.ts api/lineProfile.ts แล้ว utils/apiLineReply.ts utils/apiLineGroup.ts) อ่านแค่ 5 ช่องนี้ ไม่อ่าน takecare_id users_id (เดิมคืนทั้งแถว 7 ช่อง)
                const select = { safezone_id: true, safez_latitude: true, safez_longitude: true, safez_radiuslv1: true, safez_radiuslv2: true }
                if (id) {
                    safezone = await prisma.safezone.findFirst({
                        where: {
                            safezone_id: Number(id)
                        },
                        select,
                    })
                } else {
                    safezone = await prisma.safezone.findFirst({
                        where: {
                            takecare_id: Number(takecare_id),
                            users_id: Number(users_id),
                        },
                        select,
                    })
                }

                return res.status(200).json({ message: 'success', data: safezone })
            } catch (error) {
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['GET'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
