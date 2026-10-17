/** @type {import('next').NextConfig} */ 
const nextConfig = {
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
		// ASVS 3.2.1: ถ้ามีคนเปิด API ตรงๆ ในเบราว์เซอร์ ให้เบราว์เซอร์แสดงในโหมด sandbox (รันสคริปต์ไม่ได้)
		// header ชุดนี้ตาม OWASP REST Security Cheat Sheet หัวข้อ Security Headers (frame-ancestors 'none' · nosniff · no-store)
		// การเรียก API ด้วย fetch/axios จากหน้าเว็บ นาฬิกา และ LINE ไม่ได้ใช้ header เหล่านี้ จึงไม่กระทบ
		{
		  source: '/api/:path*',
		  headers: [
			{ key: 'Content-Security-Policy', value: "sandbox; frame-ancestors 'none'" },
			{ key: 'X-Content-Type-Options', value: 'nosniff' },
			{ key: 'Cache-Control', value: 'no-store' },
		  ],
		},
	  ];
	},
  };
  
  module.exports = nextConfig;
  