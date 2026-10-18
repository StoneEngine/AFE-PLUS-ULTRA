// ASVS 6.2.8: ตรวจรหัสผ่านตามที่ผู้ใช้พิมพ์ทุกตัว ห้ามตัดหรือเปลี่ยน
// bcrypt ใช้แค่ 72 ไบต์แรก และหยุดอ่านเมื่อเจอไบต์ 0 — รหัสที่ยาวกว่านั้นจะถูกตัดท้ายทิ้งเงียบๆ
// จึงปฏิเสธรหัสแบบนี้ตั้งแต่ต้น ทั้งตอนตั้งรหัสและตอนเข้าสู่ระบบ รหัสที่ผ่านด่านนี้ bcrypt จะตรวจครบทุกไบต์
// ทำตาม OWASP Password Storage Cheat Sheet (จำกัดรหัสผ่านไม่เกิน 72 ไบต์ · ไม่ pre-hash เพราะ cheat sheet เตือนเรื่องไบต์ 0)
import commonPasswords from '@/lib/data/common-passwords.json';

export const BCRYPT_MAX_BYTES = 72;

// ASVS 6.2.4: ตอนตั้งหรือเปลี่ยนรหัสผ่าน เทียบกับรหัสผ่านที่คนใช้บ่อย (มากกว่า 3,000 ตัว) ที่ตรงนโยบาย (นโยบายไม่มีความยาวขั้นต่ำ จึงใช้ได้ทั้งรายการ)
// รายการ SecLists 10k-most-common.txt ตามที่ OWASP Authentication Cheat Sheet หัวข้อ Block common and previously breached passwords ชี้ไป
// เก็บในเครื่อง ไม่ส่งรหัสผ่านไปถามบริการภายนอก
const COMMON_PASSWORDS = new Set<string>(commonPasswords);

export function passwordProblem(password: unknown): string | null {
    if (typeof password !== 'string' || password.length === 0) return 'กรุณาระบุรหัสผ่าน';
    if (password.includes('\0')) return 'รหัสผ่านมีอักขระที่ใช้ไม่ได้';
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
        return `รหัสผ่านยาวเกิน ${BCRYPT_MAX_BYTES} ไบต์ (ภาษาอังกฤษ 72 ตัว หรือภาษาไทยราว 24 ตัว)`;
    }
    return null;
}

// ใช้ตอนตั้งหรือเปลี่ยนรหัสผ่านเท่านั้น (addAdmin resetPasswordAdmin registration/create) ไม่ใช้ตอนเข้าสู่ระบบ
export function newPasswordProblem(password: unknown): string | null {
    const problem = passwordProblem(password);
    if (problem) return problem;
    if (COMMON_PASSWORDS.has(password as string)) return 'รหัสผ่านนี้เดาง่ายเกินไป (อยู่ในรายการรหัสผ่านที่คนใช้บ่อย) กรุณาเลือกรหัสผ่านอื่น';
    return null;
}
