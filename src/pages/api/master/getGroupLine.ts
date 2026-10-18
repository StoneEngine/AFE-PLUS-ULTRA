
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'
import { withInternalKey } from '@/lib/withInternalKey'
import { nestedValueProblem } from '@/lib/inputTypes'

// มีแค่เซิร์ฟเวอร์เรียก (webhook, lineProfile) — คนนอกอ่าน/สร้างกลุ่ม LINE ตรงๆ ไม่ได้
export default withInternalKey(handle)

// ASVS 2.2.1: group_line_id group_name ลงคอลัมน์ VarChar(100) (prisma/schema.prisma model groupLine)
// ต้องเป็นข้อความไม่เกิน 100 ตัวอักษร (เดิมตรวจแค่ไม่ว่าง และ GET ที่ไม่ส่ง group_line_id ได้กลุ่มแรกที่เปิดอยู่)
const GROUP_TEXT_MAX = 100
const isGroupLineId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= GROUP_TEXT_MAX

async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
            const shape = nestedValueProblem(req.body)
            if (shape) return res.status(400).json({ message: 'error', data: shape })
            const group_line_id = req.body.group_line_id
            const group_name = req.body.group_name || ''
            if(!isGroupLineId(group_line_id)){
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ group_line_id POST' })
            }
            if(typeof group_name !== 'string' || group_name.length > GROUP_TEXT_MAX){
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ group_name POST' })
            }
            const createGroupLine = await prisma.groupLine.create({
                data: {
                    group_line_id: group_line_id,
                    group_name   : group_name,
                    group_status : 1
                    
                }
            })

            return res.status(200).json({ message: 'success', id: createGroupLine.group_id })
        } catch (error) {
            return res.status(400).json({ message: 'error', data: error })
        }

    }else if(req.method === 'GET'){
        try {
            const group_line_id = req.query.group_line_id
            if(!isGroupLineId(group_line_id)){
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ group_line_id GET' })
            }
            const groupLine = await prisma.groupLine.findFirst({
                where: {
                    group_line_id: group_line_id as string,
                    group_status : 1
                },
                // ASVS 15.3.1: ผู้เรียก (api/webhook.ts api/lineProfile.ts getGroupLine) เช็คแค่ว่ามีแถวไหม ไม่อ่านช่องใด (เดิมคืนทั้งแถว 4 ช่อง)
                select: { group_id: true },
            })

            return res.status(200).json({ message: 'success', data: groupLine })
        } catch (error) {
            return res.status(400).json({ message: 'error', data: error })
        }
    } else {
        res.setHeader('Allow', ['POST','GET'])
        res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
    }

}
