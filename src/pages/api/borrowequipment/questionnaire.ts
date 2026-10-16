
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'
import { decrypt } from '@/utils/helpers'
import { withLineUser } from '@/lib/withLineUser'

// ถอด borrow_id จาก id ที่เข้ารหัส (ใช้ทั้งใน isOwner และ handle)
function borrowIdFromReq(req: NextApiRequest): number | null {
    try {
        const id = decrypt(req.query.id as string)
        const v = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id as string, 10)
        return isNaN(v) ? null : v
    } catch {
        return null
    }
}

// ด่าน: ต้องล็อกอิน LINE และเป็นเจ้าของรายการยืม (borrow_user_id) ของ borrow_id นั้น
// เดิมไม่มีด่าน + เชื่อ id ที่เข้ารหัส (กุญแจ CryptoJS หลุดไป client) ดึงรายการยืมของคนอื่นได้
async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            // const id = req.query.id
            console.log('req.query.id ', req.query.id )
            const id = decrypt(req.query.id as string);
            console.log("🚀 ~ handle ~ id:", id)
            if(id){
                const borrow_id = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
                if (!isNaN(borrow_id)) {
                    const response = await prisma.borrowequipment.findFirst({
                        where: {
                            borrow_id: borrow_id
                        }
                    })
                    return res.status(200).json({ message: 'success', data: response })
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

export default withLineUser(handle, async (req, usersId) => {
    const borrow_id = borrowIdFromReq(req)
    if (!borrow_id) return false
    const row = await prisma.borrowequipment.findFirst({
        where: { borrow_id },
        select: { borrow_user_id: true },
    })
    return row?.borrow_user_id === usersId
})
