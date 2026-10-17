// ASVS 6.2.8: ตรวจรหัสผ่านตามที่ผู้ใช้พิมพ์ทุกตัว ห้ามตัดหรือเปลี่ยน
// bcrypt ใช้แค่ 72 ไบต์แรก และหยุดอ่านเมื่อเจอไบต์ 0 — รหัสที่ยาวกว่านั้นจะถูกตัดท้ายทิ้งเงียบๆ
// จึงปฏิเสธรหัสแบบนี้ตั้งแต่ต้น ทั้งตอนตั้งรหัสและตอนเข้าสู่ระบบ รหัสที่ผ่านด่านนี้ bcrypt จะตรวจครบทุกไบต์
// ทำตาม OWASP Password Storage Cheat Sheet (จำกัดรหัสผ่านไม่เกิน 72 ไบต์ · ไม่ pre-hash เพราะ cheat sheet เตือนเรื่องไบต์ 0)
export const BCRYPT_MAX_BYTES = 72;

export function passwordProblem(password: unknown): string | null {
    if (typeof password !== 'string' || password.length === 0) return 'กรุณาระบุรหัสผ่าน';
    if (password.includes('\0')) return 'รหัสผ่านมีอักขระที่ใช้ไม่ได้';
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
        return `รหัสผ่านยาวเกิน ${BCRYPT_MAX_BYTES} ไบต์ (ภาษาอังกฤษ 72 ตัว หรือภาษาไทยราว 24 ตัว)`;
    }
    return null;
}
