# 📑 บันทึกสถานะการพัฒนาและการส่งต่องาน (DEV HANDOVER LOG)
**โปรเจกต์:** OverTime Management System (OMS)  
**วันที่บันทึกเดิม:** 21 สิงหาคม 2026

**อัปเดตล่าสุด:** 1 กันยายน 2026

**ผู้บันทึก:** แอ๊น (Antigravity) และจ๊ะ (Codex) สำหรับพี่ต้น 💖

---

## 🌐 1. ข้อมูลสภาพแวดล้อมระบบ (Environment Overview)

* **Production URL (GitHub Pages):** [https://smetaltech25.github.io/ot-management-system/](https://smetaltech25.github.io/ot-management-system/)
* **Production Database (Supabase):** `https://hperamyypofcxajmrskq.supabase.co` (Supabase Auth + RLS)
* **Staging Database สำหรับทดสอบ RLS & Auth:** `https://hxxfecaiqhphknuotifz.supabase.co`
* **Current Application Script Cache Version:** `app.js?v=20260901-3` (ใน `index.html`)
* **GitHub Repository:** `https://github.com/smetaltech25/ot-management-system.git` (Branch: `main`)

---

## 🆕 อัปเดตโดยจ๊ะ: Active Menu โหมดสว่าง Deploy วันที่ 01/09/2026

### A. รูปแบบที่ปรับปรุง

* ปรับเมนู Sidebar ที่กำลังใช้งาน (`active-menu`) ใน Light Mode ให้แสดงเป็นแถบสีน้ำเงินเต็มพื้นที่ตามตัวอย่างที่พี่ต้นเลือก
* เปลี่ยนข้อความและไอคอนของเมนู Active เป็นสีขาว พร้อมเพิ่มเงาสีน้ำเงินแบบนุ่มเพื่อแยกสถานะจากเมนูอื่นอย่างชัดเจน
* เมื่อ Hover บนเมนู Active สีพื้นจะเข้มขึ้นเล็กน้อย โดยยังรักษาความอ่านง่ายของข้อความและไอคอน
* จำกัด CSS ด้วย `html:not(.dark)` จึงไม่เปลี่ยนสีหรือพฤติกรรมของ Active Menu ใน Dark Mode
* การเปลี่ยนครั้งนี้ไม่แก้ JavaScript, Event handler, Navigation, Permission, Database, RLS หรือ Authentication

### B. ไฟล์, Commit และผลตรวจ

* ไฟล์แอปที่แก้: `index.html`
* Commit `a2dc9f1` — `Style active menu in light mode`
* ตรวจ `node --check app.js` และ `git diff --check` ผ่าน
* ทดสอบ Computed style บน Localhost: Light Mode ใช้พื้น `#3b82f6`, ข้อความ/ไอคอนสีขาว และเงาสีน้ำเงิน; Dark Mode ยังคงพื้นน้ำเงินโปร่งใสและข้อความสีฟ้าตามรูปแบบเดิม
* ทดสอบ viewport มือถือ `390 × 844`: ไม่พบ Horizontal overflow และวงแหวนสีขาวของ Badge ยังแยกจากพื้นเมนูสีน้ำเงินได้ชัดเจน
* Deploy Commit `a2dc9f1` ขึ้น GitHub `main` สำเร็จ และพี่ต้นตรวจ Production ยืนยันว่ารูปแบบสวยงามถูกต้องแล้ว

---

## 🆕 อัปเดตโดยจ๊ะ: Badge จำนวนรายการรออนุมัติ Deploy วันที่ 01/09/2026

### A. ขอบเขตและกติกาการนับ

* เพิ่ม Badge ตัวเลขสีแดงท้ายเมนู `การขออนุญาต` เพื่อให้ผู้อนุมัติเห็นจำนวนงานค้างจาก Sidebar ทันที
* นับเฉพาะ `approval_steps` สถานะ `Pending` ที่กำหนดให้ผู้ใช้งานปัจจุบัน และ Step ก่อนหน้าของคำขอนั้นต้องเป็น `Approved` ครบแล้ว จึงเป็นจำนวนรายการที่สามารถอนุมัติได้จริงในขณะนั้น
* Role `User` ไม่แสดงเมนูอนุมัติตามสิทธิ์เดิมและไม่ Query จำนวน Badge
* จำนวน `0` จะซ่อน Badge, `1–99` แสดงตามจริง และมากกว่า `99` แสดง `99+` โดย Accessibility label ยังระบุจำนวนจริง
* Badge รองรับ Sidebar แบบย่อ/ขยาย, Mobile, Light Mode และ Dark Mode

### B. จุดที่รีเฟรชและผลกระทบ

* รีเฟรชจำนวนหลัง Login, เมื่อเปิดหรือรีโหลดหน้าการอนุมัติ, หลังอนุมัติ/ไม่อนุมัติ และหลัง SuperAdmin ดึงรายการกลับเป็น Pending
* เมื่อ Logout ระบบยกเลิกผล Query เก่าและซ่อน Badge เพื่อป้องกันจำนวนของผู้ใช้ก่อนหน้าแสดงค้าง
* ใช้ Load token ตรวจ User/Request ล่าสุด ป้องกันผล Query เก่ากลับมาทับหลังเปลี่ยน Session
* ใช้กติกาการหา Eligible step ร่วมกับตารางรออนุมัติ จึงไม่เกิดความต่างระหว่างจำนวนบน Badge กับรายการที่ผู้ใช้ดำเนินการได้
* การเปลี่ยนครั้งนี้ไม่แก้ Database schema, RLS, Authentication, Approval workflow หรือสิทธิ์ของ Role ใด

### C. ไฟล์, Commit และผลตรวจ

* ไฟล์ที่แก้: `index.html`, `app.js`
* Commit `3707acd` — `Add pending approval menu badge`
* ตรวจ `node --check app.js`, `git diff --check` และ JavaScript Console ผ่าน
* Logic test ผ่าน `5/5`: Step 1, Step 2 ที่ยังรอ Step ก่อนหน้า, Step 2 ที่พร้อมอนุมัติ, ค่า `0` และค่าเกิน `99`
* GitHub Pages Run `33490763127` Build/Deploy สำเร็จ และ Production ตรวจพบ `app.js?v=20260901-3`
* พี่ต้นตรวจ Production ด้วยบัญชีจริงและยืนยัน Badge แสดง `57` รายการถูกต้องแล้ว

---

## 🆕 อัปเดตโดยจ๊ะ: ปรับสีปุ่ม Dark Mode และหน้า Departments Deploy วันที่ 01/09/2026

### A. Dark Surface + Semantic Accent

* ปรับปุ่มในหน้า Login, รายการรออนุมัติ, รายการดำเนินการแล้วของ SuperAdmin และ Modal แก้ไขคำขอพิเศษ ให้กลมกลืนกับพื้นหลัง Dark Mode
* ใช้สีตามความหมายเดิมของคำสั่ง: น้ำเงินสำหรับ Login/Reload/Search/Save, เขียวสำหรับ Approve, แดงสำหรับ Reject/Delete, เหลืองอำพันสำหรับ Edit/Reset และ Slate สำหรับปุ่มรองหรือยกเลิก
* ปรับ Tab `รออนุมัติ | ดำเนินการแล้ว` ให้ใช้พื้น Slate มืดและแสดง Active state ด้วยข้อความ/ขอบสีน้ำเงิน
* สีเหล่านี้ทำงานเฉพาะ Dark Mode; Light Mode ยังคงสีเดิมและไม่มีการเปลี่ยน Workflow หรือ Event handler ของปุ่ม
* Commit `8177558` — `Refine dark mode action buttons`

### B. หน้า Departments และ Modal เพิ่ม/แก้ไขฝ่าย

* ปรับปุ่ม `เพิ่มฝ่าย` และ `บันทึกข้อมูล` เป็น Teal แบบโปร่งใน Dark Mode
* ปรับปุ่มแก้ไขเป็น Amber, ปุ่มลบเป็น Red และปุ่มยกเลิกเป็น Slate ให้สอดคล้องกับ Semantic palette ของหน้าอื่น
* ปรับ Header และ Title ของ Modal เพิ่ม/แก้ไขฝ่ายให้ใช้ Teal accent บนพื้นมืด
* ปรับ Modal ให้รองรับ iPhone Safari/Chrome ด้วย `fixed inset-0`, Safe Area Insets, `max-height: calc(100svh - 2rem)` และให้เลื่อนเฉพาะ Modal Body
* การเปลี่ยนครั้งนี้ไม่แตะ Supabase query, CRUD function, Database schema, RLS, Authentication หรือสิทธิ์ผู้ใช้งาน
* Commit `5842f55` — `Polish department dark mode controls`

### C. ผลตรวจและ Deployment

* ไฟล์แอปที่แก้: `index.html`, `app.js`
* ตรวจ `node --check app.js` และ `git diff --check` ผ่าน
* ตรวจ Computed style ของปุ่มใน Light/Dark Mode ครบตาม Semantic palette และไม่พบ JavaScript Console Error
* ทดสอบหน้า Login ที่ viewport `390 × 844`: ไม่มี Horizontal overflow
* ตรวจโครง Modal Departments: Panel ใช้ Flex/Overflow hidden, Body ใช้ `overflow-y: auto`, `min-height: 0` และจำกัดความสูงด้วย `100svh`
* GitHub Pages Run `33456980685` และ `33457858322` Build/Deploy สำเร็จ
* Production ตรวจพบ `app.js?v=20260901-2` และ Class ชุดสี Departments เวอร์ชันใหม่แล้ว
* พี่ต้นตรวจ Production และยืนยันว่าผลการทำงานถูกต้องแล้ว

---

## 🆕 อัปเดตโดยจ๊ะ: ระบบค้นหาหน้าอนุมัติ Deploy วันที่ 31/08/2026

### A. ขอบเขตและพฤติกรรมการค้นหา

* เพิ่มช่องค้นหา ปุ่ม `ค้นหา` และปุ่มล้างคำค้นในหน้า **รายการขออนุญาต OT (Page 2)**
* ใช้ได้ทั้งแท็บ **รออนุมัติ** และ **ดำเนินการแล้ว (SuperAdmin)**
* ค้นหาจากชื่อ–นามสกุล, รหัสคำขอ OT, รหัส/ชื่อหน่วยงาน และรหัส/ชื่อฝ่าย
* รองรับการกดปุ่ม `ค้นหา`, กด `Enter` และ Live Search ตั้งแต่ตัวอักษรแรก
* Live Search ใช้ Debounce `300 ms` หลังหยุดพิมพ์ เพื่อลด Query ซ้ำระหว่างพิมพ์
* รองรับคำค้นหลาย Token เช่น `S M` โดยแต่ละ Token สามารถตรงกับข้อมูลคนละส่วนของข้อความค้นหาได้
* เมื่อคำค้นเปลี่ยน ระบบกลับไปหน้า 1; เมื่อกดปุ่มล้าง ระบบคืนรายการทั้งหมดและ Focus กลับช่องค้นหา
* แสดงจำนวนรายการที่พบเทียบกับจำนวนทั้งหมดผ่าน `aria-live` และรองรับการใช้งานบน Mobile โดยช่องค้นหา/ปุ่มจัดเรียงตามความกว้างหน้าจอ

### B. การรองรับข้อมูลจำนวนมากและ Pagination

* โหมดปกติของแท็บดำเนินการแล้วยังคงใช้ Server-side pagination หน้าละ `50` รายการ ไม่เปลี่ยน Data flow เดิม
* เมื่อมีคำค้น ระบบดึงรายการ Approved/Rejected ทุกชุดจาก Supabase ด้วย `.range()` ชุดละ `1,000` รายการ แล้วค้นหาจากข้อมูลครบทุกหน้า ไม่ได้ค้นเฉพาะ 50 รายการที่กำลังแสดง
* ผลค้นหายังคงแบ่งหน้าละ `50` รายการ
* Cache ชุดข้อมูลค้นหาของแท็บดำเนินการแล้วไว้ระหว่างเปลี่ยนหน้าและเปลี่ยนคำค้น เพื่อลดการโหลดข้อมูลทั้งหมดซ้ำ
* ปุ่ม `รีโหลด` และการแก้ไข/ดึงกลับ/ลบรายการโดย SuperAdmin จะล้าง Cache ก่อนโหลดข้อมูลล่าสุด
* การเปลี่ยนครั้งนี้ไม่แก้ Database schema, RLS, Authentication, Approval workflow หรือสิทธิ์ของ Role ใด

### C. ไฟล์, Commit และผลตรวจ

* ไฟล์ที่แก้: `index.html`, `app.js`
* Commit `9eb1e3a` — `Add approval request search`
* Commit `bcc7c36` — `Enable live approval search`
* GitHub Pages ของทั้งสอง Commit Build และ Deploy สำเร็จ; Production ตรวจพบ `app.js?v=20260831-2`
* ตรวจ JavaScript syntax และ `git diff --check` ผ่าน
* ทดสอบ Field matching เดิม `8/8`, Live Search/Debounce `2/2` และ Single-character/Multi-token matching `6/6`
* ทดสอบจำลองรายการดำเนินการแล้ว `2,070` รายการ: โหลดครบ `2,070/2,070` ผ่านช่วง `0–999`, `1000–1999`, `2000–2999`
* Localhost โหลด Asset เวอร์ชันใหม่และไม่พบ JavaScript Console Error
* พี่ต้นทดสอบบนระบบจริงและยืนยันว่าระบบทำงานได้ดีแล้ว

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
