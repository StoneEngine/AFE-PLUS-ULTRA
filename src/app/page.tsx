'use client'
import { useEffect } from 'react'

export default function Home() {
  // ล็อกอิน LINE เสร็จ LINE จะส่งกลับมาหน้าแรก (Endpoint ของ LIFF) พร้อม ?liff.state=<หน้าที่ขอไว้>
  // liff.init() จะพาไปหน้านั้นต่อเอง — ถ้าไม่เรียก ผู้ใช้จะค้างอยู่หน้านี้
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_WEB_ID
    if (!liffId || !new URLSearchParams(window.location.search).has('liff.state')) return
    import('@line/liff').then(({ default: liff }) => liff.init({ liffId })).catch((e) => console.error('liff.init error:', e))
  }, [])

  return (
    <main className={''}>
     HomePage DemoAssist SmartWatch rn
    </main>
  )
}
