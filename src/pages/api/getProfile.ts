
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserProfile } from '@/utils/apiLineReply';
import { withLineOwner } from '@/lib/withLineOwner';
type Data = {
	message: string;
	data?: any;
}
export default withLineOwner(handle)

async function handle(req: NextApiRequest, res: NextApiResponse) {
	if (req.method === 'GET') {
		const id = req.query.id
		const profile = await getUserProfile(id as string)
		// ASVS 15.3.1: ผู้เรียก (pages/registration.tsx pages/elderly_registration.tsx) อ่านแค่ displayName (เดิมคืนโปรไฟล์ LINE ทั้งก้อน)
		return res.status(200).json({ message: 'success', data: profile ? { displayName: profile.displayName } : null })
	} else {
		res.setHeader('Allow', ['GET'])
		res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
	}

}
