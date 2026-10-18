import commonPins from '@/lib/data/common-pins.json'

// ASVS 2.2.2: กฎของ PIN ตรวจที่เซิร์ฟเวอร์ทุกทางที่รับ PIN ไม่พึ่งหน้าเว็บ (registrationSchema / cuserinfoSchema ตรวจแค่บนเครื่องผู้ใช้)
// กฎเดียวกับหน้าเว็บ: เป็นข้อความตัวเลข 0–9 ยาว 4 หลักพอดี ไม่แปลงด้วย Number() ก่อนตรวจ (Number รับ "0x0" " 0" "0e5" ได้)
// ทำตาม OWASP REST Security Cheat Sheet หัวข้อ Input validation ("Constrain string inputs with regexps.")
export const PIN_PATTERN = /^\d{4}$/

// ASVS 6.2.4: ตอนตั้งหรือเปลี่ยน PIN ห้ามเป็น PIN ที่คนใช้บ่อย 3,000 อันดับแรก (PIN 4 หลักตรงกับนโยบาย PIN ของระบบ)
// รายการจาก SecLists four-digit-pin-codes-sorted-by-frequency-withcount.csv ตามที่ OWASP Authentication Cheat Sheet
// หัวข้อ Block common and previously breached passwords ชี้ไป · เก็บในเครื่อง ไม่ส่ง PIN ไปถามบริการภายนอก
const COMMON_PINS = new Set<string>(commonPins)

export function pinFormatProblem(pin: unknown): string | null {
    if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) return 'PIN ต้องเป็นตัวเลข 4 หลัก'
    return null
}

// ใช้ตอนตั้งหรือเปลี่ยน PIN เท่านั้น ไม่ใช้ตอนเข้าสู่ระบบ
export function newPinProblem(pin: unknown): string | null {
    const problem = pinFormatProblem(pin)
    if (problem) return problem
    if (COMMON_PINS.has(pin as string)) return 'PIN นี้เดาง่ายเกินไป (อยู่ในรายการ PIN ที่คนใช้บ่อย 3,000 อันดับแรก) กรุณาเลือก PIN อื่น'
    return null
}

// PIN เก็บในฐานข้อมูลเป็นตัวเลข (users_pin Int) PIN "0123" จึงถูกเก็บเป็น 123 — แปลงกลับเป็น 4 หลักก่อนเทียบหรือแสดง
export function storedPinText(storedPin: number | string | null | undefined): string {
    return String(storedPin ?? '').padStart(4, '0')
}
