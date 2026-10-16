import crypto from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<any> | any;

const readRawBody = (req: NextApiRequest): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });

/**
 * ห่อ webhook ของ LINE — รับเฉพาะคำขอที่ LINE ส่งมาจริง
 *
 * LINE เซ็น body ด้วย HMAC-SHA256 + channel secret ของ channel Messaging API แล้วส่งมาใน `x-line-signature`
 * (เอกสาร LINE "Verify webhook signature") — คำนวณซ้ำจาก body ดิบ ถ้าไม่ตรง = คนนอกปลอมเหตุการณ์ → 401
 *
 * ไฟล์ที่ใช้ต้อง `export const config = { api: { bodyParser: false } }`
 * เพราะต้องได้ body ดิบก่อน Next.js แปลงเป็น JSON (แปลงแล้วแปลงกลับ byte เปลี่ยน ลายเซ็นไม่ตรง)
 */
export function withLineSignature(handler: Handler) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const secret = process.env.LINE_CHANNEL_SECRET;
        if (!secret) {
            console.error('withLineSignature: ไม่ได้ตั้ง LINE_CHANNEL_SECRET');
            return res.status(500).json({ message: 'Server misconfigured' });
        }

        const raw = await readRawBody(req);
        const signature = req.headers['x-line-signature'];
        const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
        const valid =
            typeof signature === 'string' &&
            signature.length === expected.length &&
            crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        if (!valid) {
            return res.status(401).json({ message: 'Unauthorized: Invalid LINE signature' });
        }

        try {
            req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        } catch {
            return res.status(400).json({ message: 'Invalid JSON body' });
        }
        return handler(req, res);
    };
}
