import { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import basePrisma from './prisma';
import { positiveInt } from './inputTypes';

type RlsPrisma = Prisma.TransactionClient | typeof basePrisma;

type Handler = (
    req: NextApiRequest,
    res: NextApiResponse,
    prisma: RlsPrisma
) => Promise<any> | any;

// คืนค่าดิบจากคำขอได้ (ข้อความหรือตัวเลข) withRls ตรวจด้วย positiveInt เอง
type GetUserId = (req: NextApiRequest) => unknown;

/**
 * ห่อ Next.js API handler — set RLS context อัตโนมัติ
 *
 * วิธีใช้:
 *   export default withRls(
 *     req => req.body.users_id,
 *     async function handle(req, res, prisma) {
 *       // ใช้ prisma ตามปกติ — query ทุกตัวจะมี RLS context ให้แล้ว
 *     }
 *   );
 */
export function withRls(getUserId: GetUserId, handler: Handler) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        // ASVS 4.1.1: รหัสที่ไม่ใช่จำนวนเต็มบวกในช่วง integer ของฐานข้อมูล (เช่น 99999999999) ตอบ 401 แทน HTTP 500 จาก Prisma
        const userId = positiveInt(getUserId(req));

        if (!userId) {
            // ไม่มี userId → ตัดจบตรงนี้ ห้ามรันด้วย connection ที่ไม่มี RLS context
            // (ก่อนหน้านี้ปล่อยผ่านด้วย basePrisma — รอดเพราะ RLS คืน 0 แถว
            //  แต่ถ้ารันด้วย role ที่เป็นเจ้าของตาราง จะ bypass policy ทั้งหมด)
            return res.status(401).json({ message: 'error', data: 'Unauthorized: Cannot determine user' });
        }

        // ASVS 7.4.2: บัญชีที่ถูกปิด (users_status_active ไม่ใช่ 1) ส่งข้อมูลจากนาฬิกาต่อไม่ได้ (เกณฑ์เดียวกับ withRlsAuth withLineUser)
        const active = await basePrisma.users.findFirst({ where: { users_id: userId, users_status_active: 1 }, select: { users_id: true } });
        if (!active) {
            return res.status(401).json({ message: 'error', data: 'Unauthorized: บัญชีถูกปิดใช้งานหรือไม่มีอยู่' });
        }

        return basePrisma.$transaction(async (tx) => {
            // ต้อง SET ROLE ก่อน — connection string ต่อด้วย postgres ซึ่งเป็น superuser + BYPASSRLS
            // ถ้าไม่สลับ role, policy ทุกตัวถูกข้าม (FORCE ROW LEVEL SECURITY กันได้แค่ owner ที่ไม่ใช่ superuser)
            await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
            await tx.$executeRaw`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
            return handler(req, res, tx);
        });
    };
}
