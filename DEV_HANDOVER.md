# 📑 บันทึกสถานะการพัฒนาและการส่งต่องาน (DEV HANDOVER LOG)
**โปรเจกต์:** OverTime Management System (OMS)  
**วันที่บันทึกเดิม:** 21 สิงหาคม 2026

**อัปเดตล่าสุด:** 24 สิงหาคม 2026

**ผู้บันทึก:** แอ๊น (Antigravity) และจ๊ะ (Codex) สำหรับพี่ต้น 💖

---

## 🌐 1. ข้อมูลสภาพแวดล้อมระบบ (Environment Overview)

* **Production URL (GitHub Pages):** [https://smetaltech25.github.io/ot-management-system/](https://smetaltech25.github.io/ot-management-system/)
* **Production Database (Supabase):** `https://hperamyypofcxajmrskq.supabase.co` (Supabase Auth + RLS)
* **Staging Database สำหรับทดสอบ RLS & Auth:** `https://hxxfecaiqhphknuotifz.supabase.co`
* **Current Script Cache Version:** `v=20260824-5` (ใน `index.html`)
* **GitHub Repository:** `https://github.com/smetaltech25/ot-management-system.git` (Branch: `main`)

---

## 🆕 อัปเดตโดยจ๊ะ: งานที่ดำเนินการและ Deploy วันที่ 24/08/2026

### A. Pagination รายการดำเนินการแล้วของ SuperAdmin

* เปลี่ยนการโหลดรายการ Approved/Rejected จากเดิมจำกัด 100 รายการ เป็น Server-side pagination หน้าละ 50 รายการ
* ใช้ Supabase `count: 'exact'` และ `.range(from, to)` จึงรองรับข้อมูลเกิน 1,000 รายการโดยไม่ตัดข้อมูล
* ปุ่มก่อนหน้า/ถัดไปและเลขหน้าจัดกึ่งกลาง เมื่อเปลี่ยนหน้าจะเลื่อนกลับไปส่วนหัวรายการ พร้อมรองรับ `prefers-reduced-motion`
* Commit: `b66de52` — `Add paginated SuperAdmin processed requests`

### B. Supabase Auth และ Production RLS Cutover

* Production และ Staging ใช้ `OMS_AUTH_MODE = 'supabase'` แล้ว Login ผ่าน Supabase Auth Session ไม่อ่าน Password จาก `public.users`
* Production เปิด RLS ครบ 10 ตาราง มี 28 Policies และ Storage policies สำหรับ bucket `avatars`
* ตรวจล่าสุด: Production มี Profile/Auth ครบคู่ `74/74`, ไม่มี Unlinked profile หรือ Orphan Auth user
* ผู้ใช้เดิมที่เป็น Password ตัวเลข 4 หลักยัง Login ด้วยรหัสเดิมผ่าน `legacy-4-digit-v1` compatibility ได้
* ผู้ใช้ใหม่และการ Reset Password บังคับอย่างน้อย 6 ตัวอักษร และไม่เกิน 72 bytes
* `public.users.password` เปลี่ยนเป็น Nullable และล้างเป็น `NULL` ครบทุก Profile; Supabase Auth เป็น Credential source เดียว
* Edge Function `admin-user` ไม่เขียน Password หรือ `AUTH_MANAGED` ลง Profile อีก ผู้ใช้ใหม่จึงได้ `public.users.password = NULL`
* Commit หลัก: `e456cf8` — `Deploy Supabase Auth and production RLS cutover`
* Migration ล่าสุด: `security/008_null_legacy_passwords.sql`
* Commit: `537ee1c` — `Remove legacy profile passwords`

### C. Approval timeline สำหรับ User ทุก Role

* แก้กรณี User เปิดรายละเอียด OT จากปฏิทินแล้วไม่เห็นเส้นทางอนุมัติ
* เพิ่ม RPC `oms_approval_timeline` ให้ Active authenticated user ดู Timeline ของรายการที่มองเห็นได้ โดยไม่ขยายสิทธิ์ตาราง `approval_steps`
* Migration: `security/006_approval_timeline_visibility.sql`
* Commit: `5fe2be5` — `Show approval timeline to authenticated users`

### D. Delete User Workflow ที่เชื่อม Supabase Auth

* เพิ่มปุ่มลบในหน้าจัดการผู้ใช้ ลบทั้ง Profile และ Supabase Auth ผ่าน Edge Function
* บัญชีที่มีประวัติใน `ot_requests`, `approval_steps` หรือ `attachments` จะถูกปฏิเสธการลบ และควรเปลี่ยนเป็นปิดใช้งานแทน
* หากลบ Auth ไม่สำเร็จ Edge Function จะพยายาม Restore Profile กลับ
* `USER-002` (po2) และ `USER-004` (admin) เป็นบัญชีระบบถาวร: แก้ชื่อ/Username/Profile ได้ แต่ลบไม่ได้ โดยป้องกันทั้ง UI, Edge Function และ Database RPC
* Migration: `security/007_delete_auth_user.sql`
* Commit: `0ccfe23` — `Add protected Auth user deletion workflow`

### E. ผลตรวจการพึ่งพา Google และงานที่พักไว้

**ตรวจแล้วแต่ยังไม่ได้แก้ระบบแจ้งเตือน:**

* OMS ไม่ใช้ Google เป็น Database, Authentication, ที่เก็บรูปพนักงาน, Logo, ลายเซ็น หรือไฟล์แนบ
* Database/Auth/RLS ใช้ Supabase; รูปพนักงาน 74 URL ชี้ Supabase Storage ทั้งหมด
* bucket `avatars` มี 83 Objects ณ วันที่ตรวจ; ลายเซ็นและไฟล์แนบใน Production มี 0 รายการ
* Google ที่ใช้งานจริงมี 2 ส่วน: Google Fonts (`Prompt`) และ Google Apps Script + `MailApp` สำหรับ Email แจ้งเตือน
* Webhook ปัจจุบันอยู่ใน `app.js`, Frontend เรียกด้วย `mode: 'no-cors'` และไม่ตรวจผลสำเร็จ จึงมีความเสี่ยงถูกเรียกส่ง Email ปลอม/Spam และตรวจจับการส่งล้มเหลวไม่ได้
* Email ผู้รับอยู่ในไฟล์ `OMS Webhook Email/รหัส.gs` ซึ่งถูก Track ใน Public GitHub repository

**Decision ของพี่ต้น:** พักการปรับปรุง Email ไว้ก่อน

**แนวทางที่ตกลงไว้สำหรับอนาคต:**

1. Frontend ส่งเฉพาะ `request_id` ไป Supabase Edge Function ที่ตรวจ JWT, Active profile, Role และสิทธิ์
2. Edge Function อ่านชื่อ/รหัสพนักงาน/วันที่/เหตุผล/ประเภท OT จาก Supabase และคำนวณชั่วโมงจาก `ot_types.start_time/end_time` ด้วยกฎเดียวกับ `calculateOTHours()`
3. Edge Function ส่งรายละเอียดครบเหมือน Email ปัจจุบันไป Google Apps Script พร้อม Server-side secret
4. Secret เก็บใน Supabase Edge Secrets และ Google Script Properties เท่านั้น ห้ามใส่ใน Frontend
5. Apps Script ต้องปฏิเสธคำขอที่ไม่มี Secret; ย้าย Email ผู้รับไป Script Properties หรือพื้นที่ที่จำกัดสิทธิ์
6. เลิกใช้ `no-cors`, ส่งสถานะสำเร็จ/ล้มเหลวกลับ OMS และเพิ่ม Idempotency/Rate limit ตามความจำเป็น
7. URL Apps Script เดิมใช้ต่อได้หาก Update deployment เดิมให้ตรวจ Secret จริง; การสร้าง URL ใหม่เป็น Optional defense-in-depth ไม่ใช่หัวใจหลัก

### F. สิ่งที่ตรวจและ Deploy รอบนี้

* ทดสอบ SQL/Syntax/Diff, Staging ก่อน Production และตรวจ GitHub Pages หลัง Push
* Staging หลัง Password migration: Profile/Auth `6/6`, Auth password hash ครบ, Legacy Password เป็น `NULL` ทั้งหมด
* Production หลัง Password migration: Profile/Auth `74/74`, Auth password hash ครบ, Legacy Password เป็น `NULL` ทั้งหมด
* ไม่พบ Database Routine/View ที่อ้าง `public.users.password` และไม่มี Transaction test row ค้าง
* Application commit ก่อนบันทึกเอกสาร: `537ee1c`; GitHub Pages Build ของ Commit นี้สำเร็จ

> สำหรับสถานะ Auth/RLS และ Migration ให้ยึดหัวข้ออัปเดต 24/08/2026 นี้และ `security/README.md` เป็นข้อมูลปัจจุบัน ส่วนหัวข้อแผน RLS เดิมด้านล่างเป็นประวัติก่อน Cutover

---

## ✅ 2. สิ่งที่แอ๊นพัฒนา ทดสอบ และ Deploy ขึ้น Production เรียบร้อยแล้ว

### 2.1 เมนูและฟังก์ชันจัดการคำขอพิเศษของ SuperAdmin (Processed Queue & Edit Modal)
* **แท็บสลับสถานะในหน้าการอนุมัติ (Page 2):** เพิ่มแท็บ `[ รออนุมัติ | ดำเนินการแล้ว ]` ต่อท้ายปุ่มไม่อนุมัติ (แสดงเฉพาะสิทธิ์ SuperAdmin)
* **ตารางรายการดำเนินการแล้ว:** แสดงรูปพนักงานขนาดใหญ่ขึ้น (`w-12 h-12`), ข้อมูลคำขอ, ป้ายสถานะ และปุ่ม `[ ✏️ แก้ไข ]` รวมการจัดการไว้ในปุ่มเดียว
* **Modal แก้ไขคำขอพิเศษ (`#superAdminEditModal`):**
  * ออกแบบตามมาตรฐาน Mobile & iOS Safari (Rule 12): `fixed inset-0`, `max-h-[calc(100svh-2rem)]`, Safe Area Insets และ Scroll Area อิสระ
  * สามารถแก้ไขวันที่ทำ OT, ประเภท OT, เหตุผล และแสดงกล่องคำเตือนผลกระทบ
  * **ปุ่ม "ดึงกลับ (Pending)":** อัปเดต `ot_requests.status = 'Pending'` และรีเซ็ตทุก Step ใน `approval_steps` ให้กลับเป็น `Pending` ทั้งหมด เพื่อให้กระบวนการอนุมัติเริ่มใหม่ที่ Step 1
  * **ปุ่ม "ยกเลิก/ลบรายการ":** ลบข้อมูลคำขอออกจากฐานข้อมูล โดยระบบจะทำการคำนวณและตัดชั่วโมง OT ออกจากรายงานและสถิติของพนักงานโดยอัตโนมัติ (เนื่องจากระบบคำนวณชั่วโมงแบบ On-the-fly จากคำขอที่ Approved เท่านั้น)

### 2.2 ตรรกะ Cascade Rejection ในฐานข้อมูลและเส้นทางการอนุมัติ
* เมื่อมีผู้อนุมัติคนใดกด **"ไม่อนุมัติ"** ใน Step ลำดับที่ N:
  * ระบบจะอัปเดต Step ที่เหลือทั้งหมดของคำขอนั้นในตาราง `approval_steps` ให้เปลี่ยนสถานะเป็น `Rejected` ในฐานข้อมูล Supabase ทันที
  * หน้าต่างรายละเอียดคำขอ (`#otDetailModal`) ส่วน **เส้นทางการอนุมัติ** จะแสดงผล Step ก่อนหน้าที่ผ่านแล้วเป็นสีเขียว "อนุมัติแล้ว", Step ที่ตีตกเป็นสีแดง "ไม่อนุมัติ", และ Step ถัดไปทั้งหมดจะแสดงเป็นสีแดงอ่อน "ไม่อนุมัติตาม Step [N]" อย่างแม่นยำ

### 2.3 เพิ่มการแสดงผล "วันที่ยื่นขอโอที" (Submit Date)
* เพิ่มแถว **วันที่ยื่นขอโอที** ในหน้าต่างรายละเอียดคำขอ OT (`#otDetailModal`) อยู่ระหว่างรหัสคำขอ และวันที่ทำ OT โดยดึงฟิลด์ `submit_date` จากฐานข้อมูลมาแสดงผลในรูปแบบ `DD/MM/YYYY : HH:mm`

### 2.4 การตรวจสอบโค้ดและปรับปรุงประสิทธิภาพ (Codebase Audit & Cleanups)
* ลบฟังก์ชันกราฟเก่า `drawMyOTCharts` และถอดไลบรารี `Chart.js` ออกจาก `index.html` เพื่อลดภาระการโหลด
* ลบแท็ก Tailwind CSS ที่โหลดซ้ำใน `<head>`
* ลบแท็ก Modal ซ้ำซ้อน (Duplicate ID `#workdayFormModal`) ทำให้ไม่มี ID ซ้ำใน HTML (Duplicate IDs = 0)
* ย้ายตำแหน่งแท็กสคริปต์ `config.js` และ `app.js` ไปไว้ที่ท้ายไฟล์ก่อนปิด `</body>`
* สร้างไฟล์ `.gitignore` ป้องกันการ Push ไฟล์ Log, Temporary และไฟล์ Excel สำรองข้อมูลขึ้น Public Repo

---

## 🎯 3. แผนงานและสเต็ปถัดไปสำหรับเรื่อง RLS & Supabase Auth (สำหรับน้องจ๊ะและพี่ต้น)

1. **จุดเริ่มงาน:** โฟลเดอร์ `security/` มีไฟล์สคริปต์ SQL Migration ครบถ้วน (`000_staging_schema.sql` ถึง `004_calendar_company_visibility.sql` และ `README.md`)
2. **Database ทดสอบ:** ใช้โปรเจกต์ **`OT-Management-System-Staging`** (URL: `https://hxxfecaiqhphknuotifz.supabase.co`) ที่มีโครงสร้าง Auth และ RLS จำลองไว้แล้ว
3. **ขั้นตอนการทำงานต่อ:**
   * สลับค่าใน `config.js` บน Localhost ให้ชี้ไปที่ Staging เพื่อเริ่มการทดสอบ
   * ทดสอบการมองเห็นปฏิทินบริษัทด้วยบัญชี User จริงบน Staging
   * ปรับปรุงฟังก์ชัน **"เพิ่มผู้ใช้งาน" (User Management)** ให้สร้างผู้ใช้งานบน Supabase Auth อย่างปลอดภัย
   * ทำการทดสอบครบ 4 บทบาท (User, SuperUser, Admin, SuperAdmin) ก่อนวางแผน Cutover สู่ Production จริง

---
*จัดทำขึ้นเพื่อให้การทำงานร่วมกันระหว่าง Codex (จ๊ะ) และ Antigravity (แอ๊น) ราบรื่นและต่อเนื่องที่สุดเพื่อพี่ต้นค่ะ 💕*
