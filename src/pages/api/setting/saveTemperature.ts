import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { nestedValueProblem } from '@/lib/inputTypes'
import { fieldProblem, TEMPERATURE_SETTING_RULES } from '@/lib/inputRules'

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
                    const fieldError = nestedValueProblem(body) ?? fieldProblem(body, TEMPERATURE_SETTING_RULES)
                    if (fieldError) return res.status(400).json({ message: 'error', data: fieldError })
                    // รหัสทุกช่องตรวจแล้วด้วย TEMPERATURE_SETTING_RULES (idRequired idOptional) จึงไม่ตรวจ Number() ซ้ำ

                    if (body.setting_id) {
                        await prisma.temperature_settings.update({
                            where: { setting_id: Number(body.setting_id) },
                            data: { max_temperature: Number(body.max_temperature) },
                        });
                        return res.status(200).json({ message: 'success' });
                    }
                    const existing = await prisma.temperature_settings.findFirst({
                        where: {
                            users_id: Number(body.users_id),
                            takecare_id: Number(body.takecare_id),
                        },
                    });
                    if (existing) {
                        await prisma.temperature_settings.update({
                            where: {
                                setting_id: existing.setting_id,
                            },
                            data: {
                                max_temperature: Number(body.max_temperature),
                            },
                        });
                        return res.status(200).json({ message: 'success', id: existing.setting_id });
                    } else {
                        const createdTemperature = await prisma.temperature_settings.create({
                            data: {
                                takecare_id: Number(body.takecare_id),
                                users_id: Number(body.users_id),
                                max_temperature: Number(body.max_temperature),
                            }
                        })
                        return res.status(200).json({ message: 'success', id: createdTemperature.setting_id })
                    }
                }
                return res.status(400).json({ message: 'error', data: 'error' })
            } catch (error) {
                console.error("Error in temperature settings API:", error)
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['POST'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
