// ASVS 2.2.2: กฎตรวจค่าที่รับเข้าทุกช่องอยู่ที่เซิร์ฟเวอร์ (กฎเดียวกับ zod ของหน้าเว็บ + ความยาวตามคอลัมน์ใน prisma/schema.prisma)
// หน้าเว็บตรวจด้วย zod เพื่อความสะดวกของผู้ใช้ แต่ด่านจริงคือไฟล์นี้ · กฎทั้งหมดเขียนไว้ใน docs/INPUT-VALIDATION.md (ASVS 2.1.1)
// ทำตาม OWASP Input Validation Cheat Sheet หัวข้อ Input Validation Strategies ("Define rules for each field":
// ตัวเลขและวันที่ = ชนิด รูปแบบ ค่าต่ำสุดสูงสุด · ข้อความ = ความยาวและอักขระที่ช่องนั้นต้องการ) และ REST Security Cheat Sheet
// ("Validate input: length / range / format and type.")

type TextRule = { kind: 'text'; max?: number; pattern?: RegExp; required?: boolean; message?: string }
type IntRule = { kind: 'int'; min?: number; max?: number; required?: boolean }
type NumberRule = { kind: 'number'; min?: number; max?: number; required?: boolean }
type DateRule = { kind: 'date'; required?: boolean }
export type Rule = TextRule | IntRule | NumberRule | DateRule
export type Rules = Record<string, Rule>

const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

// ข้อความ: ต้องเป็น string ความยาวไม่เกิน max ตรงรูปแบบ (ถ้ามี)
const text = (max?: number, extra: Omit<TextRule, 'kind' | 'max'> = {}): TextRule => ({ kind: 'text', max, ...extra })
// รูปแบบเดียวกับ zod ของหน้าเว็บ (components/validations/*.ts)
const DIGITS = /^[0-9]+$/
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/
// ASVS 2.2.1: ค่าสูงสุดของคอลัมน์ Int ใน PostgreSQL (ค่าเดียวกับ PG_INTEGER_MAX ใน src/lib/inputTypes.ts) เกินนี้ Prisma ล้ม
const PG_INTEGER_MAX = 2147483647
// ASVS 2.2.1 2.1.1: วันที่ = YYYY-MM-DD หรือ ISO 8601 ที่มีเวลาและเขตเวลา (แบบที่ JSON ของ Date จากหน้าเว็บสร้าง เช่น "2024-01-31T17:00:00.000Z")
// ไม่รับเวลาที่ไม่มีเขตเวลา เพราะ Date.parse ตีความเป็นเวลาเครื่องเซิร์ฟเวอร์
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/
export const R = {
    name: text(100, { required: true }),                                       // ชื่อ นามสกุล
    houseNo: text(10),                                                         // เลขที่บ้าน
    moo: text(5, { pattern: DIGITS, message: 'ต้องเป็นตัวเลขเท่านั้น' }),      // หมู่ (optionalDigitsRule)
    road: text(200),
    area: text(100, { required: true }),                                       // ตำบล อำเภอ จังหวัด
    postcode: text(5, { required: true, pattern: /^[0-9]{5}$/, message: 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก' }),
    mobile: text(10, { required: true, pattern: /^[0-9]{10}$/, message: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก' }),
    phoneOptional: text(10, { pattern: /^[0-9]{10}$/, message: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก' }),
    lineUserId: text(33, { required: true }),                                  // users_line_id VarChar(33)
    longText: text(300),                                                       // โรค ยา VarChar(300)
    coordinate: text(255, { required: true, pattern: NUMERIC, message: 'พิกัดต้องเป็นตัวเลข' }),
    // ASVS 2.2.1: รหัสและจำนวนเต็มไม่ติดลบ ไม่เกินช่วงคอลัมน์ Int (เดิมไม่มีค่าสูงสุด 99999999999 ผ่านกฎแล้ว Prisma ล้ม)
    idOptional: { kind: 'int', min: 1, max: PG_INTEGER_MAX } as IntRule,
    idRequired: { kind: 'int', min: 1, max: PG_INTEGER_MAX, required: true } as IntRule,
    intNonNegative: { kind: 'int', min: 0, max: PG_INTEGER_MAX, required: true } as IntRule,
    numberRequired: { kind: 'number', required: true } as NumberRule,
    dateRequired: { kind: 'date', required: true } as DateRule,
}

function check(name: string, value: unknown, rule: Rule): string | null {
    if (isEmpty(value)) return rule.required ? `กรุณาระบุ ${name}` : null
    switch (rule.kind) {
        case 'text': {
            if (typeof value !== 'string') return `${name} ต้องเป็นข้อความ`
            if (rule.max !== undefined && value.length > rule.max) return `${name} ยาวได้ไม่เกิน ${rule.max} ตัวอักษร`
            if (rule.pattern && !rule.pattern.test(value)) return `${name}: ${rule.message ?? 'รูปแบบไม่ถูกต้อง'}`
            return null
        }
        case 'int': {
            // allowlist รูปแบบเลขฐานสิบธรรมดา ไม่มีเลข 0 นำหน้า (ไม่รับ "01" "0x1" "1e0" " 1")
            const n = typeof value === 'number' ? value : (typeof value === 'string' && /^(0|-?[1-9]\d{0,14})$/.test(value) ? Number(value) : NaN)
            if (!Number.isSafeInteger(n)) return `${name} ต้องเป็นจำนวนเต็ม`
            if (rule.min !== undefined && n < rule.min) return `${name} ต้องไม่น้อยกว่า ${rule.min}`
            if (rule.max !== undefined && n > rule.max) return `${name} ต้องไม่มากกว่า ${rule.max}`
            return null
        }
        case 'number': {
            // รับรูปแบบที่ Kotlin Double.toString() ของแอปนาฬิกาสร้าง เช่น "0.0" "-12.5" "1.2E-5"
            const n = typeof value === 'number' ? value : (typeof value === 'string' && NUMERIC.test(value) ? Number(value) : NaN)
            if (!Number.isFinite(n)) return `${name} ต้องเป็นตัวเลข`
            if (rule.min !== undefined && n < rule.min) return `${name} ต้องไม่น้อยกว่า ${rule.min}`
            if (rule.max !== undefined && n > rule.max) return `${name} ต้องไม่มากกว่า ${rule.max}`
            return null
        }
        case 'date': {
            // ASVS 2.2.1: ตรวจรูปแบบก่อน แล้ววันที่ต้องมีจริง (เดิม Date.parse รับ "1" "x 1" "99999" และเลื่อน "2024-02-31" เป็น 2 มี.ค.)
            const m = typeof value === 'string' ? ISO_DATE.exec(value) : null
            if (!m || Number.isNaN(Date.parse(value as string))) return `${name} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD หรือ ISO 8601`
            const day = new Date(`${m[1]}T00:00:00Z`)
            if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== m[1]) return `${name} ไม่ใช่วันที่ที่มีจริง`
            return null
        }
    }
}

// คืนข้อความปัญหาแรกที่เจอ หรือ null ถ้าทุกช่องตรงกฎ (ช่องที่ไม่อยู่ใน rules ไม่ถูกเขียนลงฐานข้อมูลโดย handler)
export function fieldProblem(body: Record<string, unknown>, rules: Rules): string | null {
    for (const [name, rule] of Object.entries(rules)) {
        const problem = check(name, body[name], rule)
        if (problem) return problem
    }
    return null
}

// ช่องที่อยู่ของผู้ดูแล (registrationSchema / cuserinfoSchema)
export const USER_PROFILE_RULES: Rules = {
    users_fname: R.name, users_sname: R.name, users_number: R.houseNo, users_moo: R.moo, users_road: R.road,
    users_tubon: R.area, users_amphur: R.area, users_province: R.area,
    users_postcode: R.postcode, users_tel1: R.mobile, users_tel_home: R.phoneOptional,
}

// ช่องสร้างบัญชีโดยเจ้าหน้าที่ (admin/addAdmin · ไม่มีหน้าเว็บที่ส่งคำขอนี้ จึงไม่มี zod ให้เทียบ ใช้ความยาวตามคอลัมน์)
export const ADMIN_CREATE_RULES: Rules = {
    username: text(100, { required: true }), fname: R.name, sname: R.name,
    users_line_id: text(33), users_number: R.houseNo, users_moo: R.moo, users_road: R.road,
    users_tubon: text(100), users_amphur: text(100), users_province: text(100),
    users_postcode: text(5, { pattern: /^[0-9]{5}$/, message: 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก' }),
    users_tel1: R.phoneOptional,
    status_id: { kind: 'int', min: 1, max: 3 }, users_status_onweb: { kind: 'int', min: 0, max: 1 },
    users_status_active: { kind: 'int', min: 0, max: 1 }, users_alert_battery: { kind: 'int', min: 0 },
    users_related_borrow: text(255),
}

// ช่องรับเคสขอความช่วยเหลือ (accept-call · ค่ามาจากลิงก์ LIFF ที่ utils/apiLineGroup.ts สร้าง)
export const ACCEPT_CALL_RULES: Rules = {
    extenId: R.idRequired, takecareId: R.idRequired,
    userLineId: text(33, { required: true }), groupId: text(100, { required: true }), // users_line_id VarChar(33) · group_line_id VarChar(100)
    tel: text(12, { required: true }),                                                  // users_tel1 VarChar(12)
}

// ช่องคำขอยืมอุปกรณ์ (borrowequipment/create · ความยาวตามคอลัมน์ borrowequipment)
export const BORROW_RULES: Rules = {
    borrow_date: R.dateRequired, borrow_return: R.dateRequired,
    borrow_address: text(1000, { required: true }), borrow_tel: text(12, { required: true }),
    borrow_objective: text(1000, { required: true }), borrow_name: text(255, { required: true }),
}

// ช่องตั้งค่าเขตปลอดภัย ชีพจร อุณหภูมิ (setting/save*)
export const SAFEZONE_RULES: Rules = {
    takecare_id: R.idRequired, users_id: R.idRequired, safezone_id: R.idOptional,
    safez_latitude: R.coordinate, safez_longitude: R.coordinate,
    safez_radiuslv1: R.intNonNegative, safez_radiuslv2: R.intNonNegative,
}
export const HEARTRATE_SETTING_RULES: Rules = {
    takecare_id: R.idRequired, users_id: R.idRequired, id: R.idOptional, max_bpm: R.intNonNegative,
}
export const TEMPERATURE_SETTING_RULES: Rules = {
    takecare_id: R.idRequired, users_id: R.idRequired, setting_id: R.idOptional, max_temperature: R.numberRequired,
}

// ข้อมูลจากแอปนาฬิกา (ถอดรหัส AES แล้ว · ทุกค่าส่งมาเป็นข้อความ) — ตรวจชนิด ไม่ตรวจช่วงค่าทางการแพทย์
export const WATCH_FALL_RULES: Rules = {
    users_id: R.idRequired, takecare_id: R.idRequired,
    x_axis: R.numberRequired, y_axis: R.numberRequired, z_axis: R.numberRequired,
    fall_status: { kind: 'int', min: 0, required: true }, latitude: R.coordinate, longitude: R.coordinate,
}
export const WATCH_HEARTRATE_RULES: Rules = {
    uId: R.idRequired, takecare_id: R.idRequired, bpm: R.numberRequired, status: { kind: 'int' },
}
export const WATCH_TEMPERATURE_RULES: Rules = {
    uId: R.idRequired, takecare_id: R.idRequired, temperature_value: R.numberRequired, status: { kind: 'int' },
}
export const WATCH_LOCATION_RULES: Rules = {
    // ASVS 2.2.1: ระยะทางไม่ติดลบ (เดิม "-5" ได้สถานะอยู่ในเขต) ไม่เกินช่วงคอลัมน์ locat_distance Int · แบตเตอรี่เป็นร้อยละ ไม่เกิน 100
    uId: R.idRequired, takecare_id: R.idRequired, distance: { kind: 'number', min: 0, max: PG_INTEGER_MAX, required: true },
    // battery ต่ำสุด = ค่าต่ำสุดของ Int เพราะเอกสาร Android BatteryManager.getIntProperty: ถ้าเครื่องไม่รองรับคืน "Integer.MIN_VALUE"
    // (แอปนาฬิกา standbymain.kt:456 ส่งค่านี้ต่อมาตรงๆ) ถ้าตั้ง 0 นาฬิกาเครื่องนั้นจะส่งตำแหน่งไม่ได้
    latitude: R.coordinate, longitude: R.coordinate, battery: { kind: 'number', min: -2147483648, max: 100, required: true }, status: { kind: 'int' },
}

// ช่องของผู้มีภาวะพึ่งพิง (elderlyRegistrationSchema / puserinfoSchema)
export const TAKECARE_RULES: Rules = {
    takecare_fname: R.name, takecare_sname: R.name, takecare_birthday: R.dateRequired,
    gender_id: R.idRequired, marry_id: R.idRequired,
    takecare_number: R.houseNo, takecare_moo: R.moo, takecare_road: R.road,
    takecare_tubon: R.area, takecare_amphur: R.area, takecare_province: R.area,
    takecare_postcode: R.postcode, takecare_tel1: R.phoneOptional, takecare_tel_home: R.phoneOptional,
    takecare_disease: R.longText, takecare_drug: R.longText,
}
