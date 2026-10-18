// เซิร์ฟเวอร์ที่ใช้แทน `next start` (ASVS 3.4.1 ทุกคำตอบต้องมี HSTS · 4.1.1 คำตอบที่มีเนื้อหาต้องมี Content-Type)
// เหตุ: คำตอบบางแบบถูกสร้างก่อนถึง middleware และ next.config.js จึงไม่มี HSTS — ผลตรวจทาน 55 ข้อ ส่วน 4 และการกวาดก่อนแก้รอบ 4 (18 ต.ค. 69)
//   - Next.js 14.2.35 ตอบ 308 เองเมื่อที่อยู่มี // หรือ \ (node_modules/next/dist/server/base-server.js:505–508) มีเนื้อหาแต่ไม่มี Content-Type
//   - Node.js ตอบ 400/431 เองเมื่ออ่านคำขอไม่ได้ (method ที่ไม่รู้จัก header ยาวเกิน) และ 417 เมื่อ Expect ไม่ใช่ 100-continue
// ทำตามเอกสาร Next.js 14 หน้า Custom Server (createServer + app.getRequestHandler)
// และเอกสาร Node.js v22 โมดูล http (event 'clientError' 'checkExpectation' · ตัวเลือก requireHostHeader)
// เอกสาร Next.js เตือนว่า custom server ปิด Automatic Static Optimization — หน้าเว็บจะสร้างตอนมีคำขอแทน
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = 'localhost'; // ตามตัวอย่างในเอกสาร · ทดสอบแล้ว Location ของ redirect เป็นที่อยู่แบบสัมพัทธ์ ไม่ขึ้นกับค่านี้
const app = next({ dev: false, hostname, port }); // ใช้แทน next start เท่านั้น (production)
const handle = app.getRequestHandler();

// ค่าเดียวกับ next.config.js และ src/middleware.ts (OWASP HTTP Strict Transport Security Cheat Sheet)
const HSTS = 'max-age=31536000; includeSubDomains';

// คำตอบที่เขียนลง socket เอง (ตอนที่ยังไม่มี ServerResponse) — ไม่มีเนื้อหา จึงไม่ต้องมี Content-Type
function rawReply(socket, statusLine) {
  socket.end(`HTTP/1.1 ${statusLine}\r\nStrict-Transport-Security: ${HSTS}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
}

function replyText(res, status, text) {
  res.writeHead(status, { 'Strict-Transport-Security': HSTS, 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
  res.end(text);
}

app.prepare().then(() => {
  // requireHostHeader: false — ให้คำขอ HTTP/1.1 ที่ไม่มี Host มาถึงโค้ดนี้ แล้วตอบ 400 เองพร้อม HSTS (เอกสาร Node.js: ค่าเริ่มต้นตอบ 400 เอง)
  const server = createServer({ requireHostHeader: false }, async (req, res) => {
    // ใส่ HSTS ก่อนส่งให้ Next.js ทุกคำขอ ถ้า Next.js ตั้ง header ชื่อเดียวกันจะทับค่าเดิม (ค่าเท่ากัน)
    res.setHeader('Strict-Transport-Security', HSTS);
    // ASVS 4.1.1: Next.js ตอบ RSC (หน้า App Router src/app/page.tsx และหน้า not-found ของ App Router) เป็น "text/x-component" ไม่มี charset
    // (node_modules/next/dist/client/components/app-router-headers.js RSC_CONTENT_TYPE_HEADER) — เติม charset เฉพาะตอนที่ Next.js ตั้งค่านี้จริง
    // ผลข้างเคียง: ตัวเปิดหน้าของ Next.js เทียบชนิดนี้ตรงตัว (client/components/router-reducer/fetch-server-response.js:81)
    // จึงโหลดหน้าใหม่ทั้งหน้าแทนการเปลี่ยนหน้าแบบ RSC (หน้า App Router มีหน้าเดียว ไม่มีลิงก์ไปหน้า App Router อื่น) · การออกแบบของผู้วิจัย
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) =>
      setHeader(name, String(name).toLowerCase() === 'content-type' && value === 'text/x-component' ? 'text/x-component; charset=utf-8' : value);
    if (req.httpVersion === '1.1' && !req.headers.host) return replyText(res, 400, 'Bad Request: missing Host header');
    const path = (req.url || '').split('?', 1)[0];
    // ASVS 4.1.1: ระบบไม่มี Server Action (ค้น 'use server' ใน src ได้ 0 จุด) · คำขอที่มี header Next-Action
    // Next.js ตอบหน้า HTML แต่ติดป้าย text/x-component (base-server.js:1782–1797 + send-payload.js:106 · ผลตรวจทานส่วน 8) จึงตอบ 400 เอง
    // Next.js นับเป็น Server Action ด้วย: มี header Next-Action (แม้ค่าว่าง) หรือ POST ที่เป็น urlencoded/multipart
    // (node_modules/next/dist/server/lib/server-action-request-meta.js:37–40 · ผลตรวจทานส่วน 9) — ไม่มี API ไหนรับแบบฟอร์ม (middleware ตอบ 415 ที่ /api อยู่แล้ว)
    const type = String(req.headers['content-type'] || '').toLowerCase();
    const formPost = req.method === 'POST' && (type.startsWith('application/x-www-form-urlencoded') || type.startsWith('multipart/form-data'));
    if ('next-action' in req.headers || (formPost && !path.startsWith('/api/'))) {
      return replyText(res, 400, 'Bad Request: server actions not supported');
    }
    // ASVS 4.1.1: คำขอพร้อม x-middleware-prefetch (ตัวเปิดหน้าของ Next.js ส่งตอน prefetch ลิงก์ shared/lib/router/router.js:279)
    // Next.js ตอบเนื้อหา "{}" โดยไม่ตั้ง Content-Type และตั้ง x-middleware-skip: 1 คู่กันเสมอ (base-server.js:1106–1111)
    // ตั้ง JSON ตอนส่ง header เฉพาะคำตอบที่มี x-middleware-skip: 1 และยังไม่มี Content-Type
    // (ห้ามตั้งไว้ก่อน เพราะ send-payload.js:105 ตั้ง Content-Type เฉพาะเมื่อยังไม่มี ทำให้หน้า HTML/RSC ติดป้าย JSON — ผลตรวจทานส่วน 10
    //  และ Next.js ส่ง header ออกไปก่อนเรียก end จึงต้องดักที่ writeHead)
    if (req.headers['x-middleware-prefetch']) {
      const writeHead = res.writeHead.bind(res);
      res.writeHead = (...args) => {
        if (String(res.getHeader('x-middleware-skip')) === '1' && !res.getHeader('content-type')) {
          setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        return writeHead(...args);
      };
    }
    // ที่อยู่ที่มี // หรือ \ ทำ redirect 308 เองแบบเดียวกับ Next.js (base-server.js:505–508 แทน \ ด้วย / และยุบ / ที่ซ้ำ)
    // แต่ใส่ Content-Type ด้วย · ทำก่อนส่งให้ Next.js เพราะ url.parse แปลง \ เป็น / แล้ว Next.js ส่งเนื้อหาจริงมาแทน redirect
    // (ผลตรวจทานส่วน 5: /admin\login ได้หน้า HTML จริงที่ติดป้าย text/plain)
    if (/(\\|\/\/)/.test(path)) {
      const location = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/') + (req.url || '').slice(path.length);
      res.writeHead(308, { 'Strict-Transport-Security': HSTS, Location: location, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(location);
    }
    try {
      await handle(req, res, parse(req.url, true));
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      if (!res.headersSent) replyText(res, 500, 'internal server error');
      else res.end();
    }
  });

  // ระบบไม่มี WebSocket (ASVS 4.4.1 ตัดออกเพราะเหตุนี้) · เดิมคำขอ Upgrade ได้ข้อความ "Internal Server Error" ดิบๆ ไม่มี status line และ header
  // (ทดสอบแล้วทั้ง next start และ custom server) — เอกสาร Node.js: เมื่อฟัง event 'upgrade' คำขอ upgrade ทั้งหมดมาที่นี่ จึงตอบ 400 เองพร้อม HSTS
  server.on('upgrade', (req, socket) => {
    const body = 'Bad Request: upgrade not supported';
    socket.end(`HTTP/1.1 400 Bad Request\r\nStrict-Transport-Security: ${HSTS}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  });

  // เอกสาร Node.js: ถ้าไม่ฟัง event นี้ เซิร์ฟเวอร์ตอบ 417 Expectation Failed เอง (ไม่มี HSTS)
  server.on('checkExpectation', (req, res) => replyText(res, 417, 'Expectation Failed'));

  // เอกสาร Node.js: ผู้ฟัง event นี้ต้องปิด socket เอง และตอบเป็น HTTP response แทนการตัดการเชื่อมต่อได้
  // ค่าเริ่มต้นของ Node.js ตอบ 431 เมื่อ header ยาวเกิน (HPE_HEADER_OVERFLOW) และ 400 กรณีอื่น
  server.on('clientError', (err, socket) => {
    if (err.code === 'ECONNRESET' || !socket.writable) return socket.destroy();
    rawReply(socket, err.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request');
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
