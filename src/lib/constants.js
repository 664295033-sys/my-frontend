export const COUNTERS = [1, 2];

// ประเภทคิว: prefix ใช้สร้างเลขคิว (เช่น X001, W001, U001, E001)
export const QUEUE_TYPES = {
  xray: { label: 'ทั่วไป (X-Ray)', shortLabel: 'ทั่วไป', prefix: 'X', badgeClass: 'bg-emerald-100 text-emerald-700', dotClass: 'bg-emerald-500' },
  ipd: { label: 'ผู้ป่วยใน (IPD)', shortLabel: 'IPD', prefix: 'W', badgeClass: 'bg-purple-100 text-purple-700', dotClass: 'bg-purple-500' },
  opd: { label: 'ผู้ป่วยนอก (OPD)', shortLabel: 'OPD', prefix: 'U', badgeClass: 'bg-blue-100 text-blue-700', dotClass: 'bg-blue-500' },
  emergency: { label: 'ฉุกเฉิน ER', shortLabel: 'ฉุกเฉิน ER', prefix: 'E', badgeClass: 'bg-red-100 text-red-700', dotClass: 'bg-red-500' }
};

export const getTypeInfo = (type) => QUEUE_TYPES[type] || QUEUE_TYPES.xray;

// ใช้อ่านออกเสียงตัวอักษรนำหน้าเลขคิว
export const PREFIX_READING = { X: 'เอ็กซ์', W: 'ดับเบิลยู', U: 'ยู', E: 'อี' };

// สิทธิ์การใช้งานของเจ้าหน้าที่
export const ROLE_INFO = {
  staff: { label: 'เจ้าหน้าที่ทั่วไป (ผู้ใช้งาน)', badgeClass: 'bg-blue-100 text-blue-700' },
  admin: { label: 'หัวหน้าแผนก/ไอที (ผู้ดูแลระบบ)', badgeClass: 'bg-purple-100 text-purple-700' },
  blocked: { label: 'ปิดกั้นการใช้งานชั่วคราว', badgeClass: 'bg-red-100 text-red-700' }
};

export const getSourceLabel = (source) => {
  if (source === 'mobile') return { text: 'สแกนจากมือถือ', badgeClass: 'bg-blue-100 text-blue-700' };
  if (source === 'paper') return { text: 'บัตรกระดาษ', badgeClass: 'bg-amber-100 text-amber-700' };
  return { text: 'ไม่ระบุแหล่งที่มา', badgeClass: 'bg-gray-100 text-gray-500' };
};