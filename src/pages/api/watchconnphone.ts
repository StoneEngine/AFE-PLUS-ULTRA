import { NextApiRequest, NextApiResponse } from 'next'
import { withRls } from '@/lib/withRls'
import { pinFormatProblem } from '@/lib/pinPolicy'
import { positiveInt } from '@/lib/inputTypes'

type Data = {
    message: string;
    data?: any;
}

export default withRls(
    // ASVS 2.2.1: ส่งค่าดิบให้ withRls ตรวจด้วย positiveInt (เดิม Number() รับ "1e0" " 1" "0x1" เป็นผู้ใช้ 1 ที่ด่านนี้)
    req => req.query?.uId,
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const query = req.query
                if (!query.uId || !query.uPin) {
                    return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ uId หรือ uPin' })
                }

                // ASVS 2.2.1: uId ต้องเป็นจำนวนเต็มบวกแบบ allowlist (เดิม Number() รับ "0x1" "1e0" " 1" เป็นผู้ใช้ 1)
                if (!positiveInt(query.uId)) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ uId ไม่ใช่ตัวเลข' })
                }
                // ASVS 2.2.2: ตรวจรูปแบบ PIN ที่เซิร์ฟเวอร์ (ตัวเลข 4 หลัก) ไม่พึ่งช่องกรอกของนาฬิกา — เดิมรับ "0x0" " 0" "0e5" ได้
                const pinProblem = pinFormatProblem(query.uPin)
                if (pinProblem) {
                    return res.status(400).json({ message: 'error', data: pinProblem })
                }

                const user = await prisma.users.findFirst({
                    where: {
                        users_id: Number(query.uId),
                        users_pin: Number(query.uPin),
                    },
                    include: {
                        users_status_id: {
                            select: {
                                status_name: true
                            }
                        }
                    },
                })

                let takecareperson = null
                if (user) {
                    takecareperson = await prisma.takecareperson.findFirst({
                        where: {
                            users_id: user.users_id as number,
                            takecare_status: 1
                        }
                    })
                }

                if (user && takecareperson) {
                    const safezone = await prisma.safezone.findFirst({
                        where: {
                            takecare_id: takecareperson.takecare_id as number,
                            users_id: user.users_id as number,
                        }
                    })
                    if (safezone) {
                        return res.status(200).json({ status: true, lat: safezone.safez_latitude, long: safezone.safez_longitude, r1: safezone.safez_radiuslv1, r2: safezone.safez_radiuslv2, takecare_id: takecareperson.takecare_id })
                    }
                    return res.status(200).json({ status: true, lat: "0", long: "0", r1: 0, r2: 0, takecare_id: takecareperson.takecare_id })
                } else {
                    return res.status(200).json({ status: false, lat: "0", long: "0", r1: 0, r2: 0, takecare_id: 0 })
                }
            } catch (error) {
                console.log("🚀 ~ file: create.ts:31 ~ handle ~ error:", error)
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['GET'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
