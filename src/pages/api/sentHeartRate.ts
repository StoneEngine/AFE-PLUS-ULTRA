import { NextApiRequest, NextApiResponse } from 'next';
import { withRls } from '@/lib/withRls';
import _ from 'lodash';
import { replyNotificationPostbackHeart } from '@/utils/apiLineReply';
import moment from 'moment';

type Data = {
    message: string;
    data?: any;
};

export default withRls(
    req => Number(req.body?.uId),
    async function handle(req: NextApiRequest, res: NextApiResponse<Data>, prisma) {
        if (req.method === 'PUT' || req.method === 'POST') {
            try {
                const body = req.body;
                if (!body.uId || !body.takecare_id || !body.bpm) {
                    return res.status(400).json({ message: 'error', data: 'ไม่พบพารามิเตอร์ uId, takecare_id, bpm' });
                }

                if (_.isNaN(Number(body.uId)) || _.isNaN(Number(body.takecare_id)) || _.isNaN(Number(body.status))) {
                    return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ uId, takecare_id, status ไม่ใช่ตัวเลข' });
                }

                const user = await prisma.users.findFirst({
                    where: { users_id: Number(body.uId) },
                    include: {
                        users_status_id: { select: { status_name: true } }
                    }
                });

                const takecareperson = await prisma.takecareperson.findFirst({
                    where: {
                        takecare_id: Number(body.takecare_id),
                        takecare_status: 1
                    }
                });

                if (!user || !takecareperson) {
                    return res.status(200).json({ message: 'error', data: 'ไม่พบข้อมูล user หรือ takecareperson' });
                }

                const settingHR = await prisma.heartrate_settings.findFirst({
                    where: {
                        takecare_id: takecareperson.takecare_id,
                        users_id: user.users_id
                    }
                });

                const bpmValue = Number(body.bpm);
                let calculatedStatus = 0;

                if (settingHR && bpmValue > settingHR.max_bpm) {
                    calculatedStatus = 1;
                } else {
                    calculatedStatus = 0;
                }

                const status = calculatedStatus;

                const lastHR = await prisma.heartrate_records.findFirst({
                    where: {
                        users_id: user.users_id,
                        takecare_id: takecareperson.takecare_id
                    },
                    orderBy: {
                        heartrate_id: 'desc'
                    }
                });

                let shouldSendNotification = false;

                if (status === 1) {
                    if (!lastHR || lastHR.noti_status !== 1) {
                        shouldSendNotification = true;
                    }
                }

                if (shouldSendNotification) {
                    const message = `คุณ ${takecareperson.takecare_fname} ${takecareperson.takecare_sname}\nชีพจรเกินค่าที่กำหนด: ${bpmValue} bpm`;
                    const replyToken = user.users_line_id || '';
                    if (replyToken) {
                        await replyNotificationPostbackHeart({
                            replyToken,
                            userId: user.users_id,
                            takecarepersonId: takecareperson.takecare_id,
                            type: 'heartrate',
                            message
                        });
                    }
                }

                const recordData: any = {
                    bpm: bpmValue,
                    record_date: new Date(),
                    status: status
                };

                if (shouldSendNotification) {
                    recordData.noti_time = new Date();
                    recordData.noti_status = 1;
                } else if (status === 0) {
                    recordData.noti_status = 0;
                    recordData.noti_time = null;
                }

                if (lastHR) {
                    const updateData: any = { ...recordData };

                    if (!shouldSendNotification && status === 1) {
                        delete updateData.noti_time;
                        delete updateData.noti_status;
                    }

                    await prisma.heartrate_records.update({
                        where: { heartrate_id: lastHR.heartrate_id },
                        data: updateData
                    });
                } else {
                    await prisma.heartrate_records.create({
                        data: {
                            users_id: user.users_id,
                            takecare_id: takecareperson.takecare_id,
                            ...recordData
                        }
                    });
                }

                return res.status(200).json({ message: 'success', data: 'บันทึกข้อมูลเรียบร้อย' });

            } catch (error) {
                console.error("🚀 ~ API /sentHeartRate error:", error);
                return res.status(400).json({ message: 'error', data: error });
            }
        } else {
            res.setHeader('Allow', ['PUT', 'POST']);
            return res.status(405).json({ message: 'error', data: `วิธี ${req.method} ไม่อนุญาต` });
        }
    }
);
