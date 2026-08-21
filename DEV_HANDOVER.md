# 📑 บันทึกสถานะการพัฒนาและการส่งต่องาน (DEV HANDOVER LOG)
**โปรเจกต์:** OverTime Management System (OMS)  
**วันที่บันทึก:** 21 สิงหาคม 2026  
**ผู้บันทึก:** แอ๊น (Antigravity) ส่งต่อให้ น้องจ๊ะ (Codex) & พี่ต้น 💖  

---

## 🌐 1. ข้อมูลสภาพแวดล้อมระบบ (Environment Overview)

* **Production URL (GitHub Pages):** [https://smetaltech25.github.io/ot-management-system/](https://smetaltech25.github.io/ot-management-system/)
* **Production Database (Supabase):** `https://hperamyypofcxajmrskq.supabase.co` (Auth Mode: Legacy)
* **Staging Database สำหรับทดสอบ RLS & Auth:** `https://hxxfecaiqhphknuotifz.supabase.co`
* **Current Script Cache Version:** `v=20260821-6` (ใน `index.html`)
* **GitHub Repository:** `https://github.com/smetaltech25/ot-management-system.git` (Branch: `main`)

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
