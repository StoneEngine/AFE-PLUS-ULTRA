import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { User } from '@/types/user';

// ASVS 3.5.1 / 3.5.2: คำขอที่เปลี่ยนข้อมูล (POST PUT PATCH DELETE) ที่มี body ต้องส่งแบบ JSON เท่านั้น
// ทำตาม OWASP CSRF Prevention Cheat Sheet (ไม่รับ content type แบบ "simple" ที่ฟอร์มส่งข้ามเว็บได้โดยไม่ผ่าน preflight)
// และ OWASP REST Security Cheat Sheet (ตอบ 415 กับ content type ที่ไม่รองรับ · ไม่บังคับ Content-Type กับคำขอที่ไม่มี body)
// หน้าเว็บ นาฬิกา และ LINE ส่ง JSON อยู่แล้ว
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requireJsonForWrites(request: NextRequest) {
    if (!WRITE_METHODS.has(request.method)) return NextResponse.next();
    const type = (request.headers.get('content-type') || '').toLowerCase();
    if (!type || type.startsWith('application/json')) return NextResponse.next();
    return NextResponse.json({ message: 'Content-Type ต้องเป็น application/json' }, { status: 415 });
}

export function middleware(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith('/api/')) return requireJsonForWrites(request);

    const currentUser = request.cookies.get('currentUser')?.value;
    if (currentUser) {
        const currentUserData: User = JSON.parse(currentUser);
        // console.log("🚀 ~ middleware ~ currentUser:", currentUserData?.permission);
    }

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
