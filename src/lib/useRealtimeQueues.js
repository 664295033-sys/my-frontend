import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { getAllQueues } from './queueApi';

const TABLE = 'xray_queues';

/**
 * Hook สำหรับดึงข้อมูลคิวทั้งหมด และรับการอัปเดตแบบเรียลไทม์จาก Supabase
 * ทุกหน้าจอ (โต๊ะพนักงาน / ทีวี / มือถือคนไข้) ที่ใช้ hook นี้ จะเห็นการเปลี่ยนแปลง
 * ทันทีที่มีใครแก้ข้อมูลในตาราง xray_queues โดยไม่ต้องรอ polling เป็นรอบๆ
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

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel('queues-realtime')
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