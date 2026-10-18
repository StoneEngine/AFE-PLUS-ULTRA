import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// ASVS 3.5.1 / 3.5.2: คำขอที่เปลี่ยนข้อมูล (POST PUT PATCH DELETE) ที่มี body ต้องส่งแบบ JSON เท่านั้น
// ทำตาม OWASP CSRF Prevention Cheat Sheet (ไม่รับ content type แบบ "simple" ที่ฟอร์มส่งข้ามเว็บได้โดยไม่ผ่าน preflight)
// และ OWASP REST Security Cheat Sheet (ตอบ 415 กับ content type ที่ไม่รองรับ · ไม่บังคับ Content-Type กับคำขอที่ไม่มี body)
// หน้าเว็บ นาฬิกา และ LINE ส่ง JSON อยู่แล้ว
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ASVS 4.1.1: เดิม body ผิดรูปหรือใหญ่เกิน Next.js ตอบ 400/413 เป็นข้อความโดยไม่มี Content-Type
// จึงตรวจที่นี่ก่อนด้วยเกณฑ์เดียวกับ Next.js (JSON ต้อง parse ได้ · ไม่เกิน 1 MB) แล้วตอบเป็น JSON ที่มี Content-Type
// ทำตาม OWASP Input Validation Cheat Sheet หัวข้อ Parse Safely, Then Validate ("Apply request size limits before buffering or parsing input")
const MAX_BODY_BYTES = 1024 * 1024; // ค่าตั้งต้น bodyParser sizeLimit '1mb' ของ Next.js API routes

// ASVS 4.1.1: คำตอบ JSON ระบุ charset ด้วย
const jsonError = (message: string, status: number) =>
    NextResponse.json({ message }, { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const hasBody = (request: NextRequest) => {
    const length = request.headers.get('content-length');
    return (length !== null && length !== '0') || request.headers.has('transfer-encoding');
};

async function checkApiBody(request: NextRequest) {
    if (!hasBody(request)) return NextResponse.next();
    const type = (request.headers.get('content-type') || '').toLowerCase();
    // ASVS 4.1.1: charset อื่นที่ไม่ใช่ utf-8 ทำให้ตัวอ่าน body ของ Next.js ตอบ 400 "Invalid body" โดยไม่มี Content-Type (ทุก method)
    const charset = /;\s*charset\s*=\s*"?([^";\s]+)/.exec(type)?.[1];
    if (charset && charset !== 'utf-8') return jsonError('charset ต้องเป็น utf-8', 415);
    // ASVS 4.1.1: Next.js อ่าน body ทุก method (api-resolver.js:263) แต่ middleware อ่าน body ของ GET HEAD OPTIONS ไม่ได้
    // จึงไม่รับ body กับ method เหล่านี้ (ไม่มี API ไหนใช้) — RFC 9110 หัวข้อ 9.3.1: "content received in a GET request has no generally
    // defined semantics, cannot alter the meaning or target of the request, and might lead some implementations to reject the request"
    if (!WRITE_METHODS.has(request.method)) return jsonError(`คำขอ ${request.method} ต้องไม่มี body`, 400);
    if (!type) return NextResponse.next();
    if (!type.startsWith('application/json')) return jsonError('Content-Type ต้องเป็น application/json', 415);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return jsonError('ข้อมูลใหญ่เกิน 1 MB', 413);
    const text = await request.clone().text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return jsonError('ข้อมูลใหญ่เกิน 1 MB', 413);
    if (text.trim() !== '') {
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { return jsonError('Invalid JSON', 400); }
        // ASVS 4.1.1: ทุก API รับ body เป็น JSON object · body เป็น null หรือค่าเดี่ยว (1 "x" true) เดิมทำให้ handler ที่แยกค่าจาก req.body
        // ล้มเป็น HTTP 500 ไม่มี Content-Type (auth/login.ts) — ตรวจชนิดหลัง parse ตาม OWASP Input Validation Cheat Sheet หัวข้อ Parse Safely, Then Validate
        if (typeof parsed !== 'object' || parsed === null) return jsonError('ข้อมูลต้องเป็น JSON object', 400);
    }
    return NextResponse.next();
}

// ASVS 3.4.1 4.1.1: เดิม Next.js ตอบ HTTP 308 เองเมื่อที่อยู่ลงท้ายด้วย / โดยไม่มี HSTS และมีเนื้อหาแต่ไม่มี Content-Type
// ปิด redirect นั้นด้วย skipTrailingSlashRedirect (next.config.js) แล้วทำ redirect เองที่นี่ ใส่ HSTS ค่าเดียวกับ next.config.js และไม่มีเนื้อหา
// ทำตามเอกสาร Next.js หน้า skipTrailingSlashRedirect หัวข้อ Examples (ทำ redirect เรื่อง / ท้ายที่อยู่เองใน middleware)
const HSTS = 'max-age=31536000; includeSubDomains';

function removeTrailingSlash(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (pathname === '/' || !pathname.endsWith('/')) return null;
    // ใช้ URL ธรรมดา ไม่ใช้ request.nextUrl.clone() เพราะเมื่อเปิด skipTrailingSlashRedirect แล้ว NextURL จะเติม / ท้ายกลับเอง
    // (ทดสอบรอบแรก 18 ต.ค. 69 ได้ Location เป็นที่อยู่เดิม วนซ้ำไม่จบ)
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, '') || '/';
    const response = NextResponse.redirect(url, 308);
    response.headers.set('Strict-Transport-Security', HSTS);
    response.headers.set('Content-Type', 'text/plain; charset=utf-8'); // ถ้า Next.js ใส่ที่อยู่ปลายทางเป็นเนื้อหา ก็ยังมี Content-Type
    return response;
}

// ASVS 3.4.1 4.1.1: เดิมคำขอ method อื่น เช่น TRACE ไปหน้าเว็บหรือ /api ได้ HTTP 500 ที่ไม่มี HSTS (ผลตรวจทาน 55 ข้อ 18 ต.ค. 69)
// ทำตาม OWASP REST Security Cheat Sheet หัวข้อ Restrict HTTP methods
// ("Apply an allowlist of permitted HTTP Methods" · "Reject all requests not matching the allowlist with HTTP response code 405 Method not allowed.")
// รายการนี้ = method ที่หน้าเว็บ API นาฬิกา และ LINE ใช้อยู่ + HEAD OPTIONS ที่เบราว์เซอร์ส่งเอง
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function rejectUnknownMethod(request: NextRequest) {
    if (ALLOWED_METHODS.includes(request.method)) return null;
    const response = jsonError('Method Not Allowed', 405);
    response.headers.set('Allow', ALLOWED_METHODS.join(', '));
    response.headers.set('Strict-Transport-Security', HSTS);
    return response;
}

export async function middleware(request: NextRequest) {
    const rejected = rejectUnknownMethod(request);
    if (rejected) return rejected;

    const redirect = removeTrailingSlash(request);
    if (redirect) return redirect;

    if (request.nextUrl.pathname.startsWith('/api/')) return checkApiBody(request);

    // (เดิมมีโค้ด JSON.parse cookie currentUser ที่ไม่ได้ใช้ค่า ถ้า cookie เสียเซิร์ฟเวอร์ตอบ HTTP 500 ไม่มี HSTS — ASVS 3.4.1 · ลบออก)

    // console.log('request.nextUrl.pathname', request.nextUrl.pathname);
    // if (currentUser && !request.nextUrl.pathname.startsWith('/admin/dashboard')) {
    //     return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    // }

    // if (!currentUser && !request.nextUrl.pathname.startsWith('/login')) {
    //     return Response.redirect(new URL('/login', request.url));
    // }
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|.*\.png$).*)', '/api/:path*'],
};
