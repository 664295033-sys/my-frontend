import { supabase } from './supabaseClient';
import { getTypeInfo } from './constants';

const TABLE = 'xray_queues';

function isToday(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export async function getAllQueues() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

function buildQueueNo(queueType, todaysQueues) {
  const prefix = getTypeInfo(queueType).prefix;
  const sameType = todaysQueues.filter(q => q.queue_type === queueType);
  const maxNo = sameType.reduce((max, q) => {
    const n = parseInt(String(q.queue_no).replace(/^[A-Za-z]+/, ''), 10) || 0;
    return Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxNo + 1).padStart(3, '0')}`;
}

/**
 * ออกคิวใหม่
 * @param {{source: 'paper'|'mobile', identifier?: string, queueType?: string}} params
 * คืนค่าเสมอในรูปแบบ { duplicate: boolean, queue: {...} }
 */
export async function insertQueue({ source, identifier, queueType }) {
  // กันคิวซ้ำ (คิวมือถือ): เช็คว่ามีคิวของวันนี้ที่ยังไม่จบ (waiting/calling) ผูกกับเบอร์นี้อยู่แล้วหรือไม่
  if (source === 'mobile' && identifier) {
    const { data: existing, error: findErr } = await supabase
      .from(TABLE)
      .select('*')
      .eq('identifier', identifier)
      .in('status', ['waiting', 'calling']);
    if (findErr) throw findErr;
    const todayExisting = (existing || []).filter(q => isToday(q.created_at));
    if (todayExisting.length > 0) {
      return { duplicate: true, queue: todayExisting[0] };
    }
  }

  // คิวมือถือ (สแกน QR) บังคับเป็น 'opd' เสมอ (คนไข้เดินเข้ามาเองถือเป็นคิว OPD เหมือนออกบัตรกระดาษ)
  const finalType = source === 'mobile' ? 'opd' : (queueType || 'opd');

  const all = await getAllQueues();
  const todaysQueues = all.filter(q => isToday(q.created_at));
  let queueNo = buildQueueNo(finalType, todaysQueues);

  // ลองสร้างคิว ถ้าเกิดชนกันพอดี (มีคนกดพร้อมกันเป๊ะ) ให้ลองเลขถัดไปอีกครั้ง
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        queue_no: queueNo,
        status: 'waiting',
        source,
        identifier: source === 'mobile' ? identifier : null,
        queue_type: finalType
      })
      .select()
      .single();
    if (!error) return { duplicate: false, queue: data };
    const num = parseInt(queueNo.replace(/^[A-Za-z]+/, ''), 10) + 1;
    queueNo = `${getTypeInfo(finalType).prefix}${String(num).padStart(3, '0')}`;
  }
  throw new Error('ไม่สามารถออกเลขคิวได้ กรุณาลองใหม่');
}

/** เรียกคิวถัดไป (คิวที่รอนานที่สุด กรองตามประเภทถ้าระบุ) */
export async function callNext(counterNo, queueType) {
  const all = await getAllQueues();
  let waiting = all.filter(q => q.status === 'waiting');
  if (queueType && queueType !== 'all') {
    waiting = waiting.filter(q => q.queue_type === queueType);
  }
  if (waiting.length === 0) return { error: 'no_waiting' };

  const next = waiting[0];
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'calling', counter_no: counterNo, called_at: new Date().toISOString() })
    .eq('id', next.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** เรียกคิวที่เคยถูกข้าม กลับมาที่ช่องบริการ */
export async function callSkipped(queueId, counterNo) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'calling', counter_no: counterNo, called_at: new Date().toISOString() })
    .eq('id', queueId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function skipQueue(queueId) {
  const { error } = await supabase.from(TABLE).update({ status: 'skipped', counter_no: null }).eq('id', queueId);
  if (error) throw error;
}

export async function completeQueue(queueId) {
  const { error } = await supabase.from(TABLE).update({ status: 'completed' }).eq('id', queueId);
  if (error) throw error;
}

/** รีเซ็ตคิวที่ยัง waiting/calling ทั้งหมด (ประวัติยังเก็บไว้ในตาราง ไม่ถูกลบทิ้ง) */
export async function resetAllQueues() {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: 'reset', counter_no: null })
    .in('status', ['waiting', 'calling']);
  if (error) throw error;
}

// ==========================================================
// รายงานสรุปคิวแยกตามประเภท (รายวัน / รายเดือน / รายปี)
// ดึงจาก view ที่สร้างไว้ใน Supabase — ต้องรัน SQL สร้าง view ก่อนใช้งาน (ดูไฟล์ report_views.sql)
// ==========================================================
export async function getDailySummary() {
  const { data, error } = await supabase.from('daily_queue_summary').select('*').order('report_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getMonthlySummary() {
  const { data, error } = await supabase.from('monthly_queue_summary').select('*').order('report_month', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getYearlySummary() {
  const { data, error } = await supabase.from('yearly_queue_summary').select('*').order('report_year', { ascending: true });
  if (error) throw error;
  return data;
}

// ==========================================================
// ลบข้อมูลคิวออกจากตารางจริง (xray_queues) ตามวัน/เดือน/ปีที่เลือกจากหน้ารายงาน
// ลบตรงที่ตารางต้นทาง ไม่ใช่ที่ view สรุป เพราะ view คำนวณจากตารางนี้อยู่แล้ว
// เมื่อลบเสร็จ ให้เรียก getDailySummary/getMonthlySummary/getYearlySummary ใหม่ที่หน้าเว็บ
// เพื่อให้ตัวเลขที่แสดงตรงกับข้อมูลจริงใน Supabase ทันที
// ==========================================================
export async function deleteQueueSummary(type, value) {
  if (!value) return { ok: false, message: 'กรุณาระบุวัน/เดือน/ปีที่ต้องการลบ' };

  let rangeStart;
  let rangeEnd;

  if (type === 'day') {
    // value เช่น '2026-09-03'
    rangeStart = `${value}T00:00:00`;
    rangeEnd = `${value}T23:59:59.999`;
  } else if (type === 'month') {
    // value เช่น '2026-09'
    const [y, m] = value.split('-');
    if (!y || !m) return { ok: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    rangeStart = `${y}-${m}-01T00:00:00`;
    rangeEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
  } else if (type === 'year') {
    // value เช่น '2026'
    rangeStart = `${value}-01-01T00:00:00`;
    rangeEnd = `${value}-12-31T23:59:59.999`;
  } else {
    return { ok: false, message: 'ประเภทไม่ถูกต้อง' };
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}