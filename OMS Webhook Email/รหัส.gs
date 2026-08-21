// =================================================================
// 🌟 ระบบส่งอีเมลอัตโนมัติ (OMS Webhook API) by ไนท์ 🌟
// =================================================================

const CONFIG = {
  // 1. ตั้งค่าอีเมลสำหรับแจ้งเตือนตอน "อนุมัติ" (รับข้อมูลเป็นกลุ่มได้)
  EMAIL_MAP: {
    'USER-006': 'pongsak@smetaltech.co.th',
    'USER-003': 'admin2@smetaltech.co.th',
    'USER-005': 'admin2@smetaltech.co.th, pongsak.bunnak@gmail.com'
  },
  
  // 2. ตั้งค่าอีเมลสำหรับแจ้งเตือนตอน "มีคนยื่นขอ OT ใหม่" (ดักจับเฉพาะคนนี้)
  REQ_TARGET_USER: 'USER-004',
  REQ_TARGET_EMAIL: 'pongsak@smetaltech.co.th'
};

function doPost(e) {
  try {
    // รับข้อมูลที่ส่งมาจากหน้าเว็บ app.js
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const data = payload.data;

    // แยกการทำงานตามประเภทคำสั่ง
    if (action === 'bulk_approve') {
      processBulkApprove(data);
    } else if (action === 'new_request') {
      processNewRequest(data);
    }

    // ตอบกลับไปบอกเว็บว่า "รับทราบและส่งอีเมลเสร็จแล้วจ้า"
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Email sent successfully!' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// -----------------------------------------------------------------
// 🟢 ฟังก์ชัน 1: จัดการส่งอีเมลตอน "อนุมัติ OT" (ส่ง 1 ฉบับรวมหลายคน)
// -----------------------------------------------------------------
function processBulkApprove(records) {
  if (!records || records.length === 0) return;

  // 1. จัดกลุ่มข้อมูลตามอีเมลผู้รับ
  const emailBatches = {};

  records.forEach(req => {
    const userCode = req.user_id;
    const recipientEmail = CONFIG.EMAIL_MAP[userCode];
    
    // ถ้าไม่มีอีเมลตั้งไว้ในระบบ ให้ข้ามไป
    if (!recipientEmail) return;

    if (!emailBatches[recipientEmail]) {
      emailBatches[recipientEmail] = [];
    }
    emailBatches[recipientEmail].push(req);
  });

  // 2. วนลูปส่งอีเมลตามกลุ่มที่จัดไว้ (1 อีเมล / 1 กลุ่ม)
  for (const email in emailBatches) {
    const userList = emailBatches[email];
    
    // ดึงชื่อผู้อนุมัติมาทำเป็นหัวข้ออีเมล
    const approverName = userList[0].approver_name || userList[0].user_id;
    const subject = `แจ้งเตือนอนุมัติ OT ในระบบจาก ${approverName}`;
    
    // สร้างตารางรายชื่อในอีเมล (✨ ล็อกความกว้าง % และจัด Center/Left ให้ตรงกันทุกช่อง)
    let tableRows = '';
    userList.forEach((u, index) => {
      tableRows += `
        <tr>
          <td width="10%" style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: #475569;">${index + 1}</td>
          <td width="45%" style="padding: 10px; border-bottom: 1px solid #eee; text-align: left; color: #334155;"><b>${u.fullname}</b><br><span style="font-size: 11px; color: #94a3b8;">${u.emp_id || '-'}</span></td>
          <td width="25%" style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: #475569;">${u.date}</td>
          <td width="20%" style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: #10b981;"><b>${u.hours} ชม.</b></td>
        </tr>
      `;
    });

    const htmlBody = `
      <div style="font-family: 'Prompt', sans-serif, Arial; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">แจ้งขออนุมัติโอทีในระบบตามรายชื่อดังนี้</h2>
        </div>
        <div style="padding: 24px; background-color: #ffffff;">
          <p style="margin-top: 0;">เรียนผู้เกี่ยวข้อง,</p>
          <p>ระบบ OMS ได้ทำการ <b>ขออนุมัติ</b> ทำงานล่วงเวลา (OT) จำนวน <b style="color: #10b981;">${userList.length} รายการ</b> ดังนี้:</p>
          
          <!-- ✨ เพิ่ม width="100%" ที่ตัว table เพื่อบังคับ Outlook ให้วาดตารางเต็มกล่องพอดี -->
          <table width="100%" style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background-color: #f8fafc; color: #64748b;">
                <!-- ✨ ล็อก % ให้ตรงกับเนื้อหาด้านล่างเป๊ะๆ -->
                <th width="10%" style="padding: 12px 10px; text-align: center;">ลำดับ</th>
                <th width="45%" style="padding: 12px 10px; text-align: left;">ชื่อพนักงาน</th>
                <th width="25%" style="padding: 12px 10px; text-align: center;">วันที่ทำ OT</th>
                <th width="20%" style="padding: 12px 10px; text-align: center;">ชั่วโมง</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <p style="margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
            ส่งอัตโนมัติโดย OMS Auto Agent <br> ${new Date().toLocaleString('th-TH')}
          </p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
  }
}

// -----------------------------------------------------------------
// 🔴 ฟังก์ชัน 2: แจ้งเตือนตอนมีคนขอ OT ใหม่ (เฉพาะคนที่ตั้งเงื่อนไขไว้)
// -----------------------------------------------------------------
function processNewRequest(req) {
  // ตรวจสอบว่าใช่คนที่กำหนดไว้หรือเปล่า
  if (req.user_id !== CONFIG.REQ_TARGET_USER) return;

  const subject = `⚠️ มีการขอโอที (ยื่นคำขอใหม่) • ${req.fullname}`;
  const htmlBody = `
    <div style="font-family: 'Prompt', sans-serif, Arial; color: #333; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">⚠️ คำขอโอทีใหม่เข้าระบบ</h2>
      </div>
      <div style="padding: 24px; background-color: #ffffff;">
        <p style="margin-top: 0;">พนักงาน <b>${req.fullname}</b> (รหัส: ${req.user_id}) <br>ได้ทำการยื่นขอโอทีเข้าสู่ระบบค่ะ</p>
        
        <ul style="background-color: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; color: #475569; border: 1px solid #e2e8f0; margin-top: 15px;">
          <li style="margin-bottom: 8px;"><b>วันที่ขอ:</b> ${req.date}</li>
          <li style="margin-bottom: 8px;"><b>รหัสคำขอ:</b> ${req.id}</li>
          <li><b>เหตุผล:</b> ${req.description || '-'}</li>
        </ul>
        
        <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
          เวลาที่ส่งคำขอ: ${new Date().toLocaleString('th-TH')}
        </p>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: CONFIG.REQ_TARGET_EMAIL,
    subject: subject,
    htmlBody: htmlBody
  });
}