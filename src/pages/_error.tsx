import React from 'react';
import Link from 'next/link';
import { NextPage, NextPageContext } from 'next';

interface ErrorProps {
  statusCode: number;
}

const ErrorPage: NextPage<ErrorProps> = ({ statusCode }) => {
  const message =
    statusCode === 404
      ? 'The page you are looking for was not found.'
      : 'An error occurred. Please try again.';

  return (
    <div className="text-center mt-10">
      <h1 className="text-4xl">{statusCode || 'Error'}</h1>
      <p className="text-xl mt-4">{message}</p>
      <Link href="/" className="text-blue-500 mt-4 inline-block">
          Go back to the homepage
      </Link>
    </div>
  );
};

// ใช้ getInitialProps ตามเอกสาร Next.js 14 หน้า Custom Errors (เอกสารเขียนว่า "Error does not currently support Next.js Data Fetching methods
// like getStaticProps or getServerSideProps." — getServerSideProps เดิมจึงไม่ทำงาน)
// ASVS 3.4.1: คำขอ TRACE ทำให้ middleware ของ Next.js ล้มก่อนถึงโค้ดเรา (Request ของ edge runtime ไม่รับ method นี้) แล้ว Next.js ตอบ HTTP 500
// ด้วยหน้านี้โดยไม่มี HSTS — ใส่ HSTS ค่าเดียวกับ next.config.js ที่นี่ให้หน้า error ทุกหน้าที่สร้างฝั่งเซิร์ฟเวอร์
ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  res?.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // ASVS 4.1.1: ไฟล์ static ที่ส่ง Range เกินขนาดหรือ If-Match ไม่ตรง โมดูล send ของ Next.js ตั้ง Content-Type ตามนามสกุลไฟล์ (image/png)
  // ก่อนตอบ 412/416 แล้วใช้หน้านี้เป็นเนื้อหา (node_modules/next/dist/compiled/send/index.js) — ตั้งให้ตรงกับเนื้อหา HTML
  if (res && (res.statusCode === 412 || res.statusCode === 416)) res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const statusCode = res ? res.statusCode : err ? (err.statusCode ?? 500) : 404;
  return { statusCode };
};

export default ErrorPage;
