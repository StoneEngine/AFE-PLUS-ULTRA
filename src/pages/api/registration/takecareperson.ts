import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { nestedValueProblem } from '@/lib/inputTypes'
import { fieldProblem, R, TAKECARE_RULES } from '@/lib/inputRules'

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
                    const fieldError = fieldProblem(body, { users_id: R.idRequired, ...TAKECARE_RULES })
                    if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })
                    await prisma.takecareperson.create({
                        data: {
                            users_id: Number(body.users_id),
                            takecare_fname: body.takecare_fname,
                            takecare_sname: body.takecare_sname,
                            takecare_birthday: body.takecare_birthday,
                            gender_id: Number(body.gender_id),
                            marry_id: Number(body.marry_id),
                            takecare_number: body.takecare_number,
                            takecare_moo: body.takecare_moo,
                            takecare_road: body.takecare_road,
                            takecare_tubon: body.takecare_tubon,
                            takecare_amphur: body.takecare_amphur,
                            takecare_province: body.takecare_province,
                            takecare_postcode: body.takecare_postcode,
                            takecare_tel1: body.takecare_tel1,
                            takecare_tel_home: body.takecare_tel_home,
                            takecare_disease: body.takecare_disease,
                            takecare_drug: body.takecare_drug,
                            takecare_status: 1
                        },
                    })
                    return res.status(200).json({ message: 'success' })
                }
                // ASVS 2.1.1: body ว่างหรือ null ตอบ 400 ตาม docs/INPUT-VALIDATION.md (เดิมตอบ 200 success โดยไม่บันทึก)
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
