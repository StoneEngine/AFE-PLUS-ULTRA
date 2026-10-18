// ASVS 1.2.4: ค่าจาก body เป็น JSON ซึ่งเป็น object ได้ ถ้าส่งต่อให้ Prisma ตรงๆ object อย่าง {"not": ""} หรือ {"gt": 0}
// จะกลายเป็นเงื่อนไขค้นแทนค่าเท่ากับ (เจอจริงที่ auth/login.ts ก่อนแก้) — ตรวจชนิดก่อนถึง Prisma ไม่ผ่านให้ตอบ HTTP 400
// ทำตาม OWASP REST Security Cheat Sheet หัวข้อ Input validation ("Validate input: length / range / format and type.")

// รหัสในฐานข้อมูลเป็นชนิด integer ของ PostgreSQL (migration ใช้ SERIAL/INTEGER) ค่าสูงสุด +2147483647
// เอกสาร PostgreSQL 18 หน้า Numeric Types: "integer 4 bytes ... -2147483648 to +2147483647"
// และ "Attempts to store values outside of the allowed range will result in an error." (เดิมค่าเกินช่วงทำให้ HTTP 500 — ASVS 4.1.1)
const PG_INTEGER_MAX = 2147483647

// จำนวนเต็มบวก รับทั้งตัวเลขและข้อความตัวเลข (หน้าแอดมินบางหน้าส่ง "3") · อย่างอื่นคืน null
export function positiveInt(value: unknown): number | null {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 && value <= PG_INTEGER_MAX ? value : null
    if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) {
        const n = Number(value)
        return n <= PG_INTEGER_MAX ? n : null
    }
    return null
}

// body ที่ช่องต่างๆ ถูกส่งต่อลง data ของ Prisma ทีละช่อง: ทุกช่องต้องเป็นค่าเดี่ยว (ข้อความ ตัวเลข true/false null)
// ไม่ใช่ object หรือ array (Prisma ตีความ object เป็นคำสั่ง เช่น {"increment": 1}) · listKeys = ช่องที่ตั้งใจให้เป็นรายการ
export function nestedValueProblem(body: unknown, listKeys: string[] = []): string | null {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'ข้อมูลต้องเป็น JSON object'
    for (const [key, value] of Object.entries(body)) {
        if (value !== null && typeof value === 'object' && !(listKeys.includes(key) && Array.isArray(value))) {
            return `ช่อง ${key} ต้องเป็นค่าเดี่ยว`
        }
    }
    return null
}

// รายการจำนวนเต็มบวกที่ไม่ว่าง · มีตัวไหนไม่ใช่ = คืน null ทั้งรายการ
export function positiveIntList(value: unknown): number[] | null {
    if (!Array.isArray(value) || value.length === 0) return null
    const list = value.map(positiveInt)
    return list.every((v): v is number => v !== null) ? list : null
}
