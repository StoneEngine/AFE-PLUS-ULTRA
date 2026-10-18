import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { decrypt } from '@/utils/helpers'
import { newPinProblem, pinFormatProblem, storedPinText } from '@/lib/pinPolicy'
import { nestedValueProblem, positiveInt } from '@/lib/inputTypes'
import { fieldProblem, USER_PROFILE_RULES } from '@/lib/inputRules'

type Data = {
    message: string;
    data?: any;
}

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'POST') {
            try {
                const id = decrypt(req.query.id as string);
                if (req.body && id) {
                    const body = req.body
                    const userId = positiveInt(id);
                    if (!userId) return res.status(400).json({ message: 'error', data: 'รหัสผู้ใช้ไม่ถูกต้อง' })
                    // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
                    const shape = nestedValueProblem(body)
                    if (shape) return res.status(400).json({ message: 'error', data: shape })
                    // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
                    const fieldError = fieldProblem(body, USER_PROFILE_RULES)
                    if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })

                    // ASVS 6.2.3: เปลี่ยน PIN ต้องส่ง PIN เดิม (old_pin) และ PIN ใหม่ · ไม่ส่ง users_pin = ไม่เปลี่ยน PIN
                    // ASVS 2.2.2 6.2.4: PIN ใหม่ตรวจรูปแบบและรายการ PIN ที่คนใช้บ่อยที่เซิร์ฟเวอร์
                    // ทำตาม OWASP Authentication Cheat Sheet หัวข้อ Change Password Feature ("Current password verification.")
                    let newPin: number | undefined = undefined
                    if (body.users_pin !== undefined && body.users_pin !== '') {
                        const problem = newPinProblem(body.users_pin)
                        if (problem) return res.status(400).json({ message: 'error', data: problem })
                        const current = await prisma.users.findUnique({ where: { users_id: userId }, select: { users_pin: true } })
                        if (!current || pinFormatProblem(body.old_pin) || storedPinText(current.users_pin) !== body.old_pin) {
                            return res.status(401).json({ message: 'error', data: 'PIN เดิมไม่ถูกต้อง' })
                        }
                        newPin = Number(body.users_pin)
                    }

                    await prisma.users.update({
                        where: {
                            users_id: userId,
                        },
                        data: {
                            users_fname: body.users_fname,
                            users_sname: body.users_sname,
                            users_pin: newPin,
                            users_number: body.users_number,
                            users_moo: body.users_moo,
                            users_road: body.users_road,
                            users_tubon: body.users_tubon,
                            users_amphur: body.users_amphur,
                            users_province: body.users_province,
                            users_postcode: body.users_postcode,
                            users_tel1: body.users_tel1,
                            users_tel_home: body.users_tel_home,
                        },
                    })
                    return res.status(200).json({ message: 'success' })
                }
                // ASVS 2.1.1: body ว่างหรือ null (หรือ id ถอดรหัสไม่ได้) ตอบ 400 ตาม docs/INPUT-VALIDATION.md (เดิมตอบ 200 success โดยไม่บันทึก)
                return res.status(400).json({ message: 'error', data: 'ไม่พบข้อมูล' })
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
