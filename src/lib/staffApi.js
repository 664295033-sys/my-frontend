import { supabase } from './supabaseClient';

const TABLE = 'staff';

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function loginStaff(username, password) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .ilike('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: 'not_found', message: 'ไม่พบชื่อบัญชีผู้ใช้นี้ในระบบ' };

  const inputHash = await sha256Hex(password + data.salt);
  if (inputHash !== data.password_hash) {
    return { ok: false, error: 'wrong_password', message: 'รหัสผ่านไม่ถูกต้อง' };
  }
  if (data.role === 'blocked') {
    return { ok: false, error: 'blocked', message: 'บัญชีนี้ถูกปิดกั้นการใช้งานชั่วคราว' };
  }
  if (data.status !== 'approved') {
    return { ok: false, error: 'pending_approval', message: 'บัญชีนี้ยังไม่ได้รับการอนุมัติจากผู้ดูแลระบบ' };
  }

  const { password_hash, salt, ...safeStaff } = data;
  return { ok: true, staff: safeStaff };
}

export async function registerStaff({ fullName, position, username, password, email, inviteCode }) {
  if (inviteCode !== 'XRAY2569') {
    return { ok: false, message: 'รหัสเชิญเข้าร่วมทีมงานไม่ถูกต้อง' };
  }
  if (!password || password.length < 6) {
    return { ok: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  }

  const { count } = await supabase.from(TABLE).select('*', { count: 'exact', head: true });
  const isFirst = !count;

  const salt = generateSalt();
  const password_hash = await sha256Hex(password + salt);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      username,
      password_hash,
      salt,
      full_name: fullName,
      position,
      email,
      status: isFirst ? 'approved' : 'pending',
      role: isFirst ? 'admin' : 'staff'
    })
    .select()
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, staff: data };
}

export async function getAllStaff() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, username, full_name, position, created_at, status, role, avatar_url')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function setStaffApproval(targetId, approved) {
  const { data, error } = await supabase.from(TABLE).update({ status: approved ? 'approved' : 'pending' }).eq('id', targetId).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('อัปเดตไม่สำเร็จ: ไม่มีสิทธิ์แก้ไข (เช็ค Row Level Security ของตาราง staff ใน Supabase ให้อนุญาต UPDATE)');
}

export async function setStaffRole(targetId, role) {
  const { data, error } = await supabase.from(TABLE).update({ role }).eq('id', targetId).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('อัปเดตไม่สำเร็จ: ไม่มีสิทธิ์แก้ไข (เช็ค Row Level Security ของตาราง staff ใน Supabase ให้อนุญาต UPDATE)');
}

export async function resetStaffPassword(targetId, newPassword) {
  const salt = generateSalt();
  const password_hash = await sha256Hex(newPassword + salt);
  const { data, error } = await supabase.from(TABLE).update({ password_hash, salt }).eq('id', targetId).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('รีเซ็ตรหัสผ่านไม่สำเร็จ: ไม่มีสิทธิ์แก้ไข (เช็ค Row Level Security ของตาราง staff ใน Supabase ให้อนุญาต UPDATE)');
}

export async function changeOwnPassword(staffId, oldPassword, newPassword) {
  const { data, error } = await supabase.from(TABLE).select('password_hash, salt').eq('id', staffId).single();
  if (error) throw error;
  const inputHash = await sha256Hex(oldPassword + data.salt);
  if (inputHash !== data.password_hash) {
    return { ok: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  }
  await resetStaffPassword(staffId, newPassword);
  return { ok: true };
}

// ==========================================================
// อัปโหลด/เปลี่ยนรูปโปรไฟล์ของเจ้าหน้าที่ (เก็บเป็น base64 data URL
// ที่ย่อ/บีบอัดขนาดมาแล้วจากฝั่ง client ก่อนส่งมา)
// ต้องมีคอลัมน์ avatar_url (text) ในตาราง staff ก่อนใช้งาน:
//   alter table staff add column if not exists avatar_url text;
// ==========================================================
export async function updateStaffAvatar(staffId, avatarDataUrl) {
  const { error } = await supabase.from(TABLE).update({ avatar_url: avatarDataUrl }).eq('id', staffId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, avatar_url: avatarDataUrl };
}

// ==========================================================
// ลบบัญชีเจ้าหน้าที่ทิ้งถาวร (ใช้ในหน้าจัดการสิทธิ์ โดยผู้ดูแลระบบเท่านั้น)
// ==========================================================
export async function deleteStaff(targetId) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', targetId).select();
  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: 'ลบไม่สำเร็จ: ไม่มีสิทธิ์ลบ (เช็ค Row Level Security ของตาราง staff ใน Supabase ให้อนุญาต DELETE)' };
  return { ok: true };
}

// ==========================================================
// ลืมรหัสผ่าน (self-service ฝั่ง client ล้วน ไม่มีเซิร์ฟเวอร์ส่งอีเมลจริง)
// ตรวจสอบว่า username + email ตรงกับที่ลงทะเบียนไว้ ถ้าตรง อนุญาตให้ตั้งรหัสผ่านใหม่ได้เลย
// ==========================================================
export async function resetPasswordByEmail(username, email, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, email')
    .ilike('username', username)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'ไม่พบชื่อบัญชีผู้ใช้นี้ในระบบ' };
  if (!data.email || data.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return { ok: false, message: 'อีเมลไม่ตรงกับที่ลงทะเบียนไว้กับบัญชีนี้' };
  }
  await resetStaffPassword(data.id, newPassword);
  return { ok: true };
}