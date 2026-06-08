// ใช้สำหรับ debug — generate body เข้ารหัสไปยิง Postman
// รัน: node scripts/encryptTestBody.js
// ต้องตั้ง AES_SHARED_KEY ใน .env หรือ export ใน shell

require('dotenv').config();
const crypto = require('crypto');

const ALGORITHM = 'aes-128-cbc';
const KEY_HEX = process.env.AES_SHARED_KEY;

if (!KEY_HEX || KEY_HEX.length !== 32) {
    console.error('Set AES_SHARED_KEY as 32-char hex in .env');
    process.exit(1);
}

const key = Buffer.from(KEY_HEX, 'hex');

// ⬇️ แก้ตรงนี้เป็น body จริงที่อยากส่ง
const payload = {
    uId: 36,
    takecare_id: 30,
    temperature_value: 36.5,
    status: 0,
};

const plaintext = JSON.stringify(payload);
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

const body = {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
};

console.log('Send this as POST body:\n');
console.log(JSON.stringify(body, null, 2));
