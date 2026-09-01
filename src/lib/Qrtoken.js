// ==========================================================
// รหัสยืนยัน QR ประจำวัน (ไม่ต้องมี backend เก็บสถานะ)
// ใช้วันที่ปัจจุบัน (YYYYMMDD) เป็นรหัส เปลี่ยนอัตโนมัติทุกเที่ยงคืน
// จุดประสงค์: กันคนเอารูป/สกรีนช็อต QR เก่าข้ามวันมาสแกนใช้ซ้ำ
// (ไม่ใช่รหัสลับด้านความปลอดภัย แค่กันความผิดพลาดจากการใช้ QR เก่า)
// ==========================================================

export function getTodayToken() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function buildScanUrl(baseUrl, token) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('scan', '1');
    url.searchParams.set('qt', token);
    return url.toString();
  } catch (e) {
    return baseUrl;
  }
}