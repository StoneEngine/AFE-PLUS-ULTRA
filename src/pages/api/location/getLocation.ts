
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'
import { withUserContext } from '@/lib/withUserContext'
import _ from "lodash";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            const { users_id, takecare_id } = req.query;

            if (!users_id || !takecare_id || isNaN(Number(users_id)) || isNaN(Number(takecare_id))) {
                return res.status(400).json({ message: 'error', data: 'พารามิเตอร์ไม่ถูกต้อง' });
            }

            const userIdNum = Number(users_id);
            const takecareIdNum = Number(takecare_id);

            const latestLocation = await withUserContext(userIdNum, async (tx) =>
                tx.location.findFirst({
                    where: {
                        users_id: userIdNum,
                        takecare_id: takecareIdNum,
                    },
                    orderBy: {
                        location_id: 'desc',
                    },
                })
            );

            if (!latestLocation) {
                return res.status(404).json({ message: 'error', data: 'ไม่พบตำแหน่งล่าสุด' });
            }

            return res.status(200).json({
                message: 'success',
                data: latestLocation,
            });
        } catch (error) {
            console.error("Error:", error);
            return res.status(500).json({ message: 'error', data: 'เกิดข้อผิดพลาดในการประมวลผล' });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
    }
}
