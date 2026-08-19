import React, { useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// 1. ตั้งค่า Supabase Client
const SUPABASE_URL = "https://mqyjmuajdqrlouqbztfn.supabase.co"
const SUPABASE_KEY = "sb_publishable_6DUhs44893vDND_2OptDwQ_8rbOs52C" // นำมาจาก Supabase > Project Settings > API
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GAS_URL = "https://script.google.com/macros/s/AKfycbxI-ro5rN_zFz3ZlvD6xtJEP5hF0v2-G5EYzOy1gGKsZOUKsWOmgNXDOmGwLl83Rio/exec"

export default function App() {

  useEffect(() => {
    // 2. ฟังก์ชันดักฟังข้อความที่ส่งมาจาก iframe (GAS)
    const handleMessage = async (event) => {
      // ตรวจสอบข้อมูลคิวที่ส่งมาจากหน้าเว็บ
      if (event.data && event.data.type === 'NEW_QUEUE') {
        const { queueNo, status, counter } = event.data

        // 3. บันทึกลง Supabase ทันที!
        await supabase.from('คิวX-Ray').insert([
          {
            'หมายเลขคิว': queueNo,
            'สถานะ': status || 'การโทร',
            'ช่องบริการ': counter || 1,
            'เวลาออกคิว': new Date().toISOString()
          }
        ])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <iframe
      src={GAS_URL}
      title="ระบบเรียกคิวเอกซเรย์ออนไลน์"
      style={{ width: '100%', height: '100vh', border: 'none' }}
      allow="fullscreen"
    />
  )
}