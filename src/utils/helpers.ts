import CryptoJS from 'crypto-js';
// import { compare, genSalt, hash } from 'bcrypt';

// ASVS 11.4.1: เดิมส่งกุญแจเป็นข้อความให้ CryptoJS.AES ซึ่งแปลงเป็นกุญแจด้วย EvpKDF ที่ใช้ MD5
// (node_modules/crypto-js/evpkdf.js · cipher-core.js:191 เลือก PasswordBasedCipher เมื่อกุญแจเป็น string)
// ตอนนี้ส่งกุญแจเป็น WordArray ที่ได้จาก SHA-256 ของค่าใน env (cipher-core.js:194 เลือก SerializableCipher ไม่ผ่าน EvpKDF)
// SHA-256 อยู่ในรายการ hash ที่อนุมัติ (สถานะ A) ของ ASVS ภาคผนวก C หัวข้อ Hash Functions (PDF หน้า 110) · MD5 สถานะ D (PDF หน้า 112)
// IV สุ่มใหม่ทุกครั้ง (WordArray.random ใช้ crypto.getRandomValues / crypto.randomBytes) ส่งไปข้างหน้าข้อความเข้ารหัส
// รหัสแบบเดิม (ขึ้นต้น U2FsdGVkX1) ถอดไม่ได้แล้ว decrypt คืนข้อความว่าง ผู้เรียกตอบ 400 ตามเดิม
const IV_WORDS = 4 // 16 ไบต์
const idKey = () => CryptoJS.SHA256(process.env.CRYPTOJS_SECRET_KEY as string)

export const encrypt = (data: string) => {
    const iv = CryptoJS.lib.WordArray.random(IV_WORDS * 4)
    const encrypted = CryptoJS.AES.encrypt(data, idKey(), { iv })
    const packed = iv.clone().concat(encrypted.ciphertext)
    return encodeURIComponent(CryptoJS.enc.Base64.stringify(packed))
}

export const decrypt = (data: string) => {
    try {
        const packed = CryptoJS.enc.Base64.parse(decodeURIComponent(data))
        if (packed.sigBytes <= IV_WORDS * 4) return ''
        const iv = CryptoJS.lib.WordArray.create(packed.words.slice(0, IV_WORDS), IV_WORDS * 4)
        const ciphertext = CryptoJS.lib.WordArray.create(packed.words.slice(IV_WORDS), packed.sigBytes - IV_WORDS * 4)
        const params = CryptoJS.lib.CipherParams.create({ ciphertext })
        return CryptoJS.AES.decrypt(params, idKey(), { iv }).toString(CryptoJS.enc.Utf8)
    } catch {
        return ''
    }
}

export const parseQueryString = (queryString: string) => {
    const params: { [key: string]: string } = {};
    const queries = queryString.split('&');
    queries.forEach((indexQuery) => {
        const indexPair = indexQuery.split('=');
        params[indexPair[0]] = indexPair[1];
    });
    return params;
}

// export const hashPassword = async (password: string): Promise<string> => {
//     const salt = await genSalt(8);
//     return hash(password, salt);
// };

// export const matchPassword = async (oldPassword: string, password: string): Promise<boolean> => {
//     return compare(password, oldPassword);
// };