# กฎตรวจค่าที่รับเข้า (Input Validation)

เอกสารนี้ตอบ OWASP ASVS 5.0 ข้อ 2.1.1 (เอกสารต้องกำหนดกฎตรวจว่าข้อมูลแต่ละช่องตรงโครงสร้างที่คาดไว้หรือไม่)
และเป็นเกณฑ์ของข้อ 2.2.1 2.2.2 (ตรวจแบบ allowlist ที่เซิร์ฟเวอร์ ไม่พึ่งหน้าเว็บ)
ทำตาม OWASP Input Validation Cheat Sheet หัวข้อ Input Validation Strategies ("Define rules for each field")

## 1. หลัก
- ด่านจริงอยู่ที่เซิร์ฟเวอร์ (`src/lib/inputRules.ts` `src/lib/inputTypes.ts` `src/lib/pinPolicy.ts` `src/lib/passwordPolicy.ts`) หน้าเว็บตรวจด้วย zod (`src/components/validations/*.ts`) ด้วยกฎเดียวกันเพื่อความสะดวกของผู้ใช้ ไม่ใช่ด่านความปลอดภัย
- ค่าที่ไม่ตรงกฎ ตอบ HTTP 400 พร้อมข้อความบอกช่องที่ผิด ยกเว้นข้อนี้ที่คงตามโค้ดเดิม
  - API เจ้าหน้าที่ที่ขาดช่องบังคับ ตอบ 401 (`auth/login` `auth/resetPasswordAdmin` `admin/updateUserStatus` `admin/updateBorrowEquipment*`)
  - API นาฬิกาที่หาบัญชีหรือผู้มีภาวะพึ่งพิงไม่เจอ ตอบ 200 พร้อม `message: 'error'` (`sentFall` `sentHeartRate` `sentTemperature`)
- ตรวจทุกช่องก่อนเขียนฐานข้อมูล ไม่บันทึกข้อมูลบางส่วน (API ที่เขียนหลายแถว เช่น `borrowequipment/create` เขียนใน transaction เดียว)
- ช่องที่ไม่อยู่ในเอกสารนี้ handler ไม่ได้อ่าน หรือไม่ได้เขียนลงฐานข้อมูล

## 2. ด่านที่ใช้กับทุก API
| ด่าน | กฎ | โค้ด |
|---|---|---|
| body ของ GET HEAD OPTIONS | ต้องไม่มี body (`Content-Length` มากกว่า 0 หรือมี `Transfer-Encoding`) ไม่งั้น HTTP 400 · RFC 9110 หัวข้อ 9.3.1 | `src/middleware.ts` `checkApiBody` |
| ชุดอักขระ | ถ้า `Content-Type` มี `charset` ต้องเป็น `utf-8` ไม่งั้น HTTP 415 (ทุก method) | `src/middleware.ts` `checkApiBody` |
| ชนิดเนื้อหา | POST PUT PATCH DELETE ที่มี body ต้องเป็น `application/json` ไม่งั้น HTTP 415 | `src/middleware.ts` `checkApiBody` |
| ขนาด body | ไม่เกิน 1 MB (เท่าค่าตั้งต้นของ Next.js API routes) ไม่งั้น HTTP 413 | `src/middleware.ts` `checkApiBody` |
| JSON ผิดรูป | ต้อง parse ได้ และต้องเป็น JSON object หรือ array (ไม่ใช่ `null` หรือค่าเดี่ยว) ไม่งั้น HTTP 400 | `src/middleware.ts` `checkApiBody` |
| ค่าเดี่ยว | ช่องที่ถูกเขียนลงฐานข้อมูลต้องเป็นข้อความ ตัวเลข true/false หรือ null ไม่ใช่ object/array (Prisma ตีความ object เป็นคำสั่ง) ยกเว้นช่องรายการที่ระบุ | `nestedValueProblem` |
| รหัส (id) | จำนวนเต็มบวกเลขฐานสิบ ไม่มี 0 นำหน้า (ไม่รับ `0x1` `1e0` ` 1` `+1` `01`) ไม่เกิน 2147483647 (ค่าสูงสุดของชนิด integer ใน PostgreSQL ที่ตารางใช้) ส่งเป็นตัวเลขหรือข้อความตัวเลขก็ได้ | `positiveInt` `positiveIntList` · `R.idRequired` |
| method | รับเฉพาะ GET HEAD POST PUT PATCH DELETE OPTIONS อื่นตอบ HTTP 405 (TRACE ถูก Next.js ปฏิเสธก่อนถึง middleware ตอบ HTTP 500 จาก `pages/_error.tsx` ที่ใส่ HSTS) | `src/middleware.ts` `rejectUnknownMethod` |

## 3. กฎของแต่ละชนิดช่อง (`R` ใน `src/lib/inputRules.ts`)
| ชื่อกฎ | ชนิด | กฎ | ที่มาของกฎ |
|---|---|---|---|
| ชื่อ (`name`) | ข้อความ | ต้องมี · ไม่เกิน 100 ตัวอักษร | zod `min(1)` + คอลัมน์ VarChar(100) |
| เลขที่บ้าน (`houseNo`) | ข้อความ | ไม่บังคับ · ไม่เกิน 10 | VarChar(10) |
| หมู่ (`moo`) | ข้อความ | ไม่บังคับ · ตัวเลข 0–9 เท่านั้น · ไม่เกิน 5 | zod `optionalDigitsRule` + VarChar(5) |
| ถนน (`road`) | ข้อความ | ไม่บังคับ · ไม่เกิน 200 | VarChar(200) |
| ตำบล อำเภอ จังหวัด (`area`) | ข้อความ | ต้องมี · ไม่เกิน 100 | zod `min(1)` + VarChar(100) |
| รหัสไปรษณีย์ (`postcode`) | ข้อความ | ต้องมี · ตัวเลข 5 หลักพอดี | zod `zipCodeRule` |
| เบอร์มือถือผู้ดูแล (`mobile`) | ข้อความ | ต้องมี · ตัวเลข 10 หลักพอดี | zod `phoneRule` |
| เบอร์โทรอื่น (`phoneOptional`) | ข้อความ | ไม่บังคับ · ถ้ามีต้องเป็นตัวเลข 10 หลักพอดี | zod `homePhoneRule` |
| LINE user ID (`lineUserId`) | ข้อความ | ต้องมี · ไม่เกิน 33 | VarChar(33) |
| โรค ยา (`longText`) | ข้อความ | ไม่บังคับ · ไม่เกิน 300 | VarChar(300) |
| พิกัด (`coordinate`) | ข้อความ | ต้องมี · ตัวเลขทศนิยม (รับรูปแบบ `1.2E-5` ที่แอปนาฬิกาสร้าง) · ไม่เกิน 255 | VarChar(255) |
| รหัส (`idRequired` `idOptional`) | จำนวนเต็ม | 1 ถึง 2147483647 | คอลัมน์ Int + autoincrement (ค่าสูงสุดของ integer ใน PostgreSQL) |
| จำนวนเต็มไม่ติดลบ (`intNonNegative`) | จำนวนเต็ม | ต้องมี · 0 ถึง 2147483647 | คอลัมน์ Int (รัศมี ชีพจรสูงสุด) |
| ตัวเลข (`numberRequired`) | ตัวเลข | ต้องมี · เป็นตัวเลขจำกัด (ไม่ใช่ NaN/Infinity) | คอลัมน์ Int/Float |
| วันที่ (`dateRequired`) | ข้อความ | ต้องมี · รูปแบบ `YYYY-MM-DD` หรือ ISO 8601 ที่มีเวลาและเขตเวลา (เช่น `2024-01-31T17:00:00.000Z`) · ต้องเป็นวันที่มีจริง (ไม่รับ `2024-02-31`) | zod `z.date()` + คอลัมน์ DateTime |

## 4. ค่าที่ใช้ตัดสินเรื่องความปลอดภัย
| ค่า | กฎ | ใช้ที่ | โค้ด |
|---|---|---|---|
| PIN (ตั้งหรือเปลี่ยน) | ข้อความตัวเลข 4 หลักพอดี · ไม่อยู่ในรายการ PIN ยอดนิยม 3,000 ตัว | `registration/create` `user/updateUser/[id]` `admin/addAdmin` | `newPinProblem` |
| PIN เดิม (ตอนเปลี่ยน PIN) | ข้อความตัวเลข 4 หลัก · ต้องตรงกับ PIN ปัจจุบัน | `user/updateUser/[id]` | `pinFormatProblem` `storedPinText` |
| PIN (จับคู่นาฬิกา) | ข้อความตัวเลข 4 หลักพอดี | `watchconnphone` (query `uPin`) | `pinFormatProblem` |
| PIN (กด SOS) | ข้อความตัวเลข 1–4 หลัก (ไม่บังคับ 4 หลักพอดี เพราะนาฬิกาที่จับคู่แล้วเก็บ PIN ตามที่พิมพ์) | `requestSOS` (body `pin`) | regex `^\d{1,4}$` |
| รหัสผ่าน (ตั้งหรือเปลี่ยน) | ข้อความ 1–72 ไบต์ ไม่มีไบต์ 0 · ไม่อยู่ในรายการรหัสผ่านยอดนิยม 10,000 ตัว | `registration/create` `admin/addAdmin` `auth/resetPasswordAdmin` | `newPasswordProblem` |
| รหัสผ่าน (เข้าสู่ระบบ) | ข้อความ 1–72 ไบต์ ไม่มีไบต์ 0 | `auth/login` | `passwordProblem` |
| ชื่อผู้ใช้เจ้าหน้าที่ | ข้อความ (ไม่ใช่ object) | `auth/login` | `typeof === 'string'` |
| สถานะผู้ใช้ (`status_id`) | ตอนสมัครผ่านหน้าเว็บต้องเป็น 1 · เจ้าหน้าที่สร้าง/เปลี่ยนได้ 1–3 | `registration/create` `admin/addAdmin` `admin/updateUserStatus` | `onlySelfCaregiver` · `ADMIN_CREATE_RULES` |
| สถานะอนุมัติ / สถานะคืน | 1 2 หรือ 3 เท่านั้น · ต้องเป็นไปตามลำดับขั้น | `admin/updateBorrowEquipment*` | `APPROVAL` `RETURN` `src/lib/borrowWorkflow.ts` |
| uId / uid / users_id ของนาฬิกา | จำนวนเต็มบวกเลขฐานสิบ ไม่มี 0 นำหน้า · บัญชีต้องเปิดใช้ (`users_status_active` = 1) | `watchconnphone` (query `uId`) `requestSOS` (body `uid`) `sentFall` `sentHeartRate` `sentTemperature` `sentlocation` | `positiveInt` · `WATCH_*_RULES` · `withRls` |
| LINE ID Token | ต้องมาใน `Authorization: Bearer` · ตรวจตาม `src/lib/verifyLineToken.ts` (ES256 กุญแจ LINE iss aud exp nbf + ถาม LINE ซ้ำ · เหลืออายุไม่น้อยกว่า 1 นาที) | API ที่ห่อ `withRlsAuth` `withLineOwner` `withLineUser` และ `accept-call` | `verifyLineToken` |
| JWT เจ้าหน้าที่ | `Authorization: Bearer` · HS256 · ยังไม่หมดอายุ · `jti` ตรงกับเลข session ล่าสุดของบัญชี | API ที่ห่อ `authMiddleware` | `authMiddleware` |
| `x-internal-key` | ต้องตรงกับ `INTERNAL_API_KEY` ทุกตัวอักษร | API ที่ห่อ `withInternalKey` `withRlsAuth` `withLineUser` `withLineOwner` | ตัวห่อแต่ละตัว |
| `users_id` `uId` `uid` ที่เซิร์ฟเวอร์ส่งมาพร้อม `x-internal-key` (body หรือ query หรือ id ที่เข้ารหัส) | รหัสตามหัวข้อ 2 ไม่งั้น HTTP 401 | API ที่ห่อ `withRlsAuth` | `positiveInt` |
| `X-Real-IP` `X-Forwarded-For` | ใช้เป็นกุญแจนับครั้งที่ใส่รหัสผ่านผิดเท่านั้น รายละเอียดและข้อจำกัดใน `docs/SECURITY-LOGIN.md` | `auth/login` | `src/lib/loginRateLimit.ts` |

## 5. กฎรายช่องของแต่ละ API ที่เขียนข้อมูล
| API | ช่องและกฎ (ชื่อกฎในหัวข้อ 3) | ชุดกฎในโค้ด |
|---|---|---|
| `registration/create` | `users_line_id` lineUserId · `users_fname` `users_sname` name · `users_number` houseNo · `users_moo` moo · `users_road` road · `users_tubon` `users_amphur` `users_province` area · `users_postcode` postcode · `users_tel1` mobile · `users_tel_home` phoneOptional · `users_passwd` `users_pin` ตามหัวข้อ 4 · `status_id` = 1 | `USER_PROFILE_RULES` |
| `user/updateUser/[id]` | ช่องเดียวกับ `registration/create` (ยกเว้น `users_line_id` `users_passwd` `status_id`) · `users_pin` `old_pin` ตามหัวข้อ 4 · id ในที่อยู่ ถอดรหัสแล้วต้องเป็นจำนวนเต็มบวก | `USER_PROFILE_RULES` |
| `admin/addAdmin` | `username` ข้อความต้องมี ไม่เกิน 100 · `users_line_id` ข้อความไม่บังคับ ไม่เกิน 33 · `fname` `sname` name · ที่อยู่และเบอร์ไม่บังคับ (ความยาวตามคอลัมน์ รหัสไปรษณีย์ 5 หลัก เบอร์ 10 หลัก) · `status_id` 1–3 · `users_status_onweb` `users_status_active` 0–1 · `users_alert_battery` ไม่ติดลบ · `users_related_borrow` ไม่เกิน 255 · `password` `users_pin` ตามหัวข้อ 4 · `users_token` ไม่รับจากคำขอ · ช่องจำนวนเต็มที่เว้นว่างใช้ค่าเริ่มต้น (`status_id` `users_status_onweb` `users_status_active` = 1 · `users_alert_battery` = 0) ช่องที่ส่งมาแปลงเป็นตัวเลขหลังผ่านกฎ (ส่ง 0 ได้ 0) | `ADMIN_CREATE_RULES` |
| `registration/takecareperson` `user/updateUserTakecare/[id]` | `takecare_fname` `takecare_sname` name · `takecare_birthday` dateRequired · `gender_id` `marry_id` idRequired · `takecare_number` houseNo · `takecare_moo` moo · `takecare_road` road · `takecare_tubon` `takecare_amphur` `takecare_province` area · `takecare_postcode` postcode · `takecare_tel1` `takecare_tel_home` phoneOptional · `takecare_disease` `takecare_drug` longText · `users_id` idRequired (เฉพาะสร้าง) | `TAKECARE_RULES` |
| `borrowequipment/create` | `borrow_user_id` รหัส · `borrow_list[].equipment_id` รายการรหัส (ช่องรายการเดียวที่เป็น array ได้) · `borrow_date` `borrow_return` dateRequired · `borrow_address` `borrow_objective` ข้อความต้องมี ไม่เกิน 1000 (ผู้วิจัยกำหนด เพราะคอลัมน์ไม่จำกัดความยาว) · `borrow_tel` ข้อความต้องมี ไม่เกิน 12 · `borrow_name` ข้อความต้องมี ไม่เกิน 255 · รหัสอุปกรณ์ในรายการต้องไม่ซ้ำ (400) · อุปกรณ์ทุกตัวต้องมีอยู่ในระบบ (400) และว่าง (`equipment_status` = 1 เกณฑ์เดียวกับ `borrowequipment/getAvailableEquipment` · ไม่ว่าง 409) ไม่งั้นไม่สร้างแถวใด (ตรวจก่อนแล้วเขียนใน transaction) | `BORROW_RULES` |
| `borrowequipment/return` | `returnList` รายการรหัส ไม่ว่าง | `positiveIntList` |
| `setting/saveSafezone` | `takecare_id` `users_id` idRequired · `safezone_id` idOptional · `safez_latitude` `safez_longitude` coordinate · `safez_radiuslv1` `safez_radiuslv2` intNonNegative · `safez_radiuslv1` ต้องไม่มากกว่า `safez_radiuslv2` | `SAFEZONE_RULES` |
| `setting/saveHeartRate` | `takecare_id` `users_id` idRequired · `id` idOptional · `max_bpm` intNonNegative | `HEARTRATE_SETTING_RULES` |
| `setting/saveTemperature` | `takecare_id` `users_id` idRequired · `setting_id` idOptional · `max_temperature` numberRequired | `TEMPERATURE_SETTING_RULES` |
| `admin/updateUserStatus` | `id` รหัส · `status` รหัส | `positiveInt` |
| `admin/updateBorrowEquipmentStatus` `...ReturnStatus` `...StatusSend` | `borrow_id` `user_id` รหัส · `status` ตามหัวข้อ 4 (`...StatusSend` รับ 1–3 แบบสถานะอนุมัติ แต่ระบบตั้งสถานะส่งเป็น 2 เอง) · method อื่นตอบ 405 | `positiveInt` |
| `auth/resetPasswordAdmin` | `user_id` รหัส · `old_password` ข้อความ · `new_password` ตามหัวข้อ 4 | `positiveInt` |
| `sentFall` `sentHeartRate` `sentTemperature` `sentlocation` (ชั้นนอกของข้อความจากนาฬิกา) | body ต้องมี `iv` และ `ciphertext` (ข้อความ base64) ทั้งคู่ ไม่งั้น HTTP 400 · ต้องถอดรหัสด้วยกุญแจ AES ของระบบ (aes-128-cbc) ได้ ไม่งั้น HTTP 400 · ข้อความที่ถอดได้ต้องเป็น JSON แล้วจึงตรวจช่องตามแถวด้านล่าง | `withAesDecrypt` |
| `sentFall` (นาฬิกา) | `users_id` `takecare_id` idRequired · `x_axis` `y_axis` `z_axis` numberRequired · `fall_status` จำนวนเต็มไม่ติดลบ · `latitude` `longitude` coordinate | `WATCH_FALL_RULES` |
| `sentHeartRate` (นาฬิกา) | `uId` `takecare_id` idRequired · `bpm` numberRequired · `status` จำนวนเต็ม (ไม่บังคับ) | `WATCH_HEARTRATE_RULES` |
| `sentTemperature` (นาฬิกา) | `uId` `takecare_id` idRequired · `temperature_value` numberRequired · `status` จำนวนเต็ม (ไม่บังคับ) | `WATCH_TEMPERATURE_RULES` |
| `sentlocation` (นาฬิกา) | `uId` `takecare_id` idRequired · `distance` ตัวเลขต้องมี 0 ถึง 2147483647 · `battery` ตัวเลขต้องมี ไม่เกิน 100 (ต่ำสุด -2147483648 เพราะเอกสาร Android BatteryManager.getIntProperty คืน `Integer.MIN_VALUE` เมื่อเครื่องไม่รองรับ) · `latitude` `longitude` coordinate · `status` จำนวนเต็ม (ไม่บังคับ) | `WATCH_LOCATION_RULES` |
| `watchconnphone` (นาฬิกา จับคู่) | `uId` (query) รหัส · `uPin` (query) PIN 4 หลัก ตามหัวข้อ 4 | `positiveInt` `pinFormatProblem` |
| `requestSOS` (นาฬิกา กด SOS) | `uid` รหัส · `pin` ตัวเลข 1–4 หลัก ตามหัวข้อ 4 · Content-Type ต้องเป็น `application/json` ตรงตัว ไม่มี charset (แอปนาฬิกาส่งแบบนี้) ไม่งั้น HTTP 400 | `positiveInt` |
| `accept-call` (รับเคสจากกลุ่ม LINE) | `extenId` `takecareId` idRequired · `userLineId` ข้อความต้องมี ไม่เกิน 33 · `groupId` ข้อความต้องมี ไม่เกิน 100 · `tel` ข้อความต้องมี ไม่เกิน 12 (ความยาวตามคอลัมน์ `users_line_id` `group_line_id` `users_tel1`) · LINE ID Token ตามหัวข้อ 4 | `ACCEPT_CALL_RULES` |
| `webhook` `lineProfile` (LINE Platform) | ต้องมี `x-line-signature` ที่ตรงกับ HMAC-SHA256 ของ body ด้วย `LINE_CHANNEL_SECRET` ไม่งั้น HTTP 401 · body ต้องเป็น JSON (400) · ทำงานเฉพาะค่า `type` `source.type` `message.type` `postback.type` ที่ระบบรองรับ (เช่น `message` + `text` จากผู้ใช้ · `postback` ชนิด `safezone` `alert` `temperature` `fall` `heartrate` `accept` `close` · `join` จากกลุ่ม) ค่าอื่นไม่ทำอะไร · `source.userId` ใช้หาผู้ใช้จาก `users_line_id` เท่านั้น · `source.groupId` ของ event จากกลุ่มถูกบันทึกเป็นกลุ่ม LINE ผ่าน `master/getGroupLine` (ตรวจค่าเดี่ยว) · ช่องใน `postback.data` (ปุ่มที่ระบบสร้างเอง): `takecarepersonId` `extenId`/`exten_id` `takecare_id`/`takecareId` ต้องเป็นรหัสตามหัวข้อ 2 ไม่งั้นไม่ทำงาน · `userLineId` ใช้หาผู้ใช้จาก `users_line_id` เท่านั้น · `action` ทำงานเฉพาะ `show_map` | `withLineSignature` `positiveInt` |
| `extendedhelp` (เซิร์ฟเวอร์เรียกเอง ผ่าน `withInternalKey`) | ค่าเดี่ยว (POST) · รหัสตามหัวข้อ 2 ทุกช่อง: GET `extenId` หรือ `takecareId` + `usersId` · POST `takecareId` `usersId` · PUT `extenId` `extenReceivedUserId` `extenClosedUserId` · `safezLatitude` `safezLongitude` ข้อความไม่ว่าง ไม่เกิน 255 (คอลัมน์ VarChar(255)) · `typeStatus` ใช้ได้เฉพาะ `save` (POST) และ `sendAgain` `received` `close` (PUT) ค่าอื่นไม่เปลี่ยนข้อมูล | `nestedValueProblem` `positiveInt` |
| `master/getGroupLine` (เซิร์ฟเวอร์เรียกเอง ผ่าน `withInternalKey`) | ค่าเดี่ยว (POST) · `group_line_id` ข้อความไม่ว่าง ไม่เกิน 100 ทั้ง GET (query) และ POST · `group_name` ข้อความ ไม่เกิน 100 (ว่างได้) · ความยาวตามคอลัมน์ VarChar(100) | `nestedValueProblem` |

## 6. ค่าที่รับทาง query หรือที่อยู่ (อ่านอย่างเดียว)
- Next.js ให้ค่า query เป็นข้อความหรือรายการข้อความเท่านั้น (ไม่เป็น object)
- รหัสใน query ของ `setting/get*` `location/getLocation` `borrowequipment/list` ต้องเป็นรหัสตามหัวข้อ 2 (`positiveInt`): `takecare_id` `users_id` `setting_id` (getTemperature) `id` (getHeartRate getSafezone) · `userId` (borrowequipment/list) ต้องเป็นของผู้ล็อกอินด้วย · ไม่ตรงตอบ HTTP 400 (หรือ 401 ถ้าด่านยืนยันตัวตนปฏิเสธก่อน)
- `status` ในตัวกรองของหน้าเจ้าหน้าที่ (`admin/getBorrowEquipmentList` `admin/getBorrowEquipmentListReturn`) ว่างได้ ถ้ามีต้องเป็นรหัสตามหัวข้อ 2 ไม่งั้น HTTP 400
- id ที่เข้ารหัสในที่อยู่ (`user/getUserTakecareperson/[id]` `user/getTakecareperson/[id]` `user/updateUser/[id]` `user/updateUserTakecare/[id]` `borrowequipment/questionnaire`) ต้องถอดรหัสได้ด้วยกุญแจของระบบ และถอดแล้วต้องเป็นรหัสตามหัวข้อ 2 ไม่งั้นตอบ 400/401
- `user/getUser/[id]` รับ LINE user ID (ไม่เข้ารหัส) ต้องตรงกับ LINE user ID ใน LINE ID Token (`withLineOwner`)
- `getProfile` query `id` = LINE user ID ต้องตรงกับ LINE user ID ใน LINE ID Token (`withLineOwner`)
- `directions` query `origin` `destination` ข้อความตัวเดียว ไม่ว่าง ไม่เกิน 200 ตัวอักษร ไม่งั้น HTTP 400
- คำค้นของหน้าเจ้าหน้าที่ (`name` `name_borrow`) ต้องเป็นข้อความตัวเดียว (ส่งซ้ำเป็นรายการตอบ HTTP 400) ใช้ใน `contains` ของ Prisma (ไม่ต่อ SQL เอง)

## 7. ข้อจำกัดที่รู้อยู่
- ยังไม่ได้ตรวจช่วงค่าทางการแพทย์ของข้อมูลนาฬิกาและค่าตั้งเตือน (เช่น ชีพจร อุณหภูมิ `max_temperature`) ตรวจแค่ชนิดและช่วงของคอลัมน์ เพราะไม่มีเอกสารกำหนดช่วง
- `borrowequipment/create` ไม่ตรวจว่าวันคืนต้องไม่ก่อนวันยืม เพราะหน้า `pages/borrowequipment/borrow.tsx` ปิดช่องวันสิ้นสุดไว้และส่งวันคืนเป็นเวลาที่เปิดหน้า ถ้าตรวจ ผู้ใช้ที่เลือกวันยืมในอนาคตจะยื่นคำขอไม่ได้
- webhook และ lineProfile เชื่อข้อมูลจาก LINE หลังตรวจ `x-line-signature` แล้ว ไม่ได้ตรวจชนิดทุกช่องของ event
