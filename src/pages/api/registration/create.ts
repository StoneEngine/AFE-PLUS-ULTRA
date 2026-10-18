import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'
import { withLineOwner } from '@/lib/withLineOwner'
import { hash, genSalt } from 'bcrypt'
import { newPasswordProblem } from '@/lib/passwordPolicy'
import { newPinProblem } from '@/lib/pinPolicy'
import { nestedValueProblem, positiveInt } from '@/lib/inputTypes'
import { fieldProblem, R, USER_PROFILE_RULES } from '@/lib/inputRules'

// สมัครได้เฉพาะด้วย LINE user ID ของตัวเอง (ตรงกับ LINE ID Token) และได้แค่สถานะผู้ดูแล (status_id = 1)
// ตามที่ registration.tsx ส่งเสมอ — กันคนนอกสมัครแทนคนอื่น หรือตั้งตัวเองเป็นเจ้าหน้าที่ (status 3)
const onlySelfCaregiver = withLineOwner((req: NextApiRequest, res: NextApiResponse) => {
    // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม Number() รับ "1e0" " 1" "0x1" "1.0" true เป็น 1)
    if (req.method === 'POST' && positiveInt(req.body?.status_id) !== 1) {
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
                // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
                const shape = nestedValueProblem(body)
                if (shape) return res.status(400).json({ message: 'error', data: shape })
                // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
                const fieldError = fieldProblem(body, { users_line_id: R.lineUserId, ...USER_PROFILE_RULES })
                if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })
                // ASVS 11.4.1: เก็บรหัสผ่านด้วย bcrypt (เดิมหน้าเว็บแปลงด้วย MD5 ก่อนส่งมา)
                // users_passwd ในฐานข้อมูลห้ามว่าง เดิมถ้าไม่ส่งมา prisma ก็ล้มอยู่แล้ว จึงตอบ 400 ตั้งแต่ตรงนี้
                const problem = newPasswordProblem(body.users_passwd) // ASVS 6.2.8 6.2.4
                if (problem) return res.status(400).json({ message: 'error', data: problem })
                const pinProblem = newPinProblem(body.users_pin) // ASVS 2.2.2 6.2.4
                if (pinProblem) return res.status(400).json({ message: 'error', data: pinProblem })
                const passwd = await hash(body.users_passwd, await genSalt(10))
                await prisma.users.create({
                    data: {
                        users_line_id      : body.users_line_id,
                        users_fname        : body.users_fname,
                        users_sname        : body.users_sname,
                        users_passwd       : passwd,
                        users_pin          : Number(body.users_pin),
                        status_id          : 1, // onlySelfCaregiver ตรวจแล้วว่าต้องเป็น 1
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
