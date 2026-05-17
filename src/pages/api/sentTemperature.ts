import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withUserContext } from '@/lib/withUserContext';
import _ from 'lodash';
import { replyNotificationPostbackTemp } from '@/utils/apiLineReply';
import moment from 'moment';

type Data = {
    message: string;
    data?: any;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse<Data>) {
    if (req.method === 'PUT' || req.method === 'POST') {
        try {
            const body = req.body;

            if (!body.uId || !body.takecare_id || !body.temperature_value) {
                return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ uId, takecare_id, temperature_value' });
            }

            if (_.isNaN(Number(body.uId)) || _.isNaN(Number(body.takecare_id)) || _.isNaN(Number(body.status))) {
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ uId, takecare_id, status ไม่ใช่ตัวเลข' });
            }

            const userId = Number(body.uId);
            const takecareId = Number(body.takecare_id);
            const temperatureValue = Number(body.temperature_value);

            const ctxResult = await withUserContext(userId, async (tx) => {
                const user = await tx.users.findFirst({
                    where: { users_id: userId },
                    include: {
                        users_status_id: {
                            select: { status_name: true }
                        }
                    }
                });

                const takecareperson = await tx.takecareperson.findFirst({
                    where: {
                        takecare_id: takecareId,
                        takecare_status: 1
                    }
                });

                if (!user || !takecareperson) {
                    return { ok: false as const, reason: 'ไม่พบข้อมูล user หรือ takecareperson' };
                }

                const settingTemp = await tx.temperature_settings.findFirst({
                    where: {
                        takecare_id: takecareperson.takecare_id,
                        users_id: user.users_id
                    }
                });

                let calculatedStatus = Number(body.status);
                if (settingTemp && temperatureValue > settingTemp.max_temperature) {
                    calculatedStatus = 1;
                } else {
                    calculatedStatus = 0;
                }
                const status = calculatedStatus;

                const temp = await tx.temperature_records.findFirst({
                    where: {
                        users_id: user.users_id,
                        takecare_id: takecareperson.takecare_id
                    },
                    orderBy: {
                        noti_time: 'desc'
                    }
                });

                let noti_time: Date | null = temp?.noti_time ?? null;
                let noti_status: number | null = temp?.noti_status ?? 0;

                const minutesSinceLastNoti = temp?.noti_time
                    ? moment().diff(moment(temp.noti_time), 'minutes')
                    : null;

                const shouldNotify =
                    status === 1 && (
                        !temp ||
                        temp.noti_status !== 1 ||
                        !temp.noti_time ||
                        (minutesSinceLastNoti !== null && minutesSinceLastNoti >= 5)
                    );

                if (shouldNotify) {
                    noti_status = 1;
                    noti_time = new Date();
                }

                if (status === 0) {
                    noti_status = 0;
                    noti_time = null;
                }

                if (temp) {
                    await tx.temperature_records.update({
                        where: { temperature_id: temp.temperature_id },
                        data: {
                            temperature_value: temperatureValue,
                            record_date: new Date(),
                            status: status,
                            noti_time: noti_time,
                            noti_status: noti_status
                        }
                    });
                } else {
                    await tx.temperature_records.create({
                        data: {
                            users_id: user.users_id,
                            takecare_id: takecareperson.takecare_id,
                            temperature_value: temperatureValue,
                            record_date: new Date(),
                            status: status,
                            noti_time: noti_time,
                            noti_status: noti_status
                        }
                    });
                }

                return {
                    ok: true as const,
                    user,
                    takecareperson,
                    shouldNotify,
                    status,
                    minutesSinceLastNoti
                };
            });

            if (!ctxResult.ok) {
                return res.status(200).json({ message: 'error', data: ctxResult.reason });
            }

            const { user, takecareperson, shouldNotify, status, minutesSinceLastNoti } = ctxResult;

            if (shouldNotify) {
                const message = `คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname} \nอุณหภูมิร่างกายเกินค่าที่กำหนด`;
                const replyToken = user.users_line_id || '';
                if (replyToken) {
                    await replyNotificationPostbackTemp({
                        replyToken,
                        userId: user.users_id,
                        takecarepersonId: takecareperson.takecare_id,
                        type: 'temperature',
                        message
                    });
                }
                console.log('Temperature notification sent');
            } else if (status === 1) {
                console.log(`Skip temperature notification: still in cooldown (${minutesSinceLastNoti ?? 0} minute(s))`);
            } else if (status === 0) {
                console.log("อุณหภูมิอยู่ในระดับปกติ");
            }

            return res.status(200).json({ message: 'success', data: 'บันทึกข้อมูลเรียบร้อย' });

        } catch (error) {
            console.error("🚀 ~ API /temperature error:", error);
            return res.status(400).json({ message: 'error', data: error });
        }
    } else {
        res.setHeader('Allow', ['PUT', 'POST']);
        return res.status(405).json({ message: 'error', data: `วิธี ${req.method} ไม่อนุญาต` });
    }
}
