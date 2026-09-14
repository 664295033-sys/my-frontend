import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { getAllQueues } from './queueApi';

const TABLE = 'xray_queues';

/**
 * Hook สำหรับดึงข้อมูลคิวทั้งหมด และรับการอัปเดตแบบเรียลไทม์จาก Supabase
 * ทุกหน้าจอ (โต๊ะพนักงาน / ทีวี / มือถือคนไข้) ที่ใช้ hook นี้ จะเห็นการเปลี่ยนแปลง
 * ทันทีที่มีใครแก้ข้อมูลในตาราง xray_queues โดยไม่ต้องรอ polling เป็นรอบๆ
 *
 * หมายเหตุสำคัญ: ห้ามตั้งชื่อ channel เป็นค่าคงที่ตายตัวเด็ดขาด เพราะ hook นี้ถูกเรียกใช้
 * พร้อมกันจากหลายจุดในแอป (StaffDeskView, DisplayView, AutoPrintMobileQueueWatcher ฯลฯ)
 * ถ้าใช้ชื่อ channel ซ้ำกัน Supabase client จะคืนอ็อบเจกต์ channel ตัวเดียวกันให้ทุก instance
 * พอ instance แรก subscribe() ไปแล้ว instance ที่สองมาเรียก .on() ซ้ำจะโยน error ทันที
 * ("cannot add postgres_changes callbacks... after subscribe()") ซึ่งเป็นสาเหตุของอาการ
 * หน้าจอขาวที่เจอ จึงต้องสุ่มชื่อ channel ให้ไม่ซ้ำกันในทุก instance/ทุกครั้งที่ effect รันใหม่
 */
export function useRealtimeQueues() {
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllQueues();
      setQueues(data);
    } catch (err) {
      console.error('โหลดข้อมูลคิวไม่สำเร็จ:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ใช้ ref เก็บชื่อ channel ที่สุ่มไว้ครั้งเดียวต่อ instance ของ hook (ไม่สุ่มใหม่ทุก render)
  const channelNameRef = useRef(
    `queues-realtime-${Math.random().toString(36).slice(2)}-${Date.now()}`
  );

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { queues, loading, refresh };
}