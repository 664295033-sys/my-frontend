import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // เตือนตั้งแต่ตอนโหลดแอป ถ้าลืมสร้างไฟล์ .env หรือใส่ค่าไม่ครบ
  console.error('ไม่พบ VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY กรุณาตรวจสอบไฟล์ .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)