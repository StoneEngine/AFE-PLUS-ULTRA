import type { NextApiRequest, NextApiResponse } from 'next';
import { postbackAccept } from '@/lib/lineFunction';

type Data = {
    message: string;
    tel?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        // 1. ดักจับและตรวจสอบ Token จาก Header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
        }
        const idToken = authHeader.split(' ')[1]; // ดึง Token ออกมา

        // 2. นำ ID Token ไป Verify กับเซิร์ฟเวอร์ของ LINE 
        const verifyParams = new URLSearchParams();
        verifyParams.append('id_token', idToken);
        verifyParams.append('client_id', process.env.LINE_LOGIN_CHANNEL_ID || 'ใส่_CHANNEL_ID_ของ_LINE_LOGIN_ที่นี่');

        const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyParams.toString(),
        });

        const verifyData = await verifyResponse.json();

        // 3. เตะออกทันทีถ้า Token ปลอมหรือหมดอายุ
        if (!verifyResponse.ok || verifyData.error) {
            return res.status(401).json({ message: 'Unauthorized: Fake or expired token' });
        }

        // 4. ดึง LINE ID ที่แท้จริงจาก Token (ฟิลด์ sub คือ User ID ที่ LINE ยืนยันแล้ว)
        const realOperatorLineId = verifyData.sub;

        // 5. รับค่าอื่นๆ จาก Body ตามปกติ (สังเกตว่าเราไม่รับ operatorLineId จาก Body อีกต่อไป)
        const { extenId, takecareId, userLineId, groupId, tel } = req.body || {};

        if (!extenId || !takecareId || !userLineId || !groupId || !tel) {
            return res.status(400).json({ message: 'missing params' });
        }

        // 6. ใช้ realOperatorLineId ที่ Verify แล้วส่งลงฐานข้อมูล
        const acceptedReplyToken = await postbackAccept({
            type: 'accept',
            acceptMode: 'accept_call',
            extenId: Number(extenId),
            takecareId: Number(takecareId),
            userLineId: String(userLineId),
            groupId: String(groupId),
            userIdAccept: String(realOperatorLineId), // ✅ ปลอดภัย 100% ไม่มีใครสวมรอยได้
        });

        if (!acceptedReplyToken) {
            return res.status(409).json({ message: 'case is not available' });
        }

        return res.status(200).json({
            message: 'success',
            tel: String(tel),
        });
    } catch (error) {
        console.error('accept-call error:', error);
        return res.status(500).json({ message: 'error' });
    }
}