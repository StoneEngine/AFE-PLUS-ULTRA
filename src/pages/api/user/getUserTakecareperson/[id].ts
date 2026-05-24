import { NextApiRequest, NextApiResponse } from 'next'
import { withRlsAuth } from '@/lib/withRlsAuth'
import { decrypt } from '@/utils/helpers'

export default withRlsAuth(
    async function handle(req: NextApiRequest, res: NextApiResponse, prisma) {
        if (req.method === 'GET') {
            try {
                const id = decrypt(req.query.id as string);
                if (id) {
                    const userId = Array.isArray(id) ? parseInt(id[0], 10) : parseInt(id, 10);
                    if (!isNaN(userId)) {
                        const user = await prisma.takecareperson.findFirst({
                            where: {
                                users_id: userId,
                                takecare_status: 1,
                            },
                            include: {
                                gender_id_ref: {
                                    select: {
                                        gender_describe: true
                                    }
                                },
                                marry_id_ref: {
                                    select: {
                                        marry_describe: true
                                    }
                                },
                            },
                        })
                        return res.status(200).json({ message: 'success', data: user })
                    }
                }
                return res.status(400).json({ message: 'error', data: 'ไม่สามารถดึงข้อมูลได้' })

            } catch (error) {
                return res.status(400).json({ message: 'error', data: error })
            }
        } else {
            res.setHeader('Allow', ['GET'])
            res.status(400).json({ message: `วิธี ${req.method} ไม่อนุญาต` })
        }
    }
);
