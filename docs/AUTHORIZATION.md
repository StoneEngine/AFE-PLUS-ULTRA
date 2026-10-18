# กฎการกำหนดสิทธิ์ (Authorization)

เอกสารนี้ตอบ OWASP ASVS 5.0 ข้อ 8.1.1 (เอกสารต้องกำหนดกฎจำกัดการเข้าถึงระดับฟังก์ชันและระดับข้อมูล ตามสิทธิ์ของผู้เรียกและคุณสมบัติของข้อมูล)
แนวทางตาม OWASP Authorization Cheat Sheet: Deny by Default · Validate the Permissions on Every Request · Enforce Least Privileges

## 1. ผู้เรียก (consumer) และวิธียืนยันตัวตน
| ผู้เรียก | ยืนยันตัวตนด้วย | wrapper ที่บังคับ (`src/lib/`) |
|---|---|---|
| เจ้าหน้าที่ (`status_id` 3) | JWT จาก `POST /api/auth/login` (HS256) ที่ `jti` ตรงกับ `users.users_token` และบัญชียังเปิดใช้ (`users_status_onweb` 1 · `users_status_active` 1) | `authMiddleware` |
| ผู้ดูแล (ผู้ใช้ LINE) | LINE ID Token (ES256 ตรวจลายเซ็นในแอป + ถาม LINE ซ้ำ) | `withRlsAuth` · `withLineOwner` · `withLineUser` (ทั้ง 3 ตัวเรียก `verifyLineToken`) |
| นาฬิกา | ข้อความเข้ารหัส AES-128-CBC ด้วยกุญแจในแอปนาฬิกา หรือ uId + PIN | `withAesDecrypt` + `withRls` · `withRls` |
| เซิร์ฟเวอร์ของระบบเอง (webhook lineProfile listAPI) | header `x-internal-key` = `INTERNAL_API_KEY` | `withInternalKey` · และทาง internal ของ `withRlsAuth` `withLineOwner` `withLineUser` |
| LINE Platform (webhook) | `x-line-signature` (HMAC-SHA256 ของ body ด้วย `LINE_CHANNEL_SECRET`) | `withLineSignature` |
| คนทั่วไป (ไม่ล็อกอิน) | ไม่มี | ไม่มี (เฉพาะ API ในหัวข้อ 2 ที่เขียนว่า "ทุกคน") |

## 2. สิทธิ์ระดับฟังก์ชัน (API ทุกไฟล์ใน `src/pages/api`)
หลัก: API ที่ไม่อยู่ในตารางนี้ หรือผู้เรียกไม่ตรงกับคอลัมน์ "ใครเรียกได้" = ปฏิเสธ (HTTP 401/403)

| API | ใครเรียกได้ | wrapper / ด่าน |
|---|---|---|
| `auth/login` | ทุกคน (ต้องมีชื่อผู้ใช้ + รหัสผ่านเจ้าหน้าที่) | จำกัดครั้งที่ผิด (`docs/SECURITY-LOGIN.md`) |
| `auth/logout` `auth/check-session` `auth/getSession` `auth/resetPasswordAdmin` | เจ้าหน้าที่ | `authMiddleware` |
| `admin/addAdmin` `admin/getUsers` `admin/updateUserStatus` `admin/getHelp` `admin/getBorrowEquipmentList` `admin/getBorrowEquipmentListReturn` `admin/updateBorrowEquipmentStatus` `admin/updateBorrowEquipmentStatusSend` `admin/updateBorrowEquipmentReturnStatus` | เจ้าหน้าที่ | `authMiddleware` |
| `admin/getEquipment` | ไม่มีใคร (โค้ดถูกปิดเป็นคอมเมนต์ทั้งไฟล์) | - |
| `user/getUser/[id]` `getProfile` | ผู้ดูแลเจ้าของ LINE user ID ที่ขอ · เซิร์ฟเวอร์ | `withLineOwner` |
| `registration/create` | ผู้ดูแลที่สมัครด้วย LINE user ID ของตัวเอง และได้แค่ `status_id` 1 · เซิร์ฟเวอร์ | `withLineOwner` |
| `registration/takecareperson` `user/updateUser/[id]` `user/updateUserTakecare/[id]` `user/getTakecareperson/[id]` `user/getUserTakecareperson/[id]` `location/getLocation` `setting/getHeartRate` `setting/getSafezone` `setting/getTemperature` `setting/saveHeartRate` `setting/saveSafezone` `setting/saveTemperature` | ผู้ดูแลที่ลงทะเบียนแล้ว (บัญชีเปิดใช้) · เซิร์ฟเวอร์ | `withRlsAuth` (ตั้ง RLS เป็น `users_id` ของผู้เรียก) |
| `borrowequipment/create` `borrowequipment/list` `borrowequipment/return` `borrowequipment/questionnaire` | ผู้ดูแลที่เป็นเจ้าของรายการยืม · เซิร์ฟเวอร์ | `withLineUser` + ตรวจเจ้าของ (`borrow_user_id`) |
| `borrowequipment/getAvailableEquipment` `master/getGender` `master/getMarry` | ทุกคน (ข้อมูลอ้างอิง ไม่มีข้อมูลส่วนบุคคล) | ไม่มี |
| `extendedhelp` `master/getGroupLine` `directions` | เซิร์ฟเวอร์เท่านั้น | `withInternalKey` |
| `webhook` `lineProfile` | LINE Platform | `withLineSignature` |
| `accept-call` | ผู้ใช้ LINE ที่ลงทะเบียนแล้ว (กดรับเคสจากกลุ่ม LINE) | `verifyLineToken` ในตัว handler |
| `watchconnphone` | นาฬิกาที่ส่ง uId + PIN ถูก | `withRls` (RLS ตาม uId) + ตรวจ PIN |
| `requestSOS` | นาฬิกาที่ส่ง uid + PIN ถูก | `withRls` + ตรวจ PIN |
| `sentFall` `sentHeartRate` `sentTemperature` `sentlocation` | นาฬิกาที่มีกุญแจ AES | `withAesDecrypt` + `withRls` |

## 3. สิทธิ์ระดับข้อมูล
- **RLS (Row-Level Security) ในฐานข้อมูล** (`prisma/rls-setup.sql`): ตาราง `temperature_records` `heartrate_records` `dlocation` `fall_records` `location` `safezone` `takecareperson` `temperature_settings` `heartrate_settings` อ่าน/เพิ่ม/แก้/ลบได้เฉพาะแถวที่ `users_id` เท่ากับ `app.current_user_id` ที่ wrapper ตั้งให้ (9 ตาราง × 4 คำสั่ง = 36 policy) และ wrapper สลับ role เป็น `app_user` ก่อนทุกคำสั่ง
- **ตาราง `users`** (ไม่มี RLS): ผู้ดูแลอ่านได้เฉพาะแถวของ LINE user ID ตัวเอง (`withLineOwner`) และคืนเฉพาะช่องที่ใช้ ไม่คืน `users_passwd` `users_token` `users_user` (`user/getUser/[id]`) · เจ้าหน้าที่อ่านรายชื่อผ่าน `admin/getUsers` ที่เลือกช่องไว้แล้ว
- **รายการยืมอุปกรณ์** (`borrowequipment` `borrowequipment_list` ไม่มี RLS): ผู้ดูแลทำได้เฉพาะรายการที่ `borrow_user_id` เป็นของตัวเอง (`withLineUser` isOwner) · ขั้นตอนต้องเป็นไปตามลำดับใน `src/lib/borrowWorkflow.ts` (อนุมัติ ส่งแบบสอบถาม คืน ยืนยันคืน)
- **เคสขอความช่วยเหลือ** (`extendedhelp`): สร้าง/อ่าน/แก้ผ่านเซิร์ฟเวอร์เท่านั้น · การรับเคสจากกลุ่ม LINE ผ่าน `accept-call` (ผู้รับต้องลงทะเบียนแล้ว และเคสต้องยังไม่ถูกคนอื่นรับ ตาม `postbackAccept` ใน `src/lib/lineFunction.ts`)
- **การปิดบัญชี**: เจ้าหน้าที่ที่ถูกเปลี่ยนสถานะ (`admin/updateUserStatus`) ถูกยกเลิก session ทันที · ผู้ใช้ LINE ที่ `users_status_active` ไม่ใช่ 1 ใช้ API ที่ต้องยืนยันตัวตนไม่ได้

## 4. เมื่อตรวจสิทธิ์ไม่ผ่าน
- ไม่มีตัวตนหรือ Token ผิด/หมดอายุ: HTTP 401 · มีตัวตนแต่ขอข้อมูลของคนอื่น: HTTP 403 · ข้ามขั้นตอนยืม-คืน: HTTP 409
- ตอบโดยไม่ทำงานต่อ (ตาม cheat sheet หัวข้อ Exit Safely when Authorization Checks Fail)

## 5. ข้อจำกัดที่รู้อยู่ (ยังไม่ได้แก้ในรอบนี้)
- นาฬิกายืนยันตัวตนด้วยกุญแจ AES ที่ทุกเรือนใช้ร่วมกันและ uId ในข้อความ (ASVS 8.2.1 8.2.2) ต้องแก้แอปนาฬิกา
- `user/updateUser/[id]` เลือกแถวจาก id ในที่อยู่ ไม่ใช่จากผู้ล็อกอิน (ASVS 8.2.2)
- `accept-call` ยังไม่ตรวจว่าผู้รับเคสเป็นสมาชิกกลุ่มของเคส
