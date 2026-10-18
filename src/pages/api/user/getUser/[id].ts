
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'
import { withLineOwner } from '@/lib/withLineOwner'

export default withLineOwner(handle)

async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            const id_line = req.query.id
            const user = await prisma.users.findFirst({
                where: {
                    users_line_id: id_line as string,
                    users_status_active: 1,
                },
                // ASVS 15.3.1: คืนเฉพาะช่องที่ผู้เรียกใช้ (หน้าเว็บ + การ์ด LINE ใน apiLineReply ผ่าน listAPI.getUser)
                // ไม่คืน users_passwd (ค่า hash รหัสผ่าน) users_token users_user — ค้นทั้ง src แล้วไม่มีผู้เรียกอ่าน 3 ช่องนี้
                // คง users_pin ไว้ เพราะการ์ดจับคู่นาฬิกาใน LINE (replyConnection) และเมนูข้อมูลผู้ใช้ (replyUserData) แสดง PIN และ pages/registration.tsx อ่าน
                // ไม่คืน users_status_onweb status_id users_alert_battery users_status_active users_related_borrow — ค้นหน้าเว็บ + apiLineReply apiLineGroup แล้วไม่มีผู้เรียกอ่าน (apiLineGroup.ts มีแค่ใน type)
                // ทำตาม OWASP API Security Top 10 2023 หัวข้อ API3 ("cherry-pick specific object properties you specifically want to return.")
                select: {
                    users_id: true,
                    users_line_id: true,
                    users_fname: true,
                    users_sname: true,
                    users_number: true,
                    users_moo: true,
                    users_road: true,
                    users_tubon: true,
                    users_amphur: true,
                    users_province: true,
                    users_postcode: true,
                    users_tel1: true,
                    users_tel_home: true,
                    users_pin: true,
                    users_status_id: {
                        select: {
                            status_name: true
                        }
                    },
                },
            })

            return res.status(200).json({ message: 'success', data: user })
        } catch (error) {
            return res.status(500).json({ message: 'error', data: error })
        }

    } else {
        res.setHeader('Allow', ['GET'])
        res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
    }

}
