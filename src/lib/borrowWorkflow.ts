// ASVS 2.3.1: ขั้นตอนยืม-คืนอุปกรณ์ต้องทำตามลำดับ ข้ามขั้นไม่ได้ ตรวจที่เซิร์ฟเวอร์ทุกคำขอ
// ทำตาม OWASP REST Security Cheat Sheet หัวข้อ Preventing Out-of-Order API Execution
// ("Model workflows explicitly using finite states or state machines" · "Reject invalid or out-of-order transitions with clear error responses")
//
// ลำดับ (ตามหน้าเว็บที่มีอยู่และ docs/AUTHORIZATION.md):
//   1. ผู้ใช้สร้างคำขอยืม               borrowequipment/create                     สถานะเริ่ม: อนุมัติ=1 ส่งแบบสอบถาม=1 คืน=1
//   2. เจ้าหน้าที่อนุมัติ/ไม่อนุมัติ       admin/updateBorrowEquipmentStatus          ทำได้ก่อนขั้น 3 เท่านั้น
//   3. เจ้าหน้าที่ส่งแบบสอบถาม           admin/updateBorrowEquipmentStatusSend      ต้องอนุมัติแล้ว
//   4. ผู้ใช้คืนอุปกรณ์                  borrowequipment/return                     ต้องอนุมัติ + ส่งแบบสอบถามแล้ว และยังไม่ปิดการคืน
//   5. เจ้าหน้าที่ยืนยันผลการคืน          admin/updateBorrowEquipmentReturnStatus    คืนสำเร็จ (2) ต้องคืนครบทุกชิ้นก่อน
export const APPROVAL = { PENDING: 1, APPROVED: 2, REJECTED: 3 } as const
export const SEND = { NOT_SENT: 1, SENT: 2 } as const
export const RETURN = { WAITING: 1, RETURNED: 2, FAILED: 3 } as const

type BorrowState = {
    borrow_equipment_status: number
    borrow_send_status: number
    borrow_status: number
}

// คืน null = ทำขั้นนี้ได้ · คืนข้อความ = ข้ามขั้น (ตอบ HTTP 409)
export function canDecideApproval(b: BorrowState): string | null {
    if (b.borrow_send_status !== SEND.NOT_SENT || b.borrow_status !== RETURN.WAITING) {
        return 'เปลี่ยนผลอนุมัติไม่ได้ เพราะส่งแบบสอบถามหรือปิดการคืนไปแล้ว'
    }
    return null
}

export function canSendQuestionnaire(b: BorrowState): string | null {
    if (b.borrow_equipment_status !== APPROVAL.APPROVED) return 'ต้องอนุมัติการยืมก่อนส่งแบบสอบถาม'
    if (b.borrow_status !== RETURN.WAITING) return 'ปิดการคืนไปแล้ว'
    return null
}

export function canReturn(b: BorrowState): string | null {
    if (b.borrow_equipment_status !== APPROVAL.APPROVED) return 'การยืมนี้ยังไม่ได้รับอนุมัติ'
    if (b.borrow_send_status !== SEND.SENT) return 'ต้องรอเจ้าหน้าที่ส่งแบบสอบถามก่อนคืนอุปกรณ์'
    if (b.borrow_status !== RETURN.WAITING) return 'ปิดการคืนไปแล้ว'
    return null
}

export function canConfirmReturn(b: BorrowState, newStatus: number, itemsLeft: number): string | null {
    const problem = canReturn(b)
    if (problem) return problem
    if (newStatus === RETURN.RETURNED && itemsLeft > 0) return 'ผู้ยืมยังคืนอุปกรณ์ไม่ครบ'
    return null
}
