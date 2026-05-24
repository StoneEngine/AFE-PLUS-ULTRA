import { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import basePrisma from './prisma';

type RlsPrisma = Prisma.TransactionClient | typeof basePrisma;

type Handler = (
    req: NextApiRequest,
    res: NextApiResponse,
    prisma: RlsPrisma
) => Promise<any> | any;

type GetUserId = (req: NextApiRequest) => number | null | undefined;

/**
 * ห่อ Next.js API handler — set RLS context อัตโนมัติ
 *
 * วิธีใช้:
 *   export default withRls(
 *     req => Number(req.body.users_id),
 *     async function handle(req, res, prisma) {
 *       // ใช้ prisma ตามปกติ — query ทุกตัวจะมี RLS context ให้แล้ว
 *     }
 *   );
 */
export function withRls(getUserId: GetUserId, handler: Handler) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const userId = getUserId(req);

        if (!userId || isNaN(userId)) {
            // ไม่มี userId → ใช้ prisma ปกติ (handler ค่อยตรวจและคืน 400 เอง)
            return handler(req, res, basePrisma);
        }

        return basePrisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
            return handler(req, res, tx);
        });
    };
}
