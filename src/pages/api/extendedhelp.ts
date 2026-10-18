import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'

import { decrypt } from '@/utils/helpers'
import { withInternalKey } from '@/lib/withInternalKey'
import { nestedValueProblem, positiveInt } from '@/lib/inputTypes'
type Data = {
    message: string;
    data?: any;
}
// มีแค่เซิร์ฟเวอร์เรียก (lineFunction ผ่าน listAPI) — คนนอกอ่าน/สร้าง/แก้เคสขอความช่วยเหลือตรงๆ ไม่ได้
export default withInternalKey(handle)

// ASVS 2.2.1: รหัสทุกช่องตรวจด้วย positiveInt (เดิม Number() แล้วตรวจแค่ NaN รับ "1e0" และค่าว่างกลายเป็น 0)
// ASVS 2.2.1: พิกัดลงคอลัมน์ exten_latitude exten_longitude VarChar(255) ต้องเป็นข้อความไม่ว่างไม่เกิน 255 ตัวอักษร
// (ผู้เรียก lib/lineFunction.ts ส่ง safez_latitude safez_longitude ของ safezone ซึ่งเป็นข้อความ VarChar(255) อยู่แล้ว)
const COORD_TEXT_MAX = 255
const isCoordText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= COORD_TEXT_MAX

async function handle(req: NextApiRequest, res: NextApiResponse) {
    if(req.method === 'GET'){
        try {
            const query      = req.query

            if(query.extenId !== undefined){
                const extenId = positiveInt(query.extenId)
                if(!extenId){
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ extenId ไม่ใช่ตัวเลข' })
                }
                const extendedhelp = await prisma.extendedhelp.findFirst({
                    where: {
                        exten_id           : extenId
                    },
                    // ASVS 15.3.1: ผู้เรียก (lib/listAPI.ts getExtendedHelpById แล้ว lib/lineFunction.ts postbackAccept postbackClose) อ่านแค่ 5 ช่องนี้ (เดิมคืนทั้งแถว 10 ช่อง)
                    select: {
                        user_id: true,
                        exten_received_date: true,
                        exten_received_user_id: true,
                        exted_closed_date: true,
                        exten_closed_user_id: true,
                    },
                })
                return res.status(200).json({ message: 'success', data: extendedhelp })
            }

            const takecareId = positiveInt(query.takecareId)
            const usersId    = positiveInt(query.usersId)
            if(!takecareId || !usersId){
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ takecareId หรือ usersId ไม่ใช่ตัวเลข' })
            }

            const extendedhelp = await prisma.extendedhelp.findFirst({
                where: {
                    takecare_id           : takecareId,
                    user_id               : usersId,
                    exted_closed_date     : null,
                },
                orderBy: {
                    exten_date: 'desc'
                },
                // ASVS 15.3.1: ทางนี้ไม่มีผู้เรียก (lib/listAPI.ts getExtendedHelp ไม่มีใครเรียก · lineFunction ค้นเคสค้างด้วย prisma ตรง)
                // คืนแค่รหัสเคสพอให้รู้ว่ามีเคสค้างไหม (เดิมคืนทั้งแถว 10 ช่อง)
                select: { exten_id: true },
            })
            return res.status(200).json({ message: 'success', data: extendedhelp })
        } catch (error) {
            return res.status(400).json({ message: 'error', data: error })
        }
    }else if (req.method === 'POST') {
        try {

            if (req.body) {
                const body       = req.body
                // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
                const shape = nestedValueProblem(body)
                if (shape) return res.status(400).json({ message: 'error', data: shape })
                const takecareId = positiveInt(body.takecareId)
                const usersId    = positiveInt(body.usersId)
                const typeStatus = body.typeStatus
                const safezLatitude = body.safezLatitude
                const safezLongitude = body.safezLongitude
                if(typeStatus === 'save'){
                    if(!takecareId || !usersId){
                        return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ takecareId หรือ usersId ไม่ใช่ตัวเลข' })
                    }
                    if(!isCoordText(safezLatitude) || !isCoordText(safezLongitude)){
                        return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ safezLatitude หรือ safezLongitude ต้องเป็นข้อความไม่ว่าง ไม่เกิน 255 ตัวอักษร' })
                    }

                      const createdextendedhelp =  await prisma.extendedhelp.create({
                            data: {
                                takecare_id    : takecareId,
                                user_id        : usersId,
                                exten_date     : new Date(),
                                exten_latitude : safezLatitude,
                                exten_longitude: safezLongitude,
                            },
                        })
                        return res.status(200).json({ message: 'success', id: createdextendedhelp.exten_id })
                }else{
                    return res.status(400).json({ message: 'error', data: 'ไม่สามารบันทึกได้' })
                }
                
            }
            return res.status(400).json({ message: 'error', data: 'error' })
        } catch (error) {
            return res.status(400).json({ message: 'error', data: error })
        }

    }if(req.method === 'PUT'){
        try {
            if (req.body) {
                const body = req.body
                const extenId = positiveInt(body.extenId)
                const typeStatus = body.typeStatus
                const extenReceivedUserId = positiveInt(body.extenReceivedUserId)
                const extenClosedUserId = positiveInt(body.extenClosedUserId)
                if(!extenId || !typeStatus){
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ ไม่ตรงกัน' })
                }
                let params = {}
                if(typeStatus === 'sendAgain'){
                    params = {
                        exten_date: new Date(),
                    }
                }else if(typeStatus === 'received'){
                    if(!extenReceivedUserId){
                        return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ extenReceivedUserId หรือไม่ใช่ตัวเลข' })
                    }
                    params = {
                        exten_received_user_id: extenReceivedUserId,
                        exten_received_date: new Date(),
                    }
                }else if(typeStatus === 'close'){
                    if(!extenClosedUserId){
                        return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ extenClosedUserId หรือไม่ใช่ตัวเลข' })
                    }
                    params = {
                        exten_closed_user_id: extenClosedUserId,
                        exted_closed_date: new Date(),
                    }
                }

                const updatedextendedhelp = await prisma.extendedhelp.update({
                    where: {
                        exten_id: extenId
                    },
                    data: params,
                })
                // ASVS 15.3.1: ผู้เรียก (lib/listAPI.ts updateExtendedHelp จาก lib/lineFunction.ts) แค่ await ไม่อ่านค่า
                // คืนแค่รหัสเคสเพื่อให้ listAPI.updateExtendedHelp ยังได้ค่าที่ไม่ว่าง (เดิมคืนแถวที่แก้แล้วทั้งแถว 10 ช่อง)
                return res.status(200).json({ message: 'success', data: { exten_id: updatedextendedhelp.exten_id } })
            }
            return res.status(400).json({ message: 'error', data: 'error' })
        } catch (error) {
            return res.status(400).json({ message: 'error', data: error })
        }

    } else {
        res.setHeader('Allow', ['POST','GET'])
        res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
    }

}