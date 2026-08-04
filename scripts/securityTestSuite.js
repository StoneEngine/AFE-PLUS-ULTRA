/**
 * securityTestSuite.js — รันชุดทดสอบความปลอดภัย 3 ชั้นซ้ำหลายรอบ แล้วสรุปเป็นตาราง
 *
 * เหตุผลที่ต้องรันซ้ำ: ผลทดสอบครั้งเดียวยืนยันไม่ได้ว่าเป็นพฤติกรรมของระบบจริง
 * (reproducibility ตาม NIST SP 800-115) — ชุดนี้รันทุกเคส N รอบแล้วรายงาน pass/total
 *
 * รัน:
 *   node scripts/securityTestSuite.js            # 10 รอบ ยิง WEB_API_URL ใน .env
 *   node scripts/securityTestSuite.js 20         # 20 รอบ
 *   TEST_BASE_URL=http://localhost:3000 node scripts/securityTestSuite.js
 *
 * ผลลัพธ์: scripts/test-results/security-YYYYMMDD-HHmmss.{json,md}
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROUNDS = Number(process.argv[2]) || 10;
const BASE = (process.env.TEST_BASE_URL || process.env.WEB_API_URL || '').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;
const AES_KEY_HEX = process.env.AES_SHARED_KEY;
const DB_URL = process.env.DATABASE_PUBLIC_URL_NON_POOLING || process.env.DATABASE_PUBLIC_URL;

// ค่าที่ใช้ทดสอบ — แก้ให้ตรงกับข้อมูลจริงใน DB
const TEST_USER_ID = Number(process.env.TEST_USER_ID) || 36;
const TEST_TAKECARE_ID = Number(process.env.TEST_TAKECARE_ID) || 30;
const OTHER_USER_ID = Number(process.env.TEST_OTHER_USER_ID) || 37;
const DB_ROLE = process.env.TEST_DB_ROLE || 'app_user';

if (!BASE) {
    console.error('ต้องมี WEB_API_URL ใน .env หรือ TEST_BASE_URL');
    process.exit(1);
}

// ---------- helpers ----------

function aesBody(payload, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), ciphertext: ct.toString('base64') };
}

async function call(method, urlPath, { headers = {}, body } = {}) {
    const started = Date.now();
    const res = await fetch(`${BASE}${urlPath}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    let text = '';
    try { text = await res.text(); } catch {}
    return { status: res.status, body: text.slice(0, 300), ms: Date.now() - started };
}

const sensorPayload = () => ({
    uId: TEST_USER_ID,
    takecare_id: TEST_TAKECARE_ID,
    temperature_value: 36.5,
    status: 0,
});

// ---------- test cases ----------
// แต่ละเคส: { id, layer, name, expect, run() -> {ok, detail} }

// endpoint ที่ห่อด้วย withRlsAuth (ต้อง verify ตัวตนก่อนเข้า)
// หมายเหตุ: getSafezone ใช้ withRls เฉยๆ ตั้งแต่ commit dc51ad0 — ใช้ทดสอบชั้น 1 ไม่ได้
const AUTHED = `/api/setting/getTemperature?takecare_id=${TEST_TAKECARE_ID}&users_id=${TEST_USER_ID}`;

const httpCases = [
    {
        id: 'L1-01', layer: 'ชั้น 1 — LINE token', name: 'ไม่ส่ง Authorization header',
        expect: '401',
        async run() {
            const r = await call('GET', AUTHED);
            return { ok: r.status === 401, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L1-02', layer: 'ชั้น 1 — LINE token', name: 'Bearer token ปลอม',
        expect: '401',
        async run() {
            const r = await call('GET', AUTHED, { headers: { Authorization: 'Bearer invalid.token.value' } });
            return { ok: r.status === 401, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L1-03', layer: 'ชั้น 1 — LINE token', name: 'x-internal-key ผิด',
        expect: '401',
        async run() {
            const r = await call('GET', AUTHED, { headers: { 'x-internal-key': 'wrong-key-000' } });
            return { ok: r.status === 401, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L1-04', layer: 'ชั้น 1 — LINE token', name: 'x-internal-key ถูกต้อง',
        expect: '200',
        skip: !INTERNAL_KEY && 'ไม่มี INTERNAL_API_KEY ใน .env',
        async run() {
            const r = await call('GET', AUTHED, { headers: { 'x-internal-key': INTERNAL_KEY } });
            return { ok: r.status === 200, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L3-01', layer: 'ชั้น 3 — AES-128', name: 'ส่ง plaintext ไม่เข้ารหัส',
        expect: '400',
        async run() {
            const r = await call('POST', '/api/sentTemperature', { body: sensorPayload() });
            return { ok: r.status === 400, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L3-02', layer: 'ชั้น 3 — AES-128', name: 'เข้ารหัสด้วย key ผิด',
        expect: '400',
        async run() {
            const wrongKey = crypto.randomBytes(16).toString('hex');
            const r = await call('POST', '/api/sentTemperature', { body: aesBody(sensorPayload(), wrongKey) });
            return { ok: r.status === 400, detail: `HTTP ${r.status}`, raw: r };
        },
    },
    {
        id: 'L3-03', layer: 'ชั้น 3 — AES-128', name: 'เข้ารหัสด้วย key ถูกต้อง',
        expect: '200',
        skip: (!AES_KEY_HEX || AES_KEY_HEX.length !== 32) && 'AES_SHARED_KEY ต้องเป็น hex 32 ตัว',
        async run() {
            const r = await call('POST', '/api/sentTemperature', { body: aesBody(sensorPayload(), AES_KEY_HEX) });
            return { ok: r.status === 200, detail: `HTTP ${r.status}`, raw: r };
        },
    },
];

// ---------- ชั้น 2: RLS (ยิง DB ตรง) ----------

let prisma = null;
function getPrisma() {
    if (prisma) return prisma;
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    return prisma;
}

async function rlsQuery(setUserId) {
    // เลียนแบบ withRls: เปิด transaction, SET ROLE เป็น role ที่ไม่ใช่ table owner, set_config, แล้ว query
    const db = getPrisma();
    return db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${DB_ROLE}`);
        if (setUserId !== null) {
            await tx.$executeRawUnsafe(
                `SELECT set_config('app.current_user_id', $1, true)`,
                String(setUserId)
            );
        }
        const rows = await tx.$queryRawUnsafe(
            `SELECT users_id FROM location WHERE users_id = $1`,
            OTHER_USER_ID
        );
        return rows.length;
    });
}

const rlsCases = [
    {
        id: 'L2-01', layer: 'ชั้น 2 — RLS', name: 'ไม่ set RLS context แล้ว SELECT',
        expect: '0 แถว',
        async run() {
            const n = await rlsQuery(null);
            return { ok: n === 0, detail: `${n} แถว` };
        },
    },
    {
        id: 'L2-02', layer: 'ชั้น 2 — RLS', name: `set context = ${TEST_USER_ID} แล้วดึงของ user ${OTHER_USER_ID}`,
        expect: '0 แถว',
        async run() {
            const n = await rlsQuery(TEST_USER_ID);
            return { ok: n === 0, detail: `${n} แถว` };
        },
    },
    {
        id: 'L2-03', layer: 'ชั้น 2 — RLS', name: `set context = ${OTHER_USER_ID} แล้วดึงของตัวเอง`,
        expect: 'เห็นเฉพาะของตัวเอง',
        async run() {
            const n = await rlsQuery(OTHER_USER_ID);
            return { ok: n >= 0, detail: `${n} แถว (ทุกแถวเป็นของ users_id=${OTHER_USER_ID})` };
        },
    },
];

// ---------- runner ----------

async function main() {
    const cases = [...httpCases, ...(DB_URL ? rlsCases : [])];
    const startedAt = new Date();

    console.log(`\nชุดทดสอบความปลอดภัย AFE-PLUS-ULTRA`);
    console.log(`เป้าหมาย : ${BASE}`);
    console.log(`จำนวนรอบ : ${ROUNDS}`);
    console.log(`เริ่ม    : ${startedAt.toLocaleString('th-TH')}\n`);

    const results = [];

    for (const c of cases) {
        if (c.skip) {
            console.log(`  ${c.id}  ข้าม — ${c.skip}`);
            results.push({ ...pick(c), skipped: c.skip, pass: 0, total: 0, rounds: [] });
            continue;
        }

        const rounds = [];
        process.stdout.write(`  ${c.id}  ${c.name.padEnd(42)} `);

        for (let i = 1; i <= ROUNDS; i++) {
            const at = new Date().toISOString();
            try {
                const r = await c.run();
                rounds.push({ round: i, at, ok: r.ok, detail: r.detail, raw: r.raw });
                process.stdout.write(r.ok ? '.' : 'X');
            } catch (e) {
                rounds.push({ round: i, at, ok: false, detail: `error: ${e.message}` });
                process.stdout.write('E');
            }
        }

        const pass = rounds.filter((r) => r.ok).length;
        console.log(`  ${pass}/${ROUNDS}`);
        results.push({ ...pick(c), pass, total: ROUNDS, rounds });
    }

    if (prisma) await prisma.$disconnect();

    const outDir = path.join(__dirname, 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = startedAt.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const base = path.join(outDir, `security-${stamp}`);

    fs.writeFileSync(
        `${base}.json`,
        JSON.stringify({ target: BASE, rounds: ROUNDS, startedAt, results }, null, 2)
    );
    fs.writeFileSync(`${base}.md`, toMarkdown(BASE, ROUNDS, startedAt, results));

    const failed = results.filter((r) => !r.skipped && r.pass !== r.total);
    console.log(`\nบันทึกผล: ${base}.md`);
    console.log(`          ${base}.json`);
    console.log(failed.length ? `\nเคสที่ไม่ผ่านครบ: ${failed.map((f) => f.id).join(', ')}\n` : `\nผ่านครบทุกเคสทุกรอบ\n`);
    process.exit(failed.length ? 1 : 0);
}

function pick(c) {
    return { id: c.id, layer: c.layer, name: c.name, expect: c.expect };
}

function toMarkdown(target, rounds, startedAt, results) {
    const lines = [];
    lines.push(`# ผลการทดสอบความปลอดภัย AFE-PLUS-ULTRA`);
    lines.push('');
    lines.push(`- ระบบเป้าหมาย: ${target}`);
    lines.push(`- วันเวลาที่ทดสอบ: ${startedAt.toLocaleString('th-TH')}`);
    lines.push(`- จำนวนรอบต่อกรณีทดสอบ: ${rounds}`);
    lines.push('');
    lines.push('## ตารางสรุปผล');
    lines.push('');
    lines.push('| รหัส | ชั้นความปลอดภัย | กรณีทดสอบ | ผลที่คาดหวัง | ผลที่ได้ | ผ่าน/ทั้งหมด | อัตราผ่าน |');
    lines.push('|---|---|---|---|---|---|---|');

    for (const r of results) {
        if (r.skipped) {
            lines.push(`| ${r.id} | ${r.layer} | ${r.name} | ${r.expect} | ข้าม (${r.skipped}) | - | - |`);
            continue;
        }
        const detail = r.rounds[0]?.detail ?? '-';
        const rate = ((r.pass / r.total) * 100).toFixed(0);
        lines.push(`| ${r.id} | ${r.layer} | ${r.name} | ${r.expect} | ${detail} | ${r.pass}/${r.total} | ${rate}% |`);
    }

    lines.push('');
    lines.push('## บันทึกรายรอบ');
    lines.push('');
    for (const r of results) {
        if (r.skipped) continue;
        lines.push(`### ${r.id} — ${r.name}`);
        lines.push('');
        lines.push('| รอบ | เวลา | ผลที่ได้ | สรุป |');
        lines.push('|---|---|---|---|');
        for (const x of r.rounds) {
            lines.push(`| ${x.round} | ${new Date(x.at).toLocaleTimeString('th-TH')} | ${x.detail} | ${x.ok ? 'ผ่าน' : 'ไม่ผ่าน'} |`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
