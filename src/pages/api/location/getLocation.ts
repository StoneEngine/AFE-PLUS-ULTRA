import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { positiveInt } from '@/lib/inputTypes'

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                // ASVS 2.2.1: ตรวจรหัสด้วย positiveInt (เดิม isNaN(Number()) รับ "1e0" " 1")
                const users_id = positiveInt(req.query.users_id);
                const takecare_id = positiveInt(req.query.takecare_id);

                if (!users_id || !takecare_id) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ไม่ถูกต้อง' });
                }

                const latestLocation = await prisma.location.findFirst({
                    where: {
                        users_id,
                        takecare_id,
                    },
                    orderBy: {
                        location_id: 'desc',
                    },
                    // ASVS 15.3.1: ผู้เรียก (pages/location.tsx · utils/apiLineReply.ts replyLocation · utils/apiLineGroup.ts) อ่านแค่ 3 ช่องนี้
                    select: { location_id: true, locat_latitude: true, locat_longitude: true },
                });

                if (!latestLocation) {
                    return res.status(404).json({ message: 'error', data: 'ไม่พบตำแหน่งล่าสุด' });
                }

                return res.status(200).json({
                    message: 'success',
                    data: latestLocation,
                });
            } catch (error) {
                console.error("Error:", error);
                return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการประมวลผล' });
            }
        } else {
            res.setHeader('Allow', ['GET']);
            res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
        }
    }
);
