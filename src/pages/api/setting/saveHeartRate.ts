import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { nestedValueProblem } from '@/lib/inputTypes'
import { fieldProblem, HEARTRATE_SETTING_RULES } from '@/lib/inputRules'

type Data = {
    message: string;
    data?: any;
}

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'POST') {
            try {
                if (req.body) {
                    const body = req.body
                    // ASVS 1.2.4 2.2.2: ทุกช่องเป็นค่าเดี่ยวและตรงกฎ ตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
                    const fieldError = nestedValueProblem(body) ?? fieldProblem(body, HEARTRATE_SETTING_RULES)
                    if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })
                    // รหัสทุกช่องตรวจแล้วด้วย HEARTRATE_SETTING_RULES (idRequired idOptional) จึงไม่ตรวจ Number() ซ้ำ

                    const min_bpm_default = 0

                    if (body.id) {
                        await prisma.heartrate_settings.update({
                            where: { id: Number(body.id) },
                            data: {
                                max_bpm: Number(body.max_bpm),
                                min_bpm: min_bpm_default
                            },
                        });
                        return res.status(200).json({ message: 'success' });
                    }

                    const existing = await prisma.heartrate_settings.findFirst({
                        where: {
                            users_id: Number(body.users_id),
                            takecare_id: Number(body.takecare_id),
                        },
                    });

                    if (existing) {
                        await prisma.heartrate_settings.update({
                            where: { id: existing.id },
                            data: {
                                max_bpm: Number(body.max_bpm),
                                min_bpm: min_bpm_default
                            },
                        });
                        return res.status(200).json({ message: 'success', id: existing.id });
                    } else {
                        const createdHeartRate = await prisma.heartrate_settings.create({
                            data: {
                                takecare_id: Number(body.takecare_id),
                                users_id: Number(body.users_id),
                                max_bpm: Number(body.max_bpm),
                                min_bpm: min_bpm_default
                            }
                        });
                        return res.status(200).json({ message: 'success', id: createdHeartRate.id });
                    }
                }
                return res.status(400).json({ message: 'error', data: 'error' });
            } catch (error) {
                console.error("Error in heartrate settings API:", error);
                return res.status(400).json({ message: 'error', data: error });
            }
        } else {
            res.setHeader('Allow', ['POST']);
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
        }
    }
);
