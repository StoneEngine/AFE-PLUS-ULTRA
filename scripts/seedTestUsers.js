/**
 * seedTestUsers.js — สร้างผู้ใช้ทดสอบ + ผู้สูงอายุในความดูแล + safezone สำหรับชุดทดสอบความปลอดภัย
 * ใช้แทนการยิงใส่ข้อมูลผู้ใช้จริง  รันซ้ำได้ ไม่สร้างซ้ำ
 *   node scripts/seedTestUsers.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SEED = [
    { fname: 'ทดสอบความปลอดภัย', sname: 'หมายเลขหนึ่ง', takecare: 'ผู้สูงอายุทดสอบ ก' },
    { fname: 'ทดสอบความปลอดภัย', sname: 'หมายเลขสอง', takecare: 'ผู้สูงอายุทดสอบ ข' },
    { fname: 'ทดสอบความปลอดภัย', sname: 'หมายเลขสาม', takecare: 'ผู้สูงอายุทดสอบ ค' },
    { fname: 'ทดสอบความปลอดภัย', sname: 'หมายเลขสี่', takecare: 'ผู้สูงอายุทดสอบ ง' },
    { fname: 'ทดสอบความปลอดภัย', sname: 'หมายเลขห้า', takecare: 'ผู้สูงอายุทดสอบ จ' },
];

(async () => {
    const out = [];
    for (const s of SEED) {
        let u = await prisma.users.findFirst({ where: { users_fname: s.fname, users_sname: s.sname } });
        if (!u) {
            u = await prisma.users.create({
                data: {
                    users_fname: s.fname, users_sname: s.sname,
                    users_passwd: 'test-only', users_pin: 0, status_id: 1,
                    users_status_active: 1,
                },
            });
        }
        let t = await prisma.takecareperson.findFirst({ where: { users_id: u.users_id } });
        if (!t) {
            t = await prisma.takecareperson.create({
                data: {
                    users_id: u.users_id, takecare_fname: s.takecare, takecare_sname: '(ข้อมูลทดสอบ)',
                    takecare_birthday: new Date('1950-01-01'), gender_id: 1, marry_id: 1,
                },
            });
        }
        let z = await prisma.safezone.findFirst({ where: { users_id: u.users_id } });
        if (!z) {
            z = await prisma.safezone.create({
                data: {
                    users_id: u.users_id, takecare_id: t.takecare_id,
                    safez_latitude: '16.7000', safez_longitude: '100.2000',
                    safez_radiuslv1: 100, safez_radiuslv2: 200,
                },
            });
        }
        // ข้อมูลเซนเซอร์ปลอม — ต้องมีแถวจริง ไม่งั้นทดสอบ RLS แยกไม่ออกระหว่าง
        // "ถูกกรอง" กับ "ไม่มีข้อมูลตั้งแต่แรก"
        const loc = await prisma.location.findFirst({ where: { users_id: u.users_id } });
        if (!loc) {
            await prisma.location.create({
                data: {
                    users_id: u.users_id, takecare_id: t.takecare_id,
                    locat_timestamp: new Date(),
                    locat_latitude: '16.7001', locat_longitude: '100.2001',
                },
            });
        }
        const temp = await prisma.temperature_records.findFirst({ where: { users_id: u.users_id } });
        if (!temp) {
            await prisma.temperature_records.create({
                data: { users_id: u.users_id, takecare_id: t.takecare_id, temperature_value: 36.5 },
            });
        }
        const hr = await prisma.heartrate_records.findFirst({ where: { users_id: u.users_id } });
        if (!hr) {
            await prisma.heartrate_records.create({
                data: { users_id: u.users_id, takecare_id: t.takecare_id, bpm: 75 },
            });
        }
        // ค่าตั้งอุณหภูมิ — endpoint getTemperature อ่านตารางนี้ ไม่ใช่ temperature_records
        const ts = await prisma.temperature_settings.findFirst({ where: { users_id: u.users_id } });
        if (!ts) {
            await prisma.temperature_settings.create({
                data: { users_id: u.users_id, takecare_id: t.takecare_id, max_temperature: 37.5 },
            });
        }
        out.push({ users_id: u.users_id, takecare_id: t.takecare_id, safezone_id: z.safezone_id });
    }
    console.log('ผู้ใช้ทดสอบพร้อมใช้งาน:');
    console.table(out);
    console.log('\nคัดลอกไปวางใน VARIANTS ของ securityTestSuite.js ได้เลย');
    await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
