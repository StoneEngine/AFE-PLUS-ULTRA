import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { decrypt } from '@/utils/helpers'
import { positiveInt } from '@/lib/inputTypes'

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const id = decrypt(req.query.id as string);
                if (!id) {
                    return res.status(400).json({ message: 'Invalid ID', data: null });
                }

                // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม parseInt รับ "1abc" เป็น 1)
                const takecarepersonId = positiveInt(id);
                if (!takecarepersonId) {
                    return res.status(400).json({ message: 'Invalid ID format', data: null });
                }

                const response = await prisma.takecareperson.findFirst({
                    where: {
                        OR: [
                            { takecare_id: takecarepersonId },
                            { users_id: takecarepersonId },
                        ],
                        takecare_status: 1,
                    },
                    // ASVS 15.3.1: ผู้เรียกคนเดียว (lib/listAPI.ts getTakecareperson แล้ว lib/lineFunction.ts กับ utils/apiLineGroup.ts replyNotification)
                    // อ่านแค่ 4 ช่องนี้ ไม่มีหน้าเว็บเรียก (เดิมคืนทั้งแถว 19 ช่อง + gender_describe + marry_describe)
                    select: { takecare_id: true, takecare_fname: true, takecare_sname: true, takecare_tel1: true },
                });

                if (!response) {
                    return res.status(404).json({ message: 'Data not found', data: null });
                }

                return res.status(200).json({ message: 'Success', data: response });
            } catch (error) {
                return res.status(500).json({ message: 'Error occurred', data: error });
            }
        } else {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
        }
    }
);
