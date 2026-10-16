import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { withLineOwner } from '@/lib/withLineOwner'

// สมัครได้เฉพาะด้วย LINE user ID ของตัวเอง (ตรงกับ LINE ID Token) และได้แค่สถานะผู้ดูแล (status_id = 1)
// ตามที่ registration.tsx ส่งเสมอ — กันคนนอกสมัครแทนคนอื่น หรือตั้งตัวเองเป็นเจ้าหน้าที่ (status 3)
const onlySelfCaregiver = withLineOwner((req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST' && Number(req.body?.status_id) !== 1) {
        return res.status(400).json({ message: 'error', data: 'สมัครผ่านหน้าเว็บได้เฉพาะผู้ดูแล' })
    }
    return handle(req, res)
}, (req) => req.body?.users_line_id)

export default function guarded(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'OPTIONS') return handle(req, res) // preflight ไม่มี Token ให้ handler เดิมตอบ
    return onlySelfCaregiver(req, res)
}

async function handle(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // อนุญาตให้ทุกต้นทางเข้าถึงได้
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // อนุญาตให้ method เหล่านี้
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // อนุญาตให้ header เหล่านี้

    if (req.method === 'OPTIONS') {
        res.status(200).end(); // ตอบกลับ preflight request ด้วย 200 OK
        return;
    }

    if (req.method === 'POST') {
        try {
            if (req.body) {
                const body = req.body
                await prisma.users.create({
                    data: {
                        users_line_id      : body.users_line_id,
                        users_fname        : body.users_fname,
                        users_sname        : body.users_sname,
                        users_passwd       : body.users_passwd,
                        users_pin          : Number(body.users_pin),
                        status_id          : body.status_id,
                        users_alert_battery: 0,
                        users_status_active: 1,
                        users_number       : body.users_number,
                        users_moo          : body.users_moo,
                        users_road         : body.users_road,
                        users_tubon        : body.users_tubon,
                        users_amphur       : body.users_amphur,
                        users_province     : body.users_province,
                        users_postcode     : body.users_postcode,
                        users_tel1         : body.users_tel1,
                        users_tel_home     : body.users_tel_home,
                    },
                })
            }
            return res.status(200).json({ message: 'success' })
        } catch (error) {
            console.log("🚀 ~ file: create.ts ~ handle ~ error:", error)
            return res.status(400).json({ message: 'error', data: error })
        }
    } else {
        res.setHeader('Allow', ['POST'])
        res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
    }
}
