// =================================================================
// 🌟 ระบบส่งอีเมลอัตโนมัติ (OMS Webhook API) by ไนท์ 🌟
// =================================================================

const CONFIG = {
  // ชื่อผู้ส่งอีเมลที่แสดงในกล่องข้อความ (ทุก Step)
  SENDER_NAME: 'Overtime Management System',

  // URL สำหรับเปิดเข้าสู่ระบบ OMS
  APP_URL: 'https://smetaltech25.github.io/ot-management-system/',

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

// ใช้ฟอนต์ที่มีติดมากับ Windows/Outlook และกำหนด Style แบบ Inline
// เพราะ Classic Outlook ใช้ Microsoft Word ในการแสดงผล HTML Email
const EMAIL_FONT_STACK = "Tahoma, Arial, sans-serif";

function buildAppButtonHtml(buttonText, buttonBgColor) {
  const label = buttonText || '👉 คลิกที่นี่เพื่อเปิดเข้าสู่ระบบ OMS';
  const bgColor = buttonBgColor || '#10b981';

  return `
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin: 20px 0 8px 0; border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
      <tr>
        <td class="oms-btn-cell" align="center" bgcolor="${bgColor}" style="border-radius: 8px; background-color: ${bgColor}; padding: 13px 20px; text-align: center;">
          <a class="oms-btn-link" href="${CONFIG.APP_URL}" target="_blank" style="font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 22px; mso-line-height-rule: exactly; font-weight: 700; color: #ffffff; text-decoration: none; display: block;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function buildEmailLayout(headerColor, headerText, contentHtml, maxWidth) {
  const safeWidth = maxWidth || 680;

  return `
    <!doctype html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @media only screen and (max-width: 480px) {
            .oms-outer { padding: 12px 6px !important; }
            .oms-title { padding: 16px 12px !important; font-size: 18px !important; line-height: 26px !important; }
            .oms-content { padding: 18px 10px !important; }
            .oms-content p { font-size: 14px !important; line-height: 22px !important; margin-bottom: 14px !important; }
            .oms-content th { padding: 10px 3px !important; font-size: 11px !important; line-height: 18px !important; white-space: nowrap !important; }
            .oms-content td { padding: 10px 3px !important; font-size: 12px !important; line-height: 19px !important; }
            .oms-content td span { font-size: 10px !important; line-height: 16px !important; overflow-wrap: anywhere; }
            .oms-btn-cell { padding: 12px 10px !important; }
            .oms-btn-link { font-size: 14px !important; line-height: 20px !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${EMAIL_FONT_STACK}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="width: 100%; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f1f5f9;">
          <tr>
            <td class="oms-outer" align="center" style="padding: 24px 12px;">
              <!--[if mso]>
              <table role="presentation" width="${safeWidth}" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
              <![endif]-->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; max-width: ${safeWidth}px; border: 1px solid #dbe3ec; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #ffffff;">
                <tr>
                  <td class="oms-title" align="center" bgcolor="${headerColor}" style="padding: 22px 24px; background-color: ${headerColor}; color: #ffffff; font-family: ${EMAIL_FONT_STACK}; font-size: 22px; line-height: 30px; mso-line-height-rule: exactly; font-weight: 700;">
                    ${headerText}
                  </td>
                </tr>
                <tr>
                  <td class="oms-content" style="padding: 26px 28px; background-color: #ffffff; font-family: ${EMAIL_FONT_STACK}; font-size: 16px; line-height: 25px; mso-line-height-rule: exactly; color: #334155;">
                    ${contentHtml}
                  </td>
                </tr>
              </table>
              <!--[if mso]>
                  </td>
                </tr>
              </table>
              <![endif]-->
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

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
    
    // สร้างตารางรายชื่อด้วย Table + Inline CSS เพื่อรองรับ Classic Outlook
    let tableRows = '';
    userList.forEach((u, index) => {
      tableRows += `
        <tr>
          <td width="10%" align="center" valign="middle" style="width: 10%; padding: 14px 8px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 22px; mso-line-height-rule: exactly; text-align: center; color: #475569;">${index + 1}</td>
          <td width="42%" align="left" valign="middle" style="width: 42%; padding: 14px 10px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 22px; mso-line-height-rule: exactly; text-align: left; color: #1e293b;"><strong>${u.fullname}</strong><br><span style="font-family: ${EMAIL_FONT_STACK}; font-size: 13px; line-height: 19px; color: #64748b;">${u.emp_id || '-'}</span></td>
          <td width="28%" align="center" valign="middle" style="width: 28%; padding: 14px 8px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 22px; mso-line-height-rule: exactly; text-align: center; color: #475569; white-space: nowrap;">${u.date}</td>
          <td width="20%" align="center" valign="middle" style="width: 20%; padding: 14px 8px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 22px; mso-line-height-rule: exactly; text-align: center; color: #059669; white-space: nowrap;"><strong>${u.hours} ชม.</strong></td>
        </tr>
      `;
    });

    const contentHtml = `
      <p style="margin: 0 0 14px 0; font-family: ${EMAIL_FONT_STACK}; font-size: 16px; line-height: 25px; mso-line-height-rule: exactly; color: #334155;">เรียนผู้เกี่ยวข้อง,</p>
      <p style="margin: 0 0 20px 0; font-family: ${EMAIL_FONT_STACK}; font-size: 16px; line-height: 25px; mso-line-height-rule: exactly; color: #334155;">ระบบ OMS ได้ทำการ <strong>ขออนุมัติ</strong> ทำงานล่วงเวลา (OT) จำนวน <strong style="color: #059669;">${userList.length} รายการ</strong> ดังนี้:</p>

      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #e2e8f0; border-collapse: collapse; table-layout: fixed; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
        <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
          <th width="10%" align="center" style="width: 10%; padding: 13px 8px; font-family: ${EMAIL_FONT_STACK}; font-size: 14px; line-height: 20px; mso-line-height-rule: exactly; font-weight: 700; text-align: center; color: #475569;">ลำดับ</th>
          <th width="42%" align="left" style="width: 42%; padding: 13px 10px; font-family: ${EMAIL_FONT_STACK}; font-size: 14px; line-height: 20px; mso-line-height-rule: exactly; font-weight: 700; text-align: left; color: #475569;">ชื่อพนักงาน</th>
          <th width="28%" align="center" style="width: 28%; padding: 13px 8px; font-family: ${EMAIL_FONT_STACK}; font-size: 14px; line-height: 20px; mso-line-height-rule: exactly; font-weight: 700; text-align: center; color: #475569;">วันที่ทำ OT</th>
          <th width="20%" align="center" style="width: 20%; padding: 13px 8px; font-family: ${EMAIL_FONT_STACK}; font-size: 14px; line-height: 20px; mso-line-height-rule: exactly; font-weight: 700; text-align: center; color: #475569;">ชั่วโมง</th>
        </tr>
        ${tableRows}
      </table>

      ${buildAppButtonHtml('👉 คลิกที่นี่เพื่อเปิดเข้าสู่ระบบ OMS', '#10b981')}

      <p style="margin: 20px 0 0 0; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-family: ${EMAIL_FONT_STACK}; font-size: 13px; line-height: 20px; mso-line-height-rule: exactly; color: #64748b; text-align: center;">
        ส่งอัตโนมัติโดย OMS Auto Agent<br>${new Date().toLocaleString('th-TH')}
      </p>
    `;

    const htmlBody = buildEmailLayout(
      '#10b981',
      'แจ้งขออนุมัติโอทีในระบบตามรายชื่อดังนี้',
      contentHtml,
      680
    );

    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody,
      name: CONFIG.SENDER_NAME
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
  const contentHtml = `
    <p style="margin: 0 0 18px 0; font-family: ${EMAIL_FONT_STACK}; font-size: 16px; line-height: 25px; mso-line-height-rule: exactly; color: #334155;">พนักงาน <strong>${req.fullname}</strong> (รหัส: ${req.user_id})<br>ได้ทำการยื่นขอโอทีเข้าสู่ระบบค่ะ</p>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f8fafc" style="width: 100%; border: 1px solid #e2e8f0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #f8fafc;">
      <tr>
        <td width="32%" valign="top" style="width: 32%; padding: 14px 14px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; font-weight: 700; color: #334155;">วันที่ขอ</td>
        <td valign="top" style="padding: 14px 14px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; color: #475569;">${req.date}</td>
      </tr>
      <tr>
        <td width="32%" valign="top" style="width: 32%; padding: 14px 14px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; font-weight: 700; color: #334155;">รหัสคำขอ</td>
        <td valign="top" style="padding: 14px 14px; border-bottom: 1px solid #e2e8f0; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; color: #475569;">${req.id}</td>
      </tr>
      <tr>
        <td width="32%" valign="top" style="width: 32%; padding: 14px 14px; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; font-weight: 700; color: #334155;">เหตุผล</td>
        <td valign="top" style="padding: 14px 14px; font-family: ${EMAIL_FONT_STACK}; font-size: 15px; line-height: 23px; mso-line-height-rule: exactly; color: #475569;">${req.description || '-'}</td>
      </tr>
    </table>

    ${buildAppButtonHtml('👉 คลิกที่นี่เพื่อเปิดเข้าสู่ระบบ OMS', '#10b981')}

    <p style="margin: 20px 0 0 0; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-family: ${EMAIL_FONT_STACK}; font-size: 13px; line-height: 20px; mso-line-height-rule: exactly; color: #64748b; text-align: center;">
      เวลาที่ส่งคำขอ: ${new Date().toLocaleString('th-TH')}
    </p>
  `;

  const htmlBody = buildEmailLayout(
    '#3b82f6',
    '⚠️ คำขอโอทีใหม่เข้าระบบ',
    contentHtml,
    560
  );

  MailApp.sendEmail({
    to: CONFIG.REQ_TARGET_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.SENDER_NAME
  });
}
