import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeQueues } from './lib/useRealtimeQueues';
import { useRealtimeStaff } from './lib/useRealtimeStaff';
import { insertQueue, callNext, skipQueue, completeQueue, callSkipped, resetAllQueues, getDailySummary, getMonthlySummary, getYearlySummary } from './lib/queueApi';
import { loginStaff, registerStaff, setStaffApproval, setStaffRole, resetStaffPassword, changeOwnPassword, updateStaffAvatar, deleteStaff, requestPasswordResetCode, verifyResetCodeAndSetPassword } from './lib/staffApi';
import { QUEUE_TYPES, getTypeInfo, getSourceLabel, ROLE_INFO, PREFIX_READING } from './lib/constants';
import { getTodayToken, buildScanUrl } from './lib/Qrtoken';
import { printQueueTicket } from './lib/printTicket';

const COUNTERS = [1, 2];
const STAFF_STORAGE_KEY = 'xray_staff_session';

// โลโก้โรงพยาบาลสงขลา (สีเขียว) — ใช้ที่หน้าจอมือถือคนไข้
const HOSPITAL_LOGO_GREEN_SRC = "https://cdn.phototourl.com/free/2026-07-14-29a6fb0f-2409-4383-afe8-f6c4c0c39943.jpg";

// ไอคอนฟิล์มเอกซเรย์แบบมินิมอล — ใช้เป็น badge ทับมุมโลโก้ในหน้าจอมือถือคนไข้
function XRayIcon({ size = 24, className = "" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.5" y="3" width="19" height="18" rx="2.2" />
      <path d="M8 6.5c1.4 1 1.4 2.5 0 3.5s-1.4 2.5 0 3.5 1.4 2.5 0 3.8" />
      <path d="M12 5.5c1.4 1.1 1.4 2.7 0 3.8s-1.4 2.7 0 3.8 1.4 2.7 0 4.4" />
      <path d="M16 6.5c1.4 1 1.4 2.5 0 3.5s-1.4 2.5 0 3.5 1.4 2.5 0 3.8" />
      <circle cx="8" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ไอคอนถังขยะ — ใช้กับปุ่มลบบัญชีเจ้าหน้าที่ในหน้าจัดการสิทธิ์
function TrashIcon({ size = 14, className = "" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function getStoredStaff() {
  try {
    const raw = localStorage.getItem(STAFF_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* no-op */ }
  return null;
}
function saveStaffToStorage(staff) {
  try { localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff)); } catch (e) { /* no-op */ }
}
function clearStoredStaff() {
  try { localStorage.removeItem(STAFF_STORAGE_KEY); } catch (e) { /* no-op */ }
}

// ==========================================================
// ตรวจ URL ตอนเปิดแอปว่ามาจากการสแกน QR หรือไม่ (?scan=1&qt=รหัสวันนี้)
// ==========================================================
function getScanParams() {
  if (typeof window === 'undefined') return { isScan: false, qrTokenParam: null };
  try {
    const params = new URLSearchParams(window.location.search);
    return { isScan: params.get('scan') === '1', qrTokenParam: params.get('qt') };
  } catch (e) {
    return { isScan: false, qrTokenParam: null };
  }
}

// ==========================================================
// เสียงต่างๆ ในระบบ — WebAudio ล้วนๆ ไม่ต้องมีไฟล์เสียงแนบ
// 1) playBeep          -> เสียงเรียกคิว (ขึ้นจอทีวี / แจ้งเตือนคนไข้ที่มือถือ / เรียกซ้ำ)
// 2) playNewQueueChime -> เสียงคิวใหม่เข้ามาในระบบ (ออกบัตร/สแกน QR สำเร็จ)
// 3) playSkipAlert     -> เสียงเตือนเมื่อมีคิวถูกข้าม/ไม่มาแสดงตัว
// ==========================================================
function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };
    playTone(880, now, 0.18);
    playTone(1175, now + 0.2, 0.28);
  } catch (e) { /* no-op */ }
}

function playNewQueueChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) { /* no-op */ }
}

function playSkipAlert() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };
    playTone(320, now, 0.15);
    playTone(320, now + 0.22, 0.15);
  } catch (e) { /* no-op */ }
}

// ==========================================================
// เสียงเรียกคิวภาษาไทย (Text-to-Speech) — เลือกเสียงไทยที่ดีที่สุดที่เครื่องมีให้
// เก็บ voice ที่เลือกไว้ในตัวแปร module-level กันเลือกซ้ำทุกครั้งที่เรียก
// ==========================================================
let cachedThaiVoice = null;
let thaiVoicePicked = false;
function pickBestThaiVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const thaiVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('th'));
  if (thaiVoices.length === 0) { thaiVoicePicked = true; return null; }
  const scored = thaiVoices.map(v => {
    let score = 0;
    const name = v.name.toLowerCase();
    if (name.includes('google')) score += 3;
    if (name.includes('neural') || name.includes('natural') || name.includes('premium')) score += 3;
    if (!v.localService) score += 1;
    return { voice: v, score };
  });
  scored.sort((a, b) => b.score - a.score);
  cachedThaiVoice = scored[0].voice;
  thaiVoicePicked = true;
  return cachedThaiVoice;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', pickBestThaiVoice);
}

// พูดหมายเลขคิวเป็นภาษาไทย เช่น "ขอเชิญหมายเลข เอ็กซ์ ศูนย์ ศูนย์ หนึ่ง ที่ช่องบริการที่ 1"
function speakQueue(queueNo, counterNo) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (!thaiVoicePicked) pickBestThaiVoice();
  const queueNoStr = String(queueNo);
  const prefixLetter = queueNoStr.charAt(0).toUpperCase();
  const prefixReading = PREFIX_READING[prefixLetter] || prefixLetter;
  const digits = queueNoStr.slice(1).split('').join(' ');
  const text = `ขอเชิญหมายเลข, ${prefixReading}, ${digits}, ที่ช่องบริการที่ ${counterNo}`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'th-TH';
  utterance.rate = 0.62;
  utterance.pitch = 1.0;
  utterance.volume = 1;
  if (cachedThaiVoice) utterance.voice = cachedThaiVoice;
  window.speechSynthesis.speak(utterance);
}

// ==========================================================
// โหลด html2canvas จาก CDN แบบ lazy (ใช้ตอนบันทึกภาพบัตรคิวบนมือถือคนไข้เท่านั้น)
// ==========================================================
let html2canvasLoadingPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (html2canvasLoadingPromise) return html2canvasLoadingPromise;
  html2canvasLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('โหลดตัวช่วยบันทึกภาพไม่สำเร็จ ลองใหม่อีกครั้ง'));
    document.head.appendChild(script);
  });
  return html2canvasLoadingPromise;
}
// ==========================================================
function resizeImageToDataUrl(file, maxSize = 200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพที่ถูกต้อง'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState(3); // 1 login, 2 desk, 3 display, 4 staff mgmt
  const [staff, setStaff] = useState(null);
  const [scanInfo] = useState(getScanParams); // อ่านครั้งเดียวตอนโหลดหน้า

  // เมนูโปรไฟล์มุมขวาบน + อัปโหลดรูป + เปลี่ยนรหัสผ่าน
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);

  useEffect(() => {
    const stored = getStoredStaff();
    if (stored) setStaff(stored);
  }, []);

  // ปิดเมนูโปรไฟล์เมื่อคลิกนอกกล่องเมนู
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleLogout = () => {
    setStaff(null);
    clearStoredStaff();
    setActiveTab(1);
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const result = await updateStaffAvatar(staff.id, dataUrl);
      if (result.ok) {
        const updated = { ...staff, avatar_url: result.avatar_url };
        setStaff(updated);
        saveStaffToStorage(updated);
      } else {
        alert(result.message || 'เปลี่ยนรูปโปรไฟล์ไม่สำเร็จ');
      }
    } catch (err) {
      alert('ไม่สามารถประมวลผลรูปภาพนี้ได้ กรุณาลองใหม่');
    }
    setAvatarUploading(false);
  };

  const handleChangePasswordSubmit = async () => {
    setChangePasswordError('');
    const { oldPassword, newPassword, confirmPassword } = changePasswordForm;
    if (!oldPassword || !newPassword || !confirmPassword) {
      setChangePasswordError('กรุณากรอกข้อมูลให้ครบทุกช่อง');
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setChangePasswordLoading(true);
    try {
      const result = await changeOwnPassword(staff.id, oldPassword, newPassword);
      if (result.ok) {
        setShowChangePasswordModal(false);
        setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
        alert('เปลี่ยนรหัสผ่านสำเร็จแล้ว');
      } else {
        setChangePasswordError(result.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
    } catch (err) {
      setChangePasswordError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    }
    setChangePasswordLoading(false);
  };

  // ==========================================================
  // ถ้าเปิดมาจากการสแกน QR จริง -> แสดงเฉพาะหน้าคนไข้ ซ่อนแถบเมนู/แท็บทั้งหมด
  // ==========================================================
  if (scanInfo.isScan) {
    const todayToken = getTodayToken();
    const isExpired = scanInfo.qrTokenParam !== todayToken;
    return (
      <div className="min-h-screen bg-emerald-50/60 font-sans text-gray-900 flex items-center justify-center p-4">
        {isExpired ? <QrExpiredView /> : <MobileQueueView />}
      </div>
    );
  }

  // ==========================================================
  // ถ้ายังไม่ได้ล็อกอิน -> โชว์แค่หน้าล็อกอินอย่างเดียว ไม่มีแถบเมนู/แท็บใดๆ ทั้งสิ้น
  // ==========================================================
  if (!staff) {
    return (
      <div className="min-h-screen bg-emerald-50/60 font-sans text-gray-900 flex flex-col">
        <header className="bg-white shadow-sm border-b border-emerald-100 py-4">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="text-2xl font-bold tracking-tight text-emerald-600">Queue<span className="text-gray-800">System</span></h1>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <LoginView onLoggedIn={(s) => { setStaff(s); saveStaffToStorage(s); setActiveTab(2); }} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50/60 font-sans text-gray-900 pb-12">
      <header className="bg-white shadow-sm border-b border-emerald-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-emerald-600">Queue<span className="text-gray-800">System</span></h1>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 p-1.5 rounded-xl overflow-x-auto">
              {[
                { id: 2, label: 'โต๊ะพนักงาน' },
                { id: 3, label: 'จอแสดงผล (ทีวี)' },
                { id: 6, label: 'รายงานสรุปคิว' },
                ...(staff.role === 'admin' ? [{ id: 4, label: 'จัดการสิทธิ์เจ้าหน้าที่' }] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 4 && staff.role !== 'admin') { return; }
                    setActiveTab(tab.id);
                  }}
                  className={`px-5 py-2.5 rounded-lg font-semibold text-sm whitespace-nowrap transition ${activeTab === tab.id ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {staff && (
              <div className="relative shrink-0" ref={profileMenuRef}>
                <input
                  type="file"
                  accept="image/*"
                  ref={avatarInputRef}
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => setShowProfileMenu(s => !s)}
                  title={staff.full_name}
                  className="w-11 h-11 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-2 border-emerald-200 flex items-center justify-center transition active:scale-95 overflow-hidden"
                >
                  {staff.avatar_url ? (
                    <img src={staff.avatar_url} alt={staff.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-sm">{(staff.full_name || staff.username || '?').trim().charAt(0).toUpperCase()}</span>
                  )}
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div className="p-4 flex items-center gap-3 border-b border-gray-100 bg-emerald-50/50">
                      <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 overflow-hidden">
                        {staff.avatar_url ? (
                          <img src={staff.avatar_url} alt={staff.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black">{(staff.full_name || staff.username || '?').trim().charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-800 text-sm truncate">{staff.full_name}</p>
                        {staff.position && <p className="text-xs text-gray-500 truncate">{staff.position}</p>}
                        {staff.role === 'admin' && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                            ผู้ดูแลระบบ
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowProfileMenu(false); avatarInputRef.current && avatarInputRef.current.click(); }}
                      disabled={avatarUploading}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      {avatarUploading ? 'กำลังอัปโหลด...' : 'เปลี่ยนรูปโปรไฟล์'}
                    </button>
                    <button
                      onClick={() => { setShowProfileMenu(false); setChangePasswordError(''); setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' }); setShowChangePasswordModal(true); }}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition border-t border-gray-100"
                    >
                      เปลี่ยนรหัสผ่าน
                    </button>
                    <button
                      onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition border-t border-gray-100"
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !changePasswordLoading && setShowChangePasswordModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-gray-800 text-sm">เปลี่ยนรหัสผ่าน</h4>
              <button onClick={() => setShowChangePasswordModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">รหัสผ่านปัจจุบัน</label>
                <input
                  type="password"
                  value={changePasswordForm.oldPassword}
                  onChange={(e) => setChangePasswordForm(f => ({ ...f, oldPassword: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label>
                <input
                  type="password"
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">ยืนยันรหัสผ่านใหม่</label>
                <input
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePasswordSubmit(); }}
                />
              </div>
              {changePasswordError && <p className="text-red-500 text-xs font-bold text-center">{changePasswordError}</p>}
              <button
                onClick={handleChangePasswordSubmit}
                disabled={changePasswordLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl"
              >
                {changePasswordLoading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {activeTab === 2 && <StaffDeskView />}
        {activeTab === 3 && <DisplayView />}
        {activeTab === 6 && <ReportView />}
        {activeTab === 4 && staff.role === 'admin' && <StaffManagementView currentStaffId={staff.id} />}
      </main>
    </div>
  );
}

// ==========================================================
// หน้าเข้าสู่ระบบ / สมัครสมาชิกเจ้าหน้าที่
// ==========================================================
function LoginView({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ fullName: '', position: '', username: '', password: '', email: '', inviteCode: '' });

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState('verify'); // 'verify' | 'code'
  const [forgotForm, setForgotForm] = useState({ username: '', email: '', code: '', newPassword: '', confirmPassword: '' });
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const openForgotModal = () => {
    setForgotStep('verify');
    setForgotForm({ username: '', email: '', code: '', newPassword: '', confirmPassword: '' });
    setForgotError('');
    setForgotInfo('');
    setShowForgotModal(true);
  };

  const handleSendResetCode = async () => {
    setForgotError('');
    if (!forgotForm.username.trim() || !forgotForm.email.trim()) {
      setForgotError('กรุณากรอกชื่อบัญชีและอีเมลให้ครบ');
      return;
    }
    setForgotLoading(true);
    try {
      const result = await requestPasswordResetCode(forgotForm.username.trim(), forgotForm.email.trim());
      if (result.ok) {
        setForgotInfo(`ส่งรหัสยืนยันไปที่ ${forgotForm.email.trim()} แล้ว กรุณาตรวจสอบอีเมล (รวมถึงถังขยะ/สแปม)`);
        setForgotStep('code');
      } else {
        setForgotError(result.message || 'ทำรายการไม่สำเร็จ');
      }
    } catch (err) {
      setForgotError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    }
    setForgotLoading(false);
  };

  const handleForgotReset = async () => {
    setForgotError('');
    if (!forgotForm.code.trim()) {
      setForgotError('กรุณากรอกรหัสยืนยันที่ได้รับทางอีเมล');
      return;
    }
    if (!forgotForm.newPassword || forgotForm.newPassword.length < 6) {
      setForgotError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      setForgotError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setForgotLoading(true);
    try {
      const result = await verifyResetCodeAndSetPassword(forgotForm.username.trim(), forgotForm.code.trim(), forgotForm.newPassword);
      if (result.ok) {
        setShowForgotModal(false);
        setLoginForm({ username: forgotForm.username.trim(), password: '' });
        alert('ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
      } else {
        setForgotError(result.message || 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
      }
    } catch (err) {
      setForgotError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    }
    setForgotLoading(false);
  };

  const handleResendCode = () => {
    setForgotStep('verify');
    setForgotForm(f => ({ ...f, code: '' }));
    setForgotError('');
    setForgotInfo('');
  };

  const handleLogin = async () => {
    setError('');
    if (!loginForm.username.trim() || !loginForm.password) {
      setError('กรุณากรอกชื่อบัญชีผู้ใช้และรหัสผ่านให้ครบ');
      return;
    }
    setLoading(true);
    try {
      const result = await loginStaff(loginForm.username.trim(), loginForm.password);
      if (result.ok) {
        onLoggedIn(result.staff);
      } else {
        setError(result.message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setError('');
    const { fullName, username, password } = registerForm;
    if (!fullName.trim() || !username.trim() || !password) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
      return;
    }
    setLoading(true);
    try {
      const result = await registerStaff(registerForm);
      if (result.ok) {
        setMode('login');
        setLoginForm({ username: result.staff.username, password: '' });
        setError('');
        alert('ลงทะเบียนสำเร็จ กรุณาเข้าสู่ระบบด้วยบัญชีที่สร้างไว้');
      } else {
        setError(result.message || 'ลงทะเบียนไม่สำเร็จ');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
        <div className="flex">
          <button onClick={() => { setMode('login'); setError(''); }} className={`flex-1 py-4 text-sm font-bold ${mode === 'login' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50' : 'text-gray-400'}`}>เข้าสู่ระบบ</button>
          <button onClick={() => { setMode('register'); setError(''); }} className={`flex-1 py-4 text-sm font-bold ${mode === 'register' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50' : 'text-gray-400'}`}>สมัครสมาชิกเจ้าหน้าที่</button>
        </div>
        <div className="p-6 sm:p-8 space-y-4">
          {mode === 'login' ? (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">บัญชีผู้ใช้งาน (Username)</label>
                <input type="text" value={loginForm.username} onChange={(e) => setLoginForm(f => ({ ...f, username: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1.5">รหัสผ่าน</label>
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              </div>
              {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
              <button onClick={handleLogin} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
              <button type="button" onClick={openForgotModal} className="w-full text-center text-xs font-bold text-emerald-600 hover:underline">
                ลืมรหัสผ่าน?
              </button>
            </>
          ) : (
            <>
              <input type="text" placeholder="ชื่อ-นามสกุล" value={registerForm.fullName} onChange={(e) => setRegisterForm(f => ({ ...f, fullName: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              <input type="text" placeholder="ตำแหน่งงาน" value={registerForm.position} onChange={(e) => setRegisterForm(f => ({ ...f, position: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              <input type="text" placeholder="ชื่อบัญชีผู้ใช้" value={registerForm.username} onChange={(e) => setRegisterForm(f => ({ ...f, username: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              <input type="email" placeholder="อีเมล" value={registerForm.email} onChange={(e) => setRegisterForm(f => ({ ...f, email: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              <input type="password" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)" value={registerForm.password} onChange={(e) => setRegisterForm(f => ({ ...f, password: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              <input type="text" placeholder="รหัสเชิญเข้าร่วมทีมงาน" value={registerForm.inviteCode} onChange={(e) => setRegisterForm(f => ({ ...f, inviteCode: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5" />
              {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
              <button onClick={handleRegister} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
                {loading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
              </button>
            </>
          )}
        </div>
      </div>

      {showForgotModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !forgotLoading && setShowForgotModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-gray-800 text-sm">ลืมรหัสผ่าน</h4>
              <button onClick={() => setShowForgotModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {forgotStep === 'verify' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">กรอกชื่อบัญชีและอีเมลที่ลงทะเบียนไว้ตอนสมัคร ระบบจะส่งรหัสยืนยัน 6 หลักไปให้ทางอีเมลเพื่อใช้ตั้งรหัสผ่านใหม่</p>
                <input
                  type="text"
                  placeholder="ชื่อบัญชีผู้ใช้ (Username)"
                  value={forgotForm.username}
                  onChange={(e) => { setForgotForm(f => ({ ...f, username: e.target.value })); setForgotError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
                <input
                  type="email"
                  placeholder="อีเมลที่ลงทะเบียนไว้"
                  value={forgotForm.email}
                  onChange={(e) => { setForgotForm(f => ({ ...f, email: e.target.value })); setForgotError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendResetCode(); }}
                />
                {forgotError && <p className="text-red-500 text-xs font-bold text-center">{forgotError}</p>}
                <button onClick={handleSendResetCode} disabled={forgotLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl">
                  {forgotLoading ? 'กำลังส่งรหัสยืนยัน...' : 'ส่งรหัสยืนยันไปยังอีเมล'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {forgotInfo && (
                  <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{forgotInfo}</p>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="รหัสยืนยัน 6 หลักจากอีเมล"
                  value={forgotForm.code}
                  onChange={(e) => { setForgotForm(f => ({ ...f, code: e.target.value.replace(/[^\d]/g, '') })); setForgotError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-center text-lg font-black tracking-[0.3em]"
                />
                <input
                  type="password"
                  placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                  value={forgotForm.newPassword}
                  onChange={(e) => { setForgotForm(f => ({ ...f, newPassword: e.target.value })); setForgotError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                />
                <input
                  type="password"
                  placeholder="ยืนยันรหัสผ่านใหม่"
                  value={forgotForm.confirmPassword}
                  onChange={(e) => { setForgotForm(f => ({ ...f, confirmPassword: e.target.value })); setForgotError(''); }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleForgotReset(); }}
                />
                {forgotError && <p className="text-red-500 text-xs font-bold text-center">{forgotError}</p>}
                <button onClick={handleForgotReset} disabled={forgotLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl">
                  {forgotLoading ? 'กำลังบันทึก...' : 'ยืนยันและตั้งรหัสผ่านใหม่'}
                </button>
                <button onClick={handleResendCode} disabled={forgotLoading} className="w-full text-xs text-emerald-600 font-semibold text-center hover:underline">
                  ยังไม่ได้รับรหัส? ขอรหัสใหม่
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================
// หน้าโต๊ะพนักงาน — มีปุ่ม "เรียกซ้ำ" + ปริ้นบัตรคิวทันทีที่ออกบัตร OPD/IPD/ER
// ==========================================================
function StaffDeskView() {
  const { queues } = useRealtimeQueues();
  const [selectedCounter, setSelectedCounter] = useState(1);
  const [callTypeFilter, setCallTypeFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const prevWaitingCountRef = useRef(null);

  const waitingQueues = queues.filter(q => q.status === 'waiting');
  const skippedQueues = queues.filter(q => q.status === 'skipped');
  const activeQueue = queues.find(q => q.status === 'calling' && q.counter_no === selectedCounter) || null;

  // เสียงแจ้งเตือนที่โต๊ะพนักงานเมื่อมีคิวใหม่เข้ามาในระบบ (กันไม่ให้พลาดคิวที่คนไข้สแกน QR เอง)
  useEffect(() => {
    if (prevWaitingCountRef.current !== null && waitingQueues.length > prevWaitingCountRef.current) {
      playNewQueueChime();
    }
    prevWaitingCountRef.current = waitingQueues.length;
  }, [waitingQueues.length]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { console.error(err.message); alert(err.message); }
    setBusy(false);
  };

  // ต้องเปิดหน้าต่างพิมพ์แบบ synchronous ก่อน await ใดๆ ไม่งั้นเบราว์เซอร์บล็อก popup
  const runInsertAndPrint = async (queueType) => {
    const printWindow = window.open('', '_blank', 'width=380,height=640');
    setBusy(true);
    try {
      const result = await insertQueue({ source: 'paper', queueType });
      playNewQueueChime();
      printQueueTicket(result.queue, printWindow);
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close();
      console.error(err.message);
      alert(err.message);
    }
    setBusy(false);
  };

  const handleRecall = () => {
    if (!activeQueue) return;
    playBeep();
    speakQueue(activeQueue.queue_no, selectedCounter);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-white py-2 px-3 rounded-lg shadow-sm border border-emerald-100 flex-wrap">
        <h3 className="text-sm font-bold text-gray-500">ห้องทำงานแผนกเอกซเรย์ โรงพยาบาลสงขลา</h3>
        <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
          {Object.entries(QUEUE_TYPES).filter(([k]) => k !== 'xray').map(([key, info]) => {
            const count = queues.filter(q => q.queue_type === key && q.status === 'waiting').length;
            return (
              <div key={key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${info.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${info.dotClass}`}></span><span>{info.shortLabel}</span><span className="font-black">{count}</span>
              </div>
            );
          })}
        </div>
        <button onClick={() => run(resetAllQueues)} disabled={busy} className="ml-auto bg-red-50 hover:bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-md text-[10px] disabled:opacity-50">รีเซ็ตระบบคิวทั้งหมด</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3">
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-lg shadow-sm py-2 px-2.5 border border-emerald-100">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[11px] font-bold text-gray-800">คิวที่เพิ่งเข้ามา</h3>
              <span className="text-[10px] font-bold text-gray-500 ml-auto">รอทั้งหมด {waitingQueues.length} คิว</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {waitingQueues.map(q => (
                <div key={q.id} className="flex items-center gap-0.5 px-1 py-0.5 rounded border font-bold text-[9px] bg-gray-50 border-gray-200 text-gray-600">
                  <span>{q.queue_no}</span>
                  <span className={`text-[7px] font-bold px-0.5 rounded ${getTypeInfo(q.queue_type).badgeClass}`}>{getTypeInfo(q.queue_type).shortLabel}</span>
                </div>
              ))}
              {waitingQueues.length === 0 && <p className="text-gray-400 italic text-xs">ยังไม่มีคิวใหม่</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-2.5 border border-emerald-100 space-y-2">
            <h4 className="font-bold text-xs text-gray-800">ออกบัตรคิวกระดาษให้คนไข้</h4>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => runInsertAndPrint('opd')} disabled={busy} className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold py-2 rounded-md text-[10px] disabled:opacity-50">OPD</button>
              <button onClick={() => runInsertAndPrint('ipd')} disabled={busy} className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold py-2 rounded-md text-[10px] disabled:opacity-50">IPD</button>
              <button onClick={() => runInsertAndPrint('emergency')} disabled={busy} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold py-2 rounded-md text-[10px] disabled:opacity-50">ฉุกเฉิน ER</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-3 border border-emerald-100">
            <h3 className="text-sm font-bold text-red-600 mb-2">คิวที่ถูกข้าม</h3>
            <div className="space-y-2">
              {skippedQueues.map(q => (
                <div key={q.id} className="bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 text-xs">
                  <span>{q.queue_no}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {COUNTERS.map(c => (
                      <button key={c} onClick={() => run(async () => { await callSkipped(q.id, c); playBeep(); speakQueue(q.queue_no, c); })} disabled={busy} className="px-1.5 py-0.5 text-[10px] hover:bg-red-200 rounded-md">ช่อง{c}</button>
                    ))}
                  </div>
                </div>
              ))}
              {skippedQueues.length === 0 && <p className="text-gray-400 italic text-xs">ไม่มีคิวที่ถูกข้าม</p>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-emerald-100 flex flex-col">
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-[11px] font-bold text-gray-500 block mb-1">เลือกช่องบริการ</label>
              <select value={selectedCounter} onChange={(e) => setSelectedCounter(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold">
                {COUNTERS.map(c => <option key={c} value={c}>ช่องที่ {c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-gray-500 block mb-1">เลือกประเภทคิวที่จะเรียก</label>
              <select value={callTypeFilter} onChange={(e) => setCallTypeFilter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold">
                <option value="all">ทั้งหมด (เรียงตามลำดับ)</option>
                {Object.entries(QUEUE_TYPES).filter(([k]) => k !== 'xray').map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-4 bg-emerald-50/40 rounded-xl mb-3 border border-emerald-100">
            <p className="text-xs text-gray-500 mb-1">คิวที่เรียกปัจจุบัน (ช่องที่ {selectedCounter})</p>
            <div className="text-6xl font-black text-emerald-600 tracking-tight">{activeQueue ? activeQueue.queue_no : '- - -'}</div>
            {activeQueue && (
              <div className="mt-4 flex gap-1.5">
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getTypeInfo(activeQueue.queue_type).badgeClass}`}>{getTypeInfo(activeQueue.queue_type).label}</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-700">{getSourceLabel(activeQueue.source).text}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => run(async () => { const called = await callNext(selectedCounter, callTypeFilter); playBeep(); if (called && called.queue_no) speakQueue(called.queue_no, selectedCounter); })} disabled={busy || activeQueue != null} className="col-span-2 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-100 disabled:text-gray-400">เรียกคิวถัดไป</button>
            <button onClick={handleRecall} disabled={busy || !activeQueue} className="py-2.5 rounded-xl font-semibold text-sm bg-amber-100 hover:bg-amber-200 text-amber-700 disabled:bg-gray-100 disabled:text-gray-400">เรียกซ้ำ</button>
            <button onClick={() => activeQueue && run(async () => { await skipQueue(activeQueue.id); playSkipAlert(); })} disabled={busy || !activeQueue} className="py-2.5 rounded-xl font-semibold text-sm bg-red-100 hover:bg-red-200 text-red-700 disabled:bg-gray-100 disabled:text-gray-400">ข้ามคิว</button>
            <button onClick={() => activeQueue && run(() => completeQueue(activeQueue.id))} disabled={busy || !activeQueue} className="col-span-2 py-2.5 rounded-xl font-semibold text-sm bg-green-100 hover:bg-green-200 text-green-700 disabled:bg-gray-100 disabled:text-gray-400">บริการเสร็จสิ้น</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// หน้าจอแสดงผล (ทีวี) — โลโก้, แถบประกาศวิ่ง, QR, ปุ่มเต็มจอ, ประวัติคิว, เสียงเรียกคิว/คิวเข้าใหม่/ข้ามคิว
// ==========================================================
function DisplayView() {
  const { queues } = useRealtimeQueues();
  const displayRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeString, setTimeString] = useState('');
  const [dateString, setDateString] = useState('');
  const [qrToken, setQrToken] = useState(getTodayToken());

  const prevCallingIdsRef = useRef({ 1: null, 2: null });
  const prevWaitingCountRef = useRef(null);
  const prevSkippedCountRef = useRef(null);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateString(now.toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    }, 1000);
    // เช็ครหัส QR ประจำวันซ้ำเป็นระยะ เผื่อจอทีวีเปิดค้างไว้ข้ามเที่ยงคืน จะได้อัปเดต QR ให้เองอัตโนมัติ
    const tokenTimer = setInterval(() => setQrToken(getTodayToken()), 60000);
    return () => {
      clearInterval(clockTimer);
      clearInterval(tokenTimer);
    };
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      displayRef.current && displayRef.current.requestFullscreen && displayRef.current.requestFullscreen().catch(() => {
        alert('เบราว์เซอร์นี้ไม่รองรับการขยายเต็มจอ');
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  const currentCalling = {
    1: queues.find(q => q.status === 'calling' && q.counter_no === 1) || null,
    2: queues.find(q => q.status === 'calling' && q.counter_no === 2) || null
  };

  const waitingQueues = queues.filter(q => q.status === 'waiting');
  const skippedQueues = queues.filter(q => q.status === 'skipped');

  // เสียงเรียกคิวขึ้นจอทีวี — ดังทุกครั้งที่มีคิวใหม่ถูกเรียกที่ช่องใดช่องหนึ่ง
  useEffect(() => {
    COUNTERS.forEach(c => {
      const current = currentCalling[c];
      const currentId = current ? current.id : null;
      if (currentId && currentId !== prevCallingIdsRef.current[c]) {
        playBeep();
      }
      prevCallingIdsRef.current[c] = currentId;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCalling[1]?.id, currentCalling[2]?.id]);

  // เสียงคิวใหม่เข้ามาในระบบ
  useEffect(() => {
    if (prevWaitingCountRef.current !== null && waitingQueues.length > prevWaitingCountRef.current) {
      playNewQueueChime();
    }
    prevWaitingCountRef.current = waitingQueues.length;
  }, [waitingQueues.length]);

  // เสียงเตือนเมื่อมีคิวถูกข้าม
  useEffect(() => {
    if (prevSkippedCountRef.current !== null && skippedQueues.length > prevSkippedCountRef.current) {
      playSkipAlert();
    }
    prevSkippedCountRef.current = skippedQueues.length;
  }, [skippedQueues.length]);

  const activeIds = COUNTERS.map(c => currentCalling[c]?.id).filter(Boolean);
  const recentHistory = [...queues]
    .filter(q => (q.status === 'calling' || q.status === 'completed') && !activeIds.includes(q.id))
    .sort((a, b) => new Date(b.called_at || b.created_at) - new Date(a.called_at || a.created_at))
    .slice(0, 6);

  const skippedText = skippedQueues.length > 0
    ? `คิวที่ข้ามหรือเรียกแล้วไม่แสดงตัว: ${skippedQueues.map(q => q.queue_no).join(', ')} (กรุณาสแกน QR Code เพื่อรับคิวใหม่ค่ะ)`
    : 'ขณะนี้ไม่มีคิวที่ถูกข้ามหรือตกหล่นในระบบ';

  const scanBaseUrl = window.location.origin + window.location.pathname;
  const scanUrl = buildScanUrl(scanBaseUrl, qrToken);
  const qrCodeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(scanUrl)}`;

  const counterStyles = {
    1: { bgColor: 'bg-[#10309c]', borderColor: 'border-[#1b43c4]', headerTextColor: 'text-[#ffd700]' },
    2: { bgColor: 'bg-[#0e8345]', borderColor: 'border-[#159c55]', headerTextColor: 'text-[#ccff00]' }
  };

  return (
    <div
      ref={displayRef}
      className={`bg-black shadow-2xl flex flex-col justify-between relative overflow-hidden text-white font-sans ${isFullscreen ? 'w-screen h-screen rounded-none border-0' : 'min-h-[80vh] rounded-3xl border border-gray-800'
        }`}
    >
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'ออกจากโหมดเต็มจอ' : 'ขยายเต็มจอ'}
        className="absolute top-3 right-3 z-30 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white flex items-center justify-center transition active:scale-95 border border-white/20"
      >
        {isFullscreen ? '⤡' : '⤢'}
      </button>

      <div className="bg-white text-black py-4 px-8 flex justify-between items-center shadow-lg z-10 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#0e8345] rounded-full flex items-center justify-center text-white font-black text-xl shadow-md border-2 border-emerald-100">X</div>
          <div className="hidden sm:block text-left">
            <span className="text-xs font-bold text-emerald-600 block tracking-wider uppercase">X-Ray Department</span>
            <span className="text-[10px] text-gray-400 block font-medium">แผนกเอกซเรย์ โรงพยาบาลสงขลา</span>
          </div>
        </div>
        <div className="text-center flex-grow">
          <h2 className="text-3xl font-black text-[#10309c] tracking-wide">หมายเลขเรียกเอกซเรย์</h2>
          <p className="text-xs font-semibold text-gray-500 mt-1">{dateString} • {timeString}</p>
        </div>
        <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 bg-emerald-50 border-2 border-emerald-200 text-emerald-600 font-black text-2xl">
          SKH
        </div>
      </div>

      <div className="bg-[#102d94] text-white py-3 px-6 border-b border-blue-900 z-10 flex items-center gap-4 overflow-hidden relative shadow-inner w-full">
        <div className="bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-md uppercase tracking-wider flex items-center gap-1.5 shrink-0 z-20 shadow-md">
          <span className="w-2 h-2 rounded-full bg-white animate-ping"></span><span>ประกาศสำคัญ</span>
        </div>
        <div className="relative flex-1 overflow-hidden h-6 flex items-center z-10">
          <div className="marquee-track font-bold text-base md:text-lg text-[#ccff00]">
            เรียกคิวรับบริการเอกซเรย์ ช่องที่ 1 - 2 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <span className="text-white font-black">|</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <span className="text-red-400">⚠️ {skippedText}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 py-4 flex-grow items-stretch z-10 bg-gray-950">
        <div className="flex flex-col border-2 border-gray-800 bg-[#111827] shadow-2xl relative rounded-2xl overflow-hidden">
          <div className="py-6 px-4 text-center font-black text-3xl tracking-wide text-emerald-400 border-b border-white/10 uppercase">
            สแกนรับคิว
          </div>
          <div className="flex-grow flex flex-col justify-center items-center py-8 px-6 gap-4 min-h-[220px]">
            <div className="bg-white p-3 rounded-2xl shadow-lg">
              <img src={qrCodeSrc} alt="QR Code สำหรับสแกนรับคิว" className="w-40 h-40 sm:w-44 sm:h-44 rounded" />
            </div>
            <p className="text-xs text-gray-400 text-center max-w-[220px] leading-relaxed">
              สแกนด้วยกล้องมือถือเพื่อรับบัตรคิวดิจิทัลและติดตามคิวได้ทันที
            </p>
          </div>
        </div>

        {COUNTERS.map(counterNo => {
          const activeQueue = currentCalling[counterNo];
          const style = counterStyles[counterNo];
          return (
            <div key={counterNo} className={`flex flex-col border-2 ${style.borderColor} ${style.bgColor} shadow-2xl transition-all duration-300 relative rounded-2xl`}>
              <div className={`py-6 px-4 text-center font-black text-3xl tracking-wide ${style.headerTextColor} border-b border-white/10 uppercase`}>
                ช่องที่ {counterNo}
              </div>
              <div className="flex-grow flex flex-col justify-center items-center py-12 px-4 min-h-[220px]">
                {activeQueue ? (
                  <div className="text-center w-full">
                    <div className="text-8xl md:text-[110px] leading-none font-black text-white tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)] animate-pulse">
                      {activeQueue.queue_no}
                    </div>
                    <div className="mt-6 text-sm font-semibold text-white/60 tracking-widest flex items-center justify-center gap-1.5 uppercase">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00] animate-pulse"></span>
                      กำลังตรวจ
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 opacity-30">
                    <div className="text-6xl font-black tracking-widest text-white/50">- - -</div>
                    <p className="mt-2 text-xs text-white/40 font-bold uppercase tracking-wider">ว่าง / ไม่มีคิว</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 pb-4 z-10 bg-gray-950 text-left">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 flex flex-col shadow-xl min-h-[100px]">
          <div className="border-b border-gray-800 pb-1.5 mb-2 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 tracking-wider">ประวัติคิวก่อนหน้า</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentHistory.map(q => (
              <div key={q.id} className="flex items-center gap-2 py-1.5 px-3.5 rounded-lg bg-gray-950/60 border border-gray-800 text-gray-400 text-xs">
                <div className="font-bold text-gray-300">{q.queue_no}</div>
                <div className="text-[10px] flex items-center gap-1 text-gray-500">
                  <span>ช่อง</span><span className="font-extrabold text-blue-400 text-xs">{q.counter_no}</span>
                </div>
              </div>
            ))}
            {recentHistory.length === 0 && (
              <div className="text-center text-gray-600 italic py-2 text-[10px] w-full">ไม่มีประวัติคิวก่อนหน้า</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes marquee-scroll {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .marquee-track {
          display: inline-block;
          white-space: nowrap;
          animation: marquee-scroll 25s linear infinite;
        }
      `}</style>
    </div>
  );
}

// ==========================================================
// หน้า QR หมดอายุ (สแกน QR เก่าข้ามวันมา)
// ==========================================================
function QrExpiredView() {
  return (
    <div className="max-w-md mx-auto bg-white min-h-[70vh] rounded-[2.25rem] shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden flex flex-col items-center justify-center text-center px-8 py-12 gap-4">
      <div className="w-20 h-20 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-4xl">⚠️</div>
      <h3 className="text-lg font-bold text-gray-900">QR Code นี้หมดอายุแล้ว</h3>
      <p className="text-sm text-gray-400 leading-relaxed max-w-[280px]">
        QR Code สำหรับรับคิวจะเปลี่ยนใหม่ทุกวัน เพื่อความถูกต้องของคิว กรุณาสแกน QR Code
        จากหน้าจอทีวีของแผนกเอกซเรย์ ณ ปัจจุบันอีกครั้ง
      </p>
      <div className="mt-2 text-[11px] text-gray-300 font-semibold tracking-widest">
        SONGKHLA HOSPITAL X-RAY
      </div>
    </div>
  );
}

// ==========================================================
// หน้ามือถือคนไข้ — สแกน QR แล้วมาถึงหน้านี้: กรอกเบอร์โทร -> รับคิว -> ติดตามคิว realtime
// ==========================================================
function getTodayQueueStorageKey() {
  const d = new Date();
  return `xray_patient_queue_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function saveQueueRefToStorage(queue) {
  try { localStorage.setItem(getTodayQueueStorageKey(), JSON.stringify({ id: queue.id, queue_no: queue.queue_no })); } catch (e) { /* no-op */ }
}
function getStoredQueueRef() {
  try {
    const raw = localStorage.getItem(getTodayQueueStorageKey());
    if (raw) return JSON.parse(raw);
  } catch (e) { /* no-op */ }
  return null;
}
function clearStoredQueueRef() {
  try { localStorage.removeItem(getTodayQueueStorageKey()); } catch (e) { /* no-op */ }
}
// ต้องกรอกเบอร์โทร 10 หลักยืนยันตัวตนก่อนถึงจะออกคิวให้ — กันคิวซ้ำแบบยึดตัวตนคนไข้จริง
const IDENTIFIER_STORAGE_KEY = 'xray_patient_identifier';
function saveIdentifierToStorage(v) {
  try { localStorage.setItem(IDENTIFIER_STORAGE_KEY, v); } catch (e) { /* no-op */ }
}
function getStoredIdentifier() {
  try { return localStorage.getItem(IDENTIFIER_STORAGE_KEY) || ''; } catch (e) { return ''; }
}

function MobileQueueView() {
  const { queues } = useRealtimeQueues();
  const [selectedQueueId, setSelectedQueueId] = useState(() => {
    const stored = getStoredQueueRef();
    return stored ? stored.id : null;
  });
  const [showForm, setShowForm] = useState(() => !getStoredQueueRef());
  const [identifierInput, setIdentifierInput] = useState(() => getStoredIdentifier());
  const [identifierError, setIdentifierError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [calledAlert, setCalledAlert] = useState(false);
  const [timeString, setTimeString] = useState('');
  const [dateString, setDateString] = useState('');
  const [scanTime, setScanTime] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const lastStatusRef = useRef(null);
  const queueCardRef = useRef(null);

  const myQueue = queues.find(q => q.id === selectedQueueId) || null;

  const downloadQueueImage = async () => {
    if (!queueCardRef.current || !myQueue) return;
    setDownloadingImage(true);
    try {
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(queueCardRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      canvas.toBlob(async (blob) => {
        if (!blob) { setDownloadingImage(false); return; }
        const fileName = `คิวเอกซเรย์-${myQueue.queue_no}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `คิวเอกซเรย์ ${myQueue.queue_no}` });
            setDownloadingImage(false);
            return;
          } catch (shareErr) {
            if (shareErr && shareErr.name === 'AbortError') { setDownloadingImage(false); return; }
          }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setDownloadingImage(false);
      }, 'image/png');
    } catch (err) {
      alert(err.message || 'ไม่สามารถบันทึกภาพคิวได้');
      setDownloadingImage(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateString(now.toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!myQueue) return;
    if (myQueue.status === 'calling' && lastStatusRef.current !== 'calling') {
      playBeep();
      setCalledAlert(true);
      setTimeout(() => setCalledAlert(false), 8000);
    }
    if (myQueue.status === 'completed' || myQueue.status === 'reset') {
      clearStoredQueueRef();
    }
    lastStatusRef.current = myQueue.status;
  }, [myQueue?.status]);

  const validateIdentifier = (v) => {
    if (!/^0\d{9}$/.test(v.trim())) return 'กรุณากรอกเบอร์โทรศัพท์ 10 หลักให้ครบ (ขึ้นต้นด้วย 0)';
    return '';
  };

  const handleSubmit = async () => {
    const err = validateIdentifier(identifierInput);
    if (err) { setIdentifierError(err); return; }
    setIdentifierError('');
    setSubmitting(true);
    const currentTimeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setScanTime(currentTimeStr);
    try {
      const result = await insertQueue({ source: 'mobile', identifier: identifierInput.trim(), queueType: 'xray' });
      saveIdentifierToStorage(identifierInput.trim());
      saveQueueRefToStorage(result.queue);
      lastStatusRef.current = result.queue.status;
      setSelectedQueueId(result.queue.id);
      setShowForm(false);
      playNewQueueChime();
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 5000);
    } catch (err) {
      setIdentifierError('เกิดข้อผิดพลาดในการออกคิว กรุณาลองใหม่');
    }
    setSubmitting(false);
  };

  const getStatusText = () => {
    if (!myQueue) return 'ไม่พบคิวในระบบ กรุณาสแกน QR ใหม่อีกครั้ง';
    if (myQueue.status === 'calling') return `ถึงคิวเข้ารับการตรวจช่องที่ ${myQueue.counter_no} แล้ว!`;
    if (myQueue.status === 'completed') return 'คุณเข้ารับบริการเสร็จสิ้นแล้ว';
    if (myQueue.status === 'skipped') return 'คุณไม่มาแสดงตัวตามกำหนด คิวถูกข้าม กรุณาติดต่อเจ้าหน้าที่หน้าห้อง';
    if (myQueue.status === 'reset') return 'คิวนี้ถูกรีเซ็ตโดยเจ้าหน้าที่ กรุณาสแกน QR ใหม่เพื่อรับคิว';
    return null; // waiting -> แสดงจำนวนคิวรอแทน
  };

  const waitingCount = (() => {
    if (!myQueue || myQueue.status !== 'waiting') return null;
    const idx = queues.findIndex(q => q.id === myQueue.id);
    if (idx === -1) return null;
    return queues.slice(0, idx).filter(q => q.status === 'waiting').length;
  })();
  const estimatedTime = typeof waitingCount === 'number' ? Math.round(waitingCount * 3.5) : null;

  const statusText = getStatusText();
  const isProblem = myQueue && ['skipped', 'reset'].includes(myQueue.status);

  return (
    <div className="max-w-md mx-auto bg-white min-h-[85vh] w-full rounded-[2.25rem] shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden flex flex-col justify-between text-gray-900 relative">
      {showSuccessToast && myQueue && (
        <div className="absolute top-3 left-3 right-3 bg-white p-3.5 rounded-2xl shadow-xl border border-gray-100 z-50 flex gap-3 items-center text-left">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
            ✅
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-emerald-500 font-bold uppercase block tracking-widest">โรงพยาบาลสงขลา</span>
            <p className="text-xs text-gray-600 truncate mt-0.5 font-semibold">
              ลงทะเบียนสำเร็จ! คิวเอกซเรย์ของคุณคือ {myQueue.queue_no}{scanTime ? ` เวลา ${scanTime}` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="bg-emerald-50 text-emerald-600 text-center py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
        </span>
        <span>เชื่อมต่อคิวดิจิทัลแบบเรียลไทม์</span>
      </div>

      {calledAlert && (
        <div className="bg-red-50 border-b border-red-100 text-red-600 text-center py-3 px-4 font-bold text-sm flex items-center justify-center gap-2">
          <span className="animate-pulse">🔊</span>
          ถึงคิวของท่านแล้ว! กรุณาไปที่ช่องบริการ {myQueue?.counter_no}
        </div>
      )}

      <div className="pt-7 pb-5 px-5 text-center flex flex-col items-center gap-2.5 border-b border-gray-100">
        <div className="relative w-16 h-16 shrink-0">
          <div className="w-16 h-16 rounded-full overflow-hidden shadow-sm border border-gray-100 bg-white">
            <img
              src={HOSPITAL_LOGO_GREEN_SRC}
              alt="โลโก้โรงพยาบาลสงขลา"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white">
            <XRayIcon size={12} />
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center justify-center gap-1.5">
            <XRayIcon size={16} className="text-emerald-400" />
            ระบบติดตามคิวมือถือ
          </h3>
          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest">Songkhla Hospital X-Ray Live</p>
          <p className="text-[11px] text-gray-400 font-medium mt-1">{dateString} • {timeString}</p>
        </div>
      </div>

      {showForm ? (
        <div className="px-6 py-10 flex-grow flex flex-col justify-center space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <XRayIcon size={28} />
            </div>
            <h4 className="text-lg font-bold text-gray-900">ยืนยันตัวตนก่อนรับคิว</h4>
            <p className="text-[13px] text-gray-400 max-w-[260px] mx-auto leading-relaxed">
              กรอกเบอร์โทรศัพท์ 10 หลัก เพื่อป้องกันการรับคิวซ้ำ แม้จะปิดหน้าจอนี้ไปแล้วก็ตาม
            </p>
          </div>
          <div className="space-y-2">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={identifierInput}
              onChange={(e) => { setIdentifierInput(e.target.value.replace(/[^\d]/g, '')); setIdentifierError(''); }}
              placeholder="0812345678"
              className="w-full bg-gray-50 border border-gray-200 focus:border-emerald-400 focus:bg-white outline-none text-gray-900 text-center text-2xl font-bold tracking-[0.2em] py-4 rounded-2xl placeholder:text-gray-300 placeholder:tracking-normal placeholder:font-normal placeholder:text-base transition"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
            {identifierError && <p className="text-red-500 text-xs font-semibold text-center">{identifierError}</p>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-sm py-4 rounded-2xl transition active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            {submitting ? 'กำลังรับคิว...' : 'ยืนยันและรับคิว'}
          </button>
        </div>
      ) : (
        <div className="p-5 flex-grow flex flex-col justify-center space-y-5 bg-gray-50/60">
          {!myQueue ? (
            <div className="text-center py-10 text-gray-400 text-sm">กำลังโหลดข้อมูลคิว...</div>
          ) : (
            <div className="space-y-4">
              <div ref={queueCardRef} className="bg-white border border-gray-100 rounded-3xl p-6 text-center shadow-sm relative overflow-hidden">
                <XRayIcon size={120} className="absolute -right-6 -top-6 text-emerald-50 pointer-events-none" />
                {scanTime && (
                  <div className="absolute top-0 right-0 bg-gray-50 text-gray-400 text-[9px] font-semibold px-3 py-1.5 rounded-bl-2xl tracking-wide">
                    สแกนเมื่อ {scanTime}
                  </div>
                )}
                <span className="relative text-[11px] text-gray-400 font-semibold flex items-center justify-center gap-1 uppercase tracking-widest mb-2">
                  <XRayIcon size={13} className="text-emerald-400" /> คิวตรวจของคุณคือ
                </span>
                <span className="relative text-7xl font-extrabold text-emerald-500 block tracking-tight">{myQueue.queue_no}</span>

                <div className="relative border-t border-gray-100 pt-4 mt-5 text-center">
                  {typeof waitingCount === 'number' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-2xl py-3">
                        <span className="text-[10px] text-gray-400 block font-semibold mb-0.5">เหลืออีก</span>
                        <span className="text-2xl font-extrabold text-gray-900">{waitingCount} <span className="text-xs font-medium text-gray-400">คิว</span></span>
                      </div>
                      <div className="bg-gray-50 rounded-2xl py-3">
                        <span className="text-[10px] text-gray-400 block font-semibold mb-0.5">รอประมาณ</span>
                        <span className="text-2xl font-extrabold text-gray-900">{estimatedTime} <span className="text-xs font-medium text-gray-400">นาที</span></span>
                      </div>
                    </div>
                  ) : (
                    <span className={`text-sm font-bold ${isProblem ? 'text-red-500' : 'text-emerald-500'}`}>{statusText}</span>
                  )}
                </div>
              </div>

              <button
                onClick={downloadQueueImage}
                disabled={downloadingImage}
                className="w-full bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-700 font-bold text-sm py-3 rounded-2xl transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {downloadingImage ? 'กำลังบันทึกภาพ...' : '📷 บันทึกภาพบัตรคิว'}
              </button>

              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest text-left px-1">สถานะคิวปัจจุบันที่หน้าห้องตรวจ</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {COUNTERS.map(num => {
                    const activeQ = queues.find(q => q.status === 'calling' && q.counter_no === num);
                    return (
                      <div key={num} className="bg-white border border-gray-100 rounded-2xl p-3 text-center shadow-sm">
                        <span className="text-[10px] text-gray-400 font-semibold block mb-0.5">ช่อง {num}</span>
                        <span className="text-lg font-extrabold text-gray-900 block">{activeQ ? activeQ.queue_no : '---'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="py-4 border-t border-gray-100 text-center text-[10px] text-gray-300 font-semibold tracking-widest">
        SONGKHLA HOSPITAL &copy; 2569
      </div>
    </div>
  );
}

// ==========================================================
// หน้าจัดการสิทธิ์เจ้าหน้าที่ (realtime)
// ==========================================================
// ==========================================================
// รายงานสรุปคิวแยกตามประเภท — รายวัน/รายเดือน/รายปี (หน้าตาตามชีทสรุปคิว)
// ==========================================================
const REPORT_TYPE_COLS = [
  { key: 'xray_count', label: 'ทั่วไป (X-Ray)' },
  { key: 'ipd_count', label: 'ผู้ป่วยใน (IPD)' },
  { key: 'opd_count', label: 'ผู้ป่วยนอก (OPD)' },
  { key: 'emergency_count', label: 'ฉุกเฉิน' },
];

function ReportTable({ title, rows, dateKey, dateLabel }) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-bold text-emerald-700 mb-2">📊 {title}</h4>
      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-emerald-50 text-left text-xs text-gray-600">
              <th className="py-2 px-3 font-bold">{dateLabel}</th>
              {REPORT_TYPE_COLS.map(c => <th key={c.key} className="py-2 px-3 font-bold">{c.label}</th>)}
              <th className="py-2 px-3 font-bold">รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="py-2 px-3 font-semibold text-gray-700">{row[dateKey]}</td>
                {REPORT_TYPE_COLS.map(c => <td key={c.key} className="py-2 px-3 text-gray-600">{row[c.key] || 0}</td>)}
                <td className="py-2 px-3 font-bold text-emerald-700">{row.total_count || 0}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-400 italic py-4">ยังไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportView() {
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [d, m, y] = await Promise.all([getDailySummary(), getMonthlySummary(), getYearlySummary()]);
        setDaily(d);
        setMonthly(m);
        setYearly(y);
      } catch (err) {
        setError('โหลดรายงานไม่สำเร็จ: ' + err.message + ' (ต้องรัน SQL สร้าง view daily_queue_summary / monthly_queue_summary / yearly_queue_summary ใน Supabase ก่อน)');
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-gray-400 text-center py-10">กำลังโหลดรายงาน...</p>;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-emerald-100">
      <h3 className="text-lg font-bold text-gray-800 mb-4">รายงานสรุปคิวแยกตามประเภท โรงพยาบาลสงขลา</h3>
      {error ? (
        <p className="text-red-500 text-sm font-semibold">{error}</p>
      ) : (
        <>
          <ReportTable title="สรุปคิวแยกตามประเภท รายวัน" rows={daily} dateKey="report_date" dateLabel="วันที่" />
          <ReportTable title="สรุปคิวแยกตามประเภท รายเดือน" rows={monthly} dateKey="report_month" dateLabel="เดือน" />
          <ReportTable title="สรุปคิวแยกตามประเภท รายปี" rows={yearly} dateKey="report_year" dateLabel="ปี" />
        </>
      )}
    </div>
  );
}

function StaffManagementView({ currentStaffId }) {
  const { staff: staffList, loading } = useRealtimeStaff();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const run = async (fn, successMsg) => {
    setBusy(true);
    try {
      await fn();
      if (successMsg) {
        setToast({ type: 'success', message: successMsg });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  };

  const handleDelete = (s) => {
    if (!window.confirm(`ต้องการลบบัญชี "${s.username}" (${s.full_name}) ทิ้งถาวรใช่หรือไม่? การลบนี้กู้คืนไม่ได้`)) return;
    run(async () => {
      const result = await deleteStaff(s.id);
      if (!result.ok) throw new Error(result.message);
    }, `ลบบัญชี ${s.username} เรียบร้อยแล้ว`);
  };

  if (loading) return <p className="text-gray-400 text-center py-10">กำลังโหลด...</p>;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-emerald-100 relative">
      {toast && (
        <div className="absolute top-3 right-3 bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-lg z-10">
          {toast.message}
        </div>
      )}
      <h3 className="text-lg font-bold text-gray-800 mb-4">จัดการและพิจารณาอนุมัติสิทธิ์เจ้าหน้าที่</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-100 text-left text-xs text-gray-500">
            <th className="py-2 px-2">ชื่อบัญชี</th><th className="py-2 px-2">ชื่อ-นามสกุล</th><th className="py-2 px-2">สถานะ</th><th className="py-2 px-2">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(staffList) && staffList.map((s) => {
            const isSelf = s.id === currentStaffId;
            const isApproved = s.status === 'approved';
            const roleInfo = ROLE_INFO[s.role] || ROLE_INFO.staff;
            return (
              <tr key={s.id} className="border-b border-gray-50">
                <td className="py-2.5 px-2 font-bold">{s.username}{isSelf && ' (คุณ)'}</td>
                <td className="py-2.5 px-2">{s.full_name}</td>
                <td className="py-2.5 px-2">
                  <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{isApproved ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</span>
                  <span className={`ml-1 px-2 py-1 rounded-full text-[10px] font-bold ${roleInfo.badgeClass}`}>{roleInfo.label}</span>
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!isApproved && (
                      <button
                        onClick={() => run(() => setStaffApproval(s.id, true), `อนุมัติ ${s.username} เรียบร้อยแล้ว`)}
                        disabled={busy}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-md text-[10px] disabled:opacity-50"
                      >
                        อนุมัติ
                      </button>
                    )}
                    {isApproved && !isSelf && (
                      <button
                        onClick={() => run(() => setStaffApproval(s.id, false), `ระงับสิทธิ์ ${s.username} เรียบร้อยแล้ว`)}
                        disabled={busy}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded-md text-[10px] disabled:opacity-50"
                      >
                        ระงับสิทธิ์
                      </button>
                    )}
                    {!isSelf && (
                      <select
                        value={s.role}
                        onChange={(e) => run(() => setStaffRole(s.id, e.target.value), `เปลี่ยนสิทธิ์ ${s.username} เรียบร้อยแล้ว`)}
                        disabled={busy}
                        className="border border-gray-200 rounded-md px-1.5 py-1 text-[10px] font-bold disabled:opacity-50"
                      >
                        {Object.entries(ROLE_INFO).map(([key, info]) => (
                          <option key={key} value={key}>{info.label}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => {
                        const newPassword = window.prompt(`ตั้งรหัสผ่านใหม่ให้ ${s.username}`);
                        if (newPassword) run(() => resetStaffPassword(s.id, newPassword), `รีเซ็ตรหัสผ่าน ${s.username} เรียบร้อยแล้ว`);
                      }}
                      disabled={busy}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-2 py-1 rounded-md text-[10px] disabled:opacity-50"
                    >
                      รีเซ็ตรหัสผ่าน
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => handleDelete(s)}
                        disabled={busy}
                        title={`ลบบัญชี ${s.username}`}
                        className="bg-red-50 hover:bg-red-100 text-red-600 font-bold p-1.5 rounded-md disabled:opacity-50 flex items-center justify-center"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}