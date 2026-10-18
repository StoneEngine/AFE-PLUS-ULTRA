import { NextApiRequest, NextApiResponse } from 'next'
import { withRls } from '@/lib/withRls'
import { replyNotificationSOS } from '@/utils/apiLineReply'
import { positiveInt } from '@/lib/inputTypes'

type Data = {
	message: string;
	data?: any;
}

export default withRls(
	// ASVS 2.2.1: ส่งค่าดิบให้ withRls ตรวจด้วย positiveInt (เดิม Number() รับ "1e0" " 1" "0x1" true เป็นผู้ใช้ 1 ที่ด่านนี้)
	req => req.body?.uid,
	async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
		if (req.method === 'POST') {
			if (req.headers['content-type'] !== 'application/json') {
				return res.status(400).json({ message: 'error', error: "Content-Type must be application/json" });
			}

			const body = req.body;
			const { uid } = req.body;
			console.log("🔍 Checking UID:", uid);
			if (!body.uid) {
				return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ uid' });
			}

			// ASVS 2.2.1: uid ต้องเป็นจำนวนเต็มบวกแบบ allowlist (เดิม isNaN(Number()) รับ "0x1" "1e0" " 1" เป็นผู้ใช้ 1)
			if (!positiveInt(body.uid)) {
				return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ uid ไม่ใช่ตัวเลข' });
			}

			// นาฬิกาส่ง PIN ที่เก็บไว้ตอนล็อกอินมาด้วย — ตรวจคู่กับ uid แบบเดียวกับ watchconnphone
			// ASVS 2.2.2: ตรวจรูปแบบที่เซิร์ฟเวอร์ ต้องเป็นข้อความตัวเลขล้วน (เดิม isNaN(Number()) รับ "0x0" " 0" "0e5" ได้)
			// ไม่บังคับ 4 หลัก เพราะนาฬิกาที่จับคู่ไปแล้วเก็บ PIN ตามที่พิมพ์ตอนล็อกอิน (login.kt:81) ซึ่งอาจไม่ครบ 4 หลัก
			// ถ้าบังคับ 4 หลัก นาฬิกาเหล่านั้นจะกด SOS แล้วได้ HTTP 400 (ตามข้อเสนอในตรวจทาน-แผนเพิ่มร้อยละ.md ขั้น 2)
			// ASVS 2.2.1: ยาว 1–4 หลัก (เดิม ^\d+$ ไม่จำกัดความยาว "99999999999" เกินช่วง Int ทำให้ Prisma ล้ม HTTP 500)
			if (typeof body.pin !== 'string' || !/^\d{1,4}$/.test(body.pin)) {
				return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ pin หรือ pin ไม่ใช่ตัวเลข 1–4 หลัก' });
			}

			try {
				const user = await prisma.users.findFirst({
					where: {
						users_id: Number(body.uid),
						users_pin: Number(body.pin),
					}
				});

				const takecareperson = await prisma.takecareperson.findFirst({
					where: {
						users_id: user?.users_id,
						takecare_status: 1
					}
				});

				if (user && takecareperson) {
					const message = `⚠️ มีการกด SOS จากภายในจากผู้มีภาวะพึ่งพิง`;

					const replyToken = user.users_line_id || '';

					await replyNotificationSOS({ replyToken, message });

					return res.status(200).json({ message: 'success' });
				} else {
					return res.status(400).json({ message: 'error', data: 'ไม่พบข้อมูล' });
				}
			} catch (error) {
				console.error("Error:", error);
				return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการประมวลผล' });
			}
		} else {
			res.setHeader('Allow', ['POST']);
			res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
		}
	}
);
