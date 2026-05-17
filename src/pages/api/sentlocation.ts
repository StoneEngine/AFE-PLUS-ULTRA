import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withUserContext } from '@/lib/withUserContext';
import { getFlexTemplate, pushFlexMessage } from '@/utils/apiLineReply';
import { replySafezoneBackMessage } from '@/utils/apiLineGroup';
import moment from 'moment';

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  // รองรับทั้ง POST และ PUT
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const { uId, takecare_id, distance, latitude, longitude, battery } = req.body;

      // ตรวจสอบพารามิเตอร์ (ปล่อยให้ 0 ผ่านได้)
      if (
        uId === undefined || takecare_id === undefined ||
        distance === undefined || latitude === undefined ||
        longitude === undefined || battery === undefined
      ) {
        return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ไม่ครบถ้วน' });
      }

      const userIdNum = Number(uId);
      const takecareIdNum = Number(takecare_id);

      const ctxResult = await withUserContext(userIdNum, async (tx) => {
        const safezone = await tx.safezone.findFirst({
          where: {
            takecare_id: takecareIdNum,
            users_id: userIdNum,
          },
        });

        if (!safezone) {
          return { ok: false as const, reason: 'ไม่พบข้อมูล Safezone' };
        }

        const r1 = safezone.safez_radiuslv1;
        const r2 = safezone.safez_radiuslv2;
        const safezoneThreshold = r2 * 0.8;
        const distNum = Number(distance);

        let calculatedStatus = 0;
        if (distNum <= r1) {
          calculatedStatus = 0;
        } else if (distNum > r1 && distNum < safezoneThreshold) {
          calculatedStatus = 1;
        } else if (distNum >= safezoneThreshold && distNum <= r2) {
          calculatedStatus = 3;
        } else if (distNum > r2) {
          calculatedStatus = 2;
        }

        const latest = await tx.location.findFirst({
          where: {
            users_id: userIdNum,
            takecare_id: takecareIdNum,
          },
          orderBy: { locat_timestamp: 'desc' },
        });

        const dataPayload = {
          users_id: userIdNum,
          takecare_id: takecareIdNum,
          locat_timestamp: new Date(),
          locat_latitude: String(latitude),
          locat_longitude: String(longitude),
          locat_status: calculatedStatus,
          locat_distance: Number(distance),
          locat_battery: Number(battery),
          locat_noti_time: new Date(),
          locat_noti_status: 1,
        };

        const previousStatus = latest ? Number(latest.locat_status) : null;

        let savedLocation;
        if (latest) {
          savedLocation = await tx.location.update({
            where: { location_id: latest.location_id },
            data: dataPayload,
          });
        } else {
          savedLocation = await tx.location.create({ data: dataPayload });
        }

        const user = await tx.users.findFirst({ where: { users_id: userIdNum } });
        const takecareperson = await tx.takecareperson.findFirst({
          where: {
            users_id: userIdNum,
            takecare_id: takecareIdNum,
            takecare_status: 1,
          },
        });

        let activeCaseForFlex = null;
        if (user && takecareperson) {
          activeCaseForFlex = await tx.extendedhelp.findFirst({
            where: {
              user_id: user.users_id,
              takecare_id: takecareperson.takecare_id,
              exted_closed_date: null,
            },
            orderBy: { exten_date: 'desc' },
          });
        }

        return {
          ok: true as const,
          savedLocation,
          safezone,
          previousStatus,
          calculatedStatus,
          user,
          takecareperson,
          activeCaseForFlex,
        };
      });

      if (!ctxResult.ok) {
        return res.status(404).json({ message: 'error', data: ctxResult.reason });
      }

      const { savedLocation, safezone, previousStatus, calculatedStatus, user, takecareperson, activeCaseForFlex } = ctxResult;

      if (previousStatus !== null && calculatedStatus === previousStatus) {
        return res.status(200).json({ message: 'success', data: savedLocation });
      }

      if (user && takecareperson) {
        const replyToken = user.users_line_id || '';

        if (replyToken) {
          const timeText = new Date().toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const name = `${takecareperson.takecare_fname} ${takecareperson.takecare_sname}`;
          const postbackData =
            calculatedStatus === 2
              ? `userLineId=${replyToken}&takecarepersonId=${Number(takecare_id)}&type=safezone`
              : undefined;

          const contents = getFlexTemplate(
            calculatedStatus,
            name,
            String(latitude),
            String(longitude),
            timeText,
            postbackData,
            activeCaseForFlex?.exten_id,
            safezone,
            { users_line_id: user.users_line_id || '' }
          );

          await pushFlexMessage({
            replyToken,
            altText: 'แจ้งเตือน Safezone',
            contents,
          });

          // ส่งข้อความไปยังกลุ่มเมื่อกลับเข้าเขตปลอดภัยและมีเคสช่วยเหลือเปิดอยู่
          if (calculatedStatus === 0 && previousStatus !== null && previousStatus !== 0) {
            try {
              const activeCase = await withUserContext(userIdNum, async (tx) =>
                tx.extendedhelp.findFirst({
                  where: {
                    user_id: user.users_id,
                    takecare_id: takecareperson.takecare_id,
                    exted_closed_date: null,
                  },
                  orderBy: { exten_date: 'desc' },
                })
              );

              // ส่งข้อความเฉพาะเมื่อมีเคสเปิดอยู่
              if (activeCase) {
                await replySafezoneBackMessage({
                  resUser: {
                    users_fname: user.users_fname,
                    users_sname: user.users_sname,
                    users_tel1: user.users_tel1 || '0000000000',
                    users_line_id: user.users_line_id || '',
                  },
                  resTakecareperson: {
                    takecare_fname: takecareperson.takecare_fname,
                    takecare_sname: takecareperson.takecare_sname,
                    takecare_tel1: takecareperson.takecare_tel1 || '-',
                    takecare_id: takecareperson.takecare_id,
                  },
                  extenId: activeCase.exten_id,
                });
              } else {
                console.log('ไม่มีเคสเปิดอยู่ - ข้ามการส่งข้อความกลับเข้าเขต');
              }
            } catch (error) {
              console.error('Error sending safezone back message to group:', error);
            }
          }
        }
      }

      return res.status(200).json({ message: 'success', data: savedLocation });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
  } else {
    res.setHeader('Allow', ['PUT', 'POST']);
    return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
  }
}