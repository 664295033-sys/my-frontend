import { supabase } from './supabaseClient';

export async function registerStaff({ fullName, position, username, email, password }) {
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr) throw signUpErr;
  const userId = signUpData.user?.id;
  if (!userId) throw new Error('สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่');

  const { error: profileErr } = await supabase.from('staff').insert({
    id: userId,
    username,
    full_name: fullName,
    position,
    email,
    status: 'pending',
    role: 'staff'
  });
  if (profileErr) throw profileErr;
  return true;
}

export async function loginStaff({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile, error: profileErr } = await supabase
    .from('staff')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (profileErr) throw new Error('ไม่พบข้อมูลโปรไฟล์เจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ');

  if (profile.status !== 'approved') {
    await supabase.auth.signOut();
    throw new Error('บัญชีนี้ยังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ กรุณารอการอนุมัติก่อนเข้าสู่ระบบ');
  }
  if (profile.role === 'blocked') {
    await supabase.auth.signOut();
    throw new Error('บัญชีนี้ถูกปิดกั้นการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
  }
  return profile;
}

export async function logoutStaff() {
  await supabase.auth.signOut();
}

/** เรียกตอนเปิดหน้าเว็บ เพื่อดูว่ามีคนล็อกอินค้างไว้ในเครื่องนี้อยู่แล้วหรือไม่ */
export async function getCurrentStaffProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const { data, error } = await supabase.from('staff').select('*').eq('id', sessionData.session.user.id).single();
  if (error) return null;
  return data;
}

/** ลืมรหัสผ่าน — ใช้ระบบส่งอีเมลในตัวของ Supabase Auth (ไม่ต้องทำระบบรหัส 6 หลักเอง) */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/?resetPassword=1'
  });
  if (error) throw error;
}

/** ใช้ตอนอยู่ในหน้าที่มาจากลิงก์รีเซ็ตรหัสผ่านในอีเมล (Supabase ล็อกอินให้ชั่วคราวอัตโนมัติ) */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ==========================================================
// สำหรับผู้ดูแลระบบ (role === 'admin') เท่านั้น
// ==========================================================
export async function getAllStaff() {
  const { data, error } = await supabase.from('staff').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function setStaffApproval(targetId, approved) {
  const { error } = await supabase.from('staff').update({ status: approved ? 'approved' : 'pending' }).eq('id', targetId);
  if (error) throw error;
}

export async function setStaffRole(targetId, role) {
  const { error } = await supabase.from('staff').update({ role }).eq('id', targetId);
  if (error) throw error;
}