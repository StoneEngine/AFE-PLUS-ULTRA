import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { decrypt } from '@/utils/helpers'
import { positiveInt } from '@/lib/inputTypes'

// ด่าน: ยืนยันตัวตนจาก LINE ID Token (หน้าเว็บ) หรือ x-internal-key (เซิร์ฟเวอร์) ก่อน แล้ว RLS กรองให้เห็นเฉพาะของตัวเอง
// เดิมห่อ withRls(decrypt(req.query.id)) เชื่อ id ที่ผู้โจมตีสร้างเอง (กุญแจ CryptoJS หลุดไป client) ดึงข้อมูลคนอื่นได้
export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const id = decrypt(req.query.id as string);
                if (id) {
                    // ASVS 2.2.1: ตรวจด้วย positiveInt (เดิม parseInt รับ "1abc" เป็น 1)
                    const userId = positiveInt(id);
                    if (userId) {
                        const user = await prisma.takecareperson.findFirst({
                            where: {
                                users_id: userId,
                                takecare_status: 1,
                            },
                            // ASVS 15.3.1: ผู้เรียก (หน้าเว็บ 7 หน้า เช่น pages/elderly_registration.tsx pages/userinfo/puserinfo.tsx
                            // · api/webhook.ts api/lineProfile.ts แล้ว utils/apiLineReply.ts) อ่านแค่ takecare_id + 16 ช่องในฟอร์ม
                            // ไม่อ่าน users_id takecare_status gender_id_ref marry_id_ref (ชื่อเพศ/สถานะสมรสที่หน้าเว็บแสดงมาจาก master/getGender getMarry)
                            // (เดิมคืนทั้งแถว 19 ช่อง + gender_describe + marry_describe)
                            select: {
                                takecare_id: true,
                                takecare_fname: true,
                                takecare_sname: true,
                                takecare_birthday: true,
                                gender_id: true,
                                marry_id: true,
                                takecare_number: true,
                                takecare_moo: true,
                                takecare_road: true,
                                takecare_tubon: true,
                                takecare_amphur: true,
                                takecare_province: true,
                                takecare_postcode: true,
                                takecare_tel1: true,
                                takecare_tel_home: true,
                                takecare_disease: true,
                                takecare_drug: true,
                            },
                        })
                        return res.status(200).json({ message: 'success', data: user })
                    }
                }
                return res.status(400).json({ message: 'error', data: 'ไม่สามารถดึงข้อมูลได้' })

            } catch (error) {
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['GET'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
