/** @type {import('next').NextConfig} */ 
const nextConfig = {
	// ASVS 3.4.1 4.1.1: ปิด HTTP 308 ที่ Next.js ส่งเองเมื่อที่อยู่ลงท้ายด้วย / (ไม่มี HSTS) ให้ src/middleware.ts ทำ redirect แทน
	// ตามเอกสาร Next.js หน้า skipTrailingSlashRedirect
	skipTrailingSlashRedirect: true,
	// ASVS 4.1.1: ส่งรูปตามไฟล์เดิมไม่ผ่านตัวย่อรูป /_next/image (คำตอบ error ของตัวย่อรูปไม่มี Content-Type) — เอกสาร Next.js หน้า Image หัวข้อ unoptimized
	// ทุกหน้าใช้แค่ /images/Logo.png · เมื่อ unoptimized Next.js ตอบหน้า 404 ให้ /_next/image ก่อนถึงตัวย่อรูป
	// (node_modules/next/dist/server/next-server.js:167–169) ตัวย่อรูปที่มีช่องโหว่ใน docs/DEPENDENCY-POLICY.md หัวข้อ 7 จึงเรียกไม่ได้
	images: { unoptimized: true },
	env: {
	  AppStatus                : process.env.APP_STATUS,
	  GoogleMapsApiKey         : process.env.GOOGLE_MAPS_API_KEY,
	  CHANNEL_ACCESS_TOKEN_LINE: process.env.CHANNEL_ACCESS_TOKEN_LINE,
	  WEB_API_URL              : process.env.WEB_API_URL,
	  WEB_DOMAIN               : process.env.WEB_DOMAIN,
	  CRYPTOJS_SECRET_KEY      : process.env.CRYPTOJS_SECRET_KEY,
	  SECRET_KEY               : process.env.SECRET_KEY,
	},
	async headers() {
	  return [
		// ASVS 3.4.1: ทุก response ต้องมี HSTS อายุอย่างน้อย 1 ปี (31536000 วินาที)
		// รูปแบบค่าตาม OWASP HTTP Strict Transport Security Cheat Sheet (ไม่ใส่ preload เพราะ cheat sheet เตือนว่ามีผลถาวร)
		{
		  source: '/:path*',
		  headers: [
			{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
		  ],
		},
		// (ASVS 4.1.1 charset ของคำตอบ RSC ทำใน server.js — กฎ header ที่นี่เลือกตามที่อยู่และ header ของคำขอ จึงไปติดกับคำตอบที่ไม่ใช่ RSC
		//  ผลตรวจทานส่วน 6 และ 7)
		// ASVS 3.2.1: ถ้ามีคนเปิด API ตรงๆ ในเบราว์เซอร์ ให้เบราว์เซอร์แสดงในโหมด sandbox (รันสคริปต์ไม่ได้)
		// header ชุดนี้ตาม OWASP REST Security Cheat Sheet หัวข้อ Security Headers (frame-ancestors 'none' · nosniff · no-store)
		// การเรียก API ด้วย fetch/axios จากหน้าเว็บ นาฬิกา และ LINE ไม่ได้ใช้ header เหล่านี้ จึงไม่กระทบ
		{
		  source: '/api/:path*',
		  headers: [
			// (ASVS 4.1.1: คำตอบ 400/413 ของ body ผิดรูปหรือใหญ่เกิน ตรวจใน src/middleware.ts แทนการตั้ง Content-Type ตั้งต้นที่นี่
			// เพราะค่าตั้งต้นไปทับหน้า 404 HTML ของ /api ที่ไม่มีอยู่ให้กลายเป็น text/plain — ผลตรวจ 55 ข้อ 18 ต.ค. 69)
			{ key: 'Content-Security-Policy', value: "sandbox; frame-ancestors 'none'" },
			{ key: 'X-Content-Type-Options', value: 'nosniff' },
			{ key: 'Cache-Control', value: 'no-store' },
		  ],
		},
	  ];
	},
  };
  
  module.exports = nextConfig;
  