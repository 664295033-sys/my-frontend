import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

/**
 * เหตุผลที่ต้องสุ่มชื่อ channel: เหมือนกับ useRealtimeQueues.js — ถ้าใช้ชื่อ channel
 * ตายตัวแล้วมีการเรียก hook นี้มากกว่า 1 instance พร้อมกัน (หรือ React Strict Mode
 * รัน effect ซ้ำตอน dev) จะชนกันจนโยน error "cannot add postgres_changes callbacks
 * after subscribe()" ทำให้แอปทั้งหน้าพัง (หน้าจอขาว)
 */
export function useRealtimeStaff() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const channelNameRef = useRef(
    `staff-changes-${Math.random().toString(36).slice(2)}-${Date.now()}`
  )

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data, error } = await supabase.from('staff').select('*')
      if (!mounted) return
      if (error) console.error('load staff error:', error)
      setStaff(data ?? [])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => load()
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { staff, loading }
}