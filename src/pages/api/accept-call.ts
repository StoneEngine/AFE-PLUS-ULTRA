import type { NextApiRequest, NextApiResponse } from 'next';
import { postbackAccept } from '@/lib/lineFunction';
import { verifyLineToken } from '@/lib/verifyLineToken';
import { nestedValueProblem } from '@/lib/inputTypes';
import { fieldProblem, ACCEPT_CALL_RULES } from '@/lib/inputRules';

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

        // 2–4. ASVS 9.1.1 9.1.2 9.1.3 9.2.1: ตรวจด้วย verifyLineToken ตัวเดียวกับทุก API
        // (ตรวจลายเซ็น ES256 ในแอป กุญแจจาก LINE ตาม kid ตรวจ iss aud exp nbf แล้วถาม LINE ซ้ำ) แทนการส่งให้ LINE ตรวจอย่างเดียว
        const realOperatorLineId = await verifyLineToken(idToken);
        if (!realOperatorLineId) {
            return res.status(401).json({ message: 'Unauthorized: Fake or expired token' });
        }

        // 5. รับค่าอื่นๆ จาก Body ตามปกติ (สังเกตว่าเราไม่รับ operatorLineId จาก Body อีกต่อไป)
        const { extenId, takecareId, userLineId, groupId, tel } = req.body || {};

        if (!extenId || !takecareId || !userLineId || !groupId || !tel) {
            return res.status(400).json({ message: 'missing params' });
        }
        // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
        const fieldError = nestedValueProblem(req.body) ?? fieldProblem(req.body, ACCEPT_CALL_RULES);
        if (fieldError) {
            return res.status(400).json({ message: fieldError });
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