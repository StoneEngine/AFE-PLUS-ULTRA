import type { NextApiRequest, NextApiResponse } from 'next'; 
import prisma from '@/lib/prisma';
import { hash, genSalt } from 'bcrypt';
import authMiddleware from '@/lib/authMiddleware';
import { newPasswordProblem } from '@/lib/passwordPolicy';
import { newPinProblem } from '@/lib/pinPolicy';
import { nestedValueProblem } from '@/lib/inputTypes';
import { fieldProblem, ADMIN_CREATE_RULES } from '@/lib/inputRules';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const {
            username, password, fname, sname, users_pin,
            users_line_id, users_status_onweb, users_number,
            users_moo, users_road, users_tubon, users_amphur,
            users_province, users_postcode, users_tel1,
            users_alert_battery, users_status_active,
            users_related_borrow, users_token, status_id
        } = req.body ?? {}; // ASVS 4.1.1: body null ไม่ทำให้ล้มเป็น HTTP 500 ที่ไม่มี Content-Type

        // ตรวจสอบว่าข้อมูลครบถ้วน
        if (
            !username || !password || !fname || !sname || 
            typeof users_pin === 'undefined'
        ) {
            return res.status(400).json({ message: 'กรุณาระบุข้อมูล Username, Password, ชื่อ, นามสกุล และ PIN' });
        }
        // ASVS 1.2.4: ทุกช่องต้องเป็นค่าเดี่ยวก่อนส่งลง data ของ Prisma (src/lib/inputTypes.ts)
        // ASVS 2.2.2: กฎของทุกช่องตรวจที่เซิร์ฟเวอร์ (src/lib/inputRules.ts · docs/INPUT-VALIDATION.md)
        const shape = nestedValueProblem(req.body) ?? fieldProblem(req.body, ADMIN_CREATE_RULES);
        if (shape) return res.status(400).json({ message: shape });
        const problem = newPasswordProblem(password); // ASVS 6.2.8 6.2.4
        if (problem) return res.status(400).json({ message: problem });
        const pinProblem = newPinProblem(users_pin); // ASVS 2.2.2 6.2.4
        if (pinProblem) return res.status(400).json({ message: pinProblem });

        // ASVS 2.2.1: ช่อง int ว่าง (undefined null "" แบบเดียวกับ fieldProblem) = ใช้ค่าเริ่มต้น · มีค่า = ผ่านกฎ int แล้ว แปลงด้วย Number ได้ตรงค่า
        // (เดิม || ทำให้ 0 กลายเป็น 1 และส่งข้อความ "3" ให้คอลัมน์ Int)
        const intOr = (value: unknown, fallback: number) =>
            value === undefined || value === null || value === '' ? fallback : Number(value);

        try {
            // เข้ารหัสรหัสผ่าน
            const hashedPassword = await hash(password, await genSalt(10));

            // เพิ่มข้อมูลผู้ใช้ลงในฐานข้อมูล
            const newUser = await prisma.users.create({
                data: {
                    users_user: username,
                    users_passwd: hashedPassword,
                    status_id: intOr(status_id, 1), // ใช้ค่า status_id จากคำขอ ถ้าไม่มีให้ใช้ 1 เป็นค่าเริ่มต้น
                    users_status_onweb: intOr(users_status_onweb, 1),
                    users_status_active: intOr(users_status_active, 1),
                    users_line_id: users_line_id || "",
                    users_fname: fname,
                    users_sname: sname,
                    users_pin: Number(users_pin),
                    users_number: users_number || null,
                    users_moo: users_moo || null,
                    users_road: users_road || null,
                    users_tubon: users_tubon || null,
                    users_amphur: users_amphur || null,
                    users_province: users_province || null,
                    users_postcode: users_postcode || null,
                    users_tel1: users_tel1 || null,
                    users_alert_battery: intOr(users_alert_battery, 0),
                    users_related_borrow: users_related_borrow || null,
                    users_token: null, // เลข session ออกโดย login.ts เท่านั้น ไม่รับจากคำขอ (ASVS 7.2.4)
                }
            });
            

            // ASVS 15.3.1: คืนแค่ users_id ไม่คืนทั้งแถว (เดิมคืน users_passwd ที่ hash แล้วกลับไปด้วย) · ไม่มีหน้าไหนอ่านค่านี้
            // ทำตาม OWASP API Security Top 10 2023 หัวข้อ API3 ("cherry-pick specific object properties you specifically want to return.")
            return res.status(201).json({ message: 'สร้างบัญชีผู้ใช้สำเร็จ', user: { users_id: newUser.users_id } });
        } catch (error) {
            console.error("Error creating user:", error);
            return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้' });
        }
    } else {
        return res.status(405).json({ message: 'Method not allowed' });
    }
};

// ต้องล็อกอินหน้าแอดมินก่อน (JWT แบบเดียวกับ admin API ตัวอื่น) — เดิมใครก็สร้างบัญชีผู้ดูแลระบบได้
export default authMiddleware(handler);
