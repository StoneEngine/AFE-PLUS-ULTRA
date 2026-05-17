
import { NextApiRequest, NextApiResponse } from 'next'
import { NextResponse } from 'next/server'
import axios from "axios";
import prisma from '@/lib/prisma'
import { withUserContext } from '@/lib/withUserContext'
import { decrypt } from '@/utils/helpers'

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            const id = decrypt(req.query.id as string); // ถอดรหัส ID
            if (!id) {
                return res.status(400).json({ message: 'Invalid ID', data: null });
            }

            const takecarepersonId = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
            if (isNaN(takecarepersonId)) {
                return res.status(400).json({ message: 'Invalid ID format', data: null });
            }

            // RLS context: ใช้ users_id จาก query ถ้ามี (caller ที่รู้ users_id ส่งมา)
            // ถ้าไม่มี → ใช้ id เป็น fallback (กรณี id เป็น users_id อยู่แล้ว)
            const usersIdQuery = req.query.users_id;
            const usersIdNum = usersIdQuery ? parseInt(String(usersIdQuery), 10) : takecarepersonId;

            const response = await withUserContext(usersIdNum, async (tx) =>
                tx.takecareperson.findFirst({
                    where: {
                        OR: [
                            { takecare_id: takecarepersonId },
                            { users_id: takecarepersonId },
                        ],
                        takecare_status: 1,
                    },
                    include: {
                        gender_id_ref: {
                            select: { gender_describe: true },
                        },
                        marry_id_ref: {
                            select: { marry_describe: true },
                        },
                    },
                })
            );

            if (!response) {
                return res.status(404).json({ message: 'Data not found', data: null });
            }

            return res.status(200).json({ message: 'Success', data: response });
        } catch (error) {
            return res.status(500).json({ message: 'Error occurred', data: error });
        }
    } else {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ message: `วิธี ${req.method} ไม่อนุญาต` });
    }
}
