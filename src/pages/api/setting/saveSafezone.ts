import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { nestedValueProblem } from '@/lib/inputTypes'
import { fieldProblem, SAFEZONE_RULES } from '@/lib/inputRules'

type Data = {
    message: string;
    data?: any;
}

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'POST') {
            try {
                if (req.body) {
                    const body = req.body
                    // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
                    const shape = nestedValueProblem(body)
                    if (shape) return res.status(400).json({ message: 'error', data: shape })
                    // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
                    const fieldError = fieldProblem(body, SAFEZONE_RULES)
                    if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })
                    // รหัสทุกช่องตรวจแล้วด้วย SAFEZONE_RULES (idRequired idOptional) จึงไม่ตรวจ Number() ซ้ำ
                    // ASVS 2.2.1: รัศมีชั้น 1 ต้องไม่เกินชั้น 2 (ความสัมพันธ์ตามตรรกะ เหมือน RangeSlider ใน pages/setting.tsx)
                    // เดิมรับ lv1 > lv2 ทำให้ sentlocation.ts คำนวณสถานะเขตปลอดภัยผิด
                    if (Number(body.safez_radiuslv1) > Number(body.safez_radiuslv2)) {
                        return res.status(400).json({ message: 'error', data: 'safez_radiuslv1 ต้องไม่มากกว่า safez_radiuslv2' })
                    }
                    if (body.safezone_id) {
                        await prisma.safezone.update({
                            where: {
                                safezone_id: Number(body.safezone_id),
                            },
                            data: {
                                safez_latitude: body.safez_latitude,
                                safez_longitude: body.safez_longitude,
                                safez_radiuslv1: Number(body.safez_radiuslv1),
                                safez_radiuslv2: Number(body.safez_radiuslv2),
                            },
                        })
                        return res.status(200).json({ message: 'success' })
                    } else {
                        const createdSafezone = await prisma.safezone.create({
                            data: {
                                takecare_id: Number(body.takecare_id),
                                users_id: Number(body.users_id),
                                safez_latitude: body.safez_latitude,
                                safez_longitude: body.safez_longitude,
                                safez_radiuslv1: Number(body.safez_radiuslv1),
                                safez_radiuslv2: Number(body.safez_radiuslv2),
                            },
                        })
                        return res.status(200).json({ message: 'success', id: createdSafezone.safezone_id })
                    }
                }
                return res.status(400).json({ message: 'error', data: 'error' })
            } catch (error) {
                console.log("🚀 ~ file: create.ts:31 ~ handle ~ error:", error)
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['POST'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
