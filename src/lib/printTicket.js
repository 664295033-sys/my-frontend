import { getTypeInfo } from './constants';

/**
 * เปิดหน้าต่างใหม่แล้วสั่งพิมพ์บัตรคิวกระดาษอัตโนมัติ
 * หมายเหตุ: targetWindow ต้องถูกเปิดแบบ synchronous ตอนคลิกปุ่ม (ก่อน await ใดๆ)
 * ไม่เช่นนั้นเบราว์เซอร์จะมองว่าไม่ได้มาจาก user gesture โดยตรงแล้วบล็อก popup
 */
export function printQueueTicket(queue, targetWindow) {
  const win = targetWindow && !targetWindow.closed ? targetWindow : window.open('', '_blank', 'width=380,height=640');
  if (!win) {
    alert('เบราว์เซอร์บล็อกหน้าต่างปริ้น กรุณาอนุญาต popup ของเว็บนี้แล้วลองใหม่');
    return;
  }

  const typeInfo = getTypeInfo(queue.queue_type);
  const createdDate = queue.created_at ? new Date(queue.created_at) : new Date();
  const dateStr = createdDate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = createdDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>บัตรคิว ${queue.queue_no}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; margin: 0; padding: 12px 8px; color: #111827; }
  .hospital { font-size: 22px; font-weight: 900; color: #0e8345; margin-bottom: 2px; letter-spacing: 0.5px; }
  .dept { font-size: 11px; color: #555; margin-bottom: 12px; }
  .label { font-size: 13px; color: #444; margin-bottom: 4px; }
  .queue-no { font-size: 68px; font-weight: 900; letter-spacing: 2px; margin: 4px 0 10px; line-height: 1; }
  .type-badge { display: inline-block; font-size: 13px; font-weight: 700; padding: 4px 14px; border-radius: 8px; margin-bottom: 12px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .divider { border-top: 1px dashed #999; margin: 10px 0; }
  .meta { font-size: 11px; color: #666; margin-bottom: 2px; }
  .footer { font-size: 10px; color: #999; margin-top: 12px; }
</style>
</head>
<body onload="window.focus(); window.print();">
  <div class="hospital">คิวซักประวัติ X-Ray</div>
  <div class="dept">แผนกเอกซเรย์ - บัตรคิว</div>
  <div class="label">หมายเลขคิวของท่าน</div>
  <div class="queue-no">${queue.queue_no}</div>
  <div class="type-badge">${typeInfo.label}</div>
  <div class="divider"></div>
  <div class="meta">วันที่ ${dateStr} เวลา ${timeStr} น.</div>
  <div class="footer">กรุณาเก็บบัตรนี้ไว้จนกว่าจะถึงคิว</div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}