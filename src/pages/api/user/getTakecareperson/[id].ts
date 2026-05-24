import { NextApiRequest, NextApiResponse } from 'next'
import { withRls } from '@/lib/withRls'
import { decrypt } from '@/utils/helpers'

export default withRls(
    req => {
        // ถ้ามี users_id ใน query ใช้ก่อน (caller รู้ users_id)
        if (req.query?.users_id) return Number(req.query.users_id);
        // fallback: ใช้ decrypted id (กรณี id เป็น users_id อยู่แล้ว)
        const id = decrypt(req.query.id as string);
        return id ? Number(Array.isArray(id) ? id[0] : id) : null;
    },
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const id = decrypt(req.query.id as string);
                if (!id) {
                    return res.status(400).json({ message: 'Invalid ID', data: null });
                }

                const takecarepersonId = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
                if (isNaN(takecarepersonId)) {
                    return res.status(400).json({ message: 'Invalid ID format', data: null });
                }

                const response = await prisma.takecareperson.findFirst({
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
                });

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
);
