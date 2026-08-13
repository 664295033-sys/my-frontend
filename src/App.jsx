import React from 'react'

// Web App URL ของ Google Apps Script
// !! สำคัญ !! ต้องเป็น URL ที่ลงท้ายด้วย /exec เท่านั้น (ไม่ใช่ /dev)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxI-ro5rN_zFz3ZlvD6xtJEP5hF0v2-G5EYzOy1gGKsZOUKsWOmgNXDOmGwLl83Rio/exec"; // <-- แทนที่ด้วย URL จริงจาก Deploy > Manage deployments

export default function App() {
  return (
    <iframe
      src={GAS_URL}
      title="ระบบเรียกคิวเอกซเรย์ออนไลน์"
      // สำคัญมาก: อนุญาตให้เนื้อหาข้างใน iframe (หน้าจอทีวีของ Apps Script) ขอขยายเต็มจอได้
      // ถ้าไม่มี 2 บรรทัดนี้ ปุ่ม "ขยายเต็มจอ" จะกดไม่ได้เลย เพราะเบราว์เซอร์บล็อก Fullscreen API
      // ใน iframe ไว้เป็นค่าเริ่มต้นเสมอ ไม่เกี่ยวกับตัวเบราว์เซอร์ที่ใช้
      allow="fullscreen"
      allowFullScreen
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        border: 'none',
        display: 'block',
        overflow: 'hidden'
      }}
    />
  )
}