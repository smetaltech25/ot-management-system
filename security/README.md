# Supabase Auth + RLS rollout

> Production Cutover ได้รับอนุมัติและดำเนินการวันที่ 24/08/2026 โดยยังคงคอลัมน์ Password เดิมไว้ชั่วคราวสำหรับ Emergency rollback

## สถานะ Production (24/08/2026)

- ผูก Supabase Auth กับ Profile ครบ 74/74 บัญชี ไม่มี Broken link, Duplicate link หรือ Orphan Auth user
- รหัสเดิมตัวเลข 4 หลักจำนวน 72 บัญชีใช้ Compatibility `legacy-4-digit-v1`; ผู้ใช้ยังกรอกรหัสเดิมได้
- เปิด RLS ครบ 10 ตาราง มี 28 Public policies และ 4 Avatar storage policies
- ถอน Legacy permissive policies และปิด `anon` access แล้ว
- ทดสอบ Login ผ่านสำหรับ SuperAdmin รหัสเดิม 4 หลัก, SuperAdmin รหัสปกติ และ User รหัสเดิม 4 หลัก
- ทดสอบผ่าน: Self profile, Company calendar visibility, Password column denial และ User ไม่สามารถแก้ Profile ผู้อื่น
- Deploy Edge Function `admin-user` บน Production แล้ว และทดสอบว่าเฉพาะ SuperAdmin ผ่าน Authorization

## สถานะ Staging (18/08/2026)

- Project: `OT-Management-System-Staging`
- Project ref: `hxxfecaiqhphknuotifz`
- Region: Singapore (`ap-southeast-1`)
- รัน `000_staging_schema.sql` และ `001_prepare_auth.sql` แล้ว
- ตรวจแล้ว: 10 ตาราง, `users.auth_user_id`, `user_directory` และ Automatic RLS ครบ
- ไม่มี Password พนักงานหรือรายการ OT จาก Production ถูกคัดลอกมา
- สร้าง Supabase Auth test users และผูกโปรไฟล์ครบ 4 Role แล้ว
- รัน `003_staging_seed.sql` และ `002_enable_rls.sql` บน Staging แล้ว
- รัน `004_calendar_company_visibility.sql` เพื่อให้ผู้ใช้ที่ Login ทุก Role ดูภาพรวม OT ทุกหน่วยงานในปฏิทินได้ โดยสิทธิแก้ไข/ลบ/อนุมัติยังคงเดิม
- ตรวจหลัง Migration: Policy `ot_requests_read_scope` เป็น `SELECT true` สำหรับ Role `authenticated`; การจำลอง Role `authenticated` อ่านคำขอทดสอบได้ครบ 2 รายการ และหน้า Calendar ของ `TEST-002` แสดงรายการของ `TEST-001` ได้
- เปิด RLS ครบ 10 ตาราง มี 28 Policies และ RPC `oms_review_steps`
- Audit ผ่าน: Active user ที่ไม่ผูก Auth = 0, `anon` อ่าน `users` ไม่ได้ และผู้ใช้ที่ Login แล้วอ่าน `password` ไม่ได้
- ทดสอบผ่าน: Login 4 Role, ส่งคำขอ, อนุมัติ Step 1 → 2 → 3, ปฏิทิน, รายงาน และหน้าจัดการผู้ใช้

## การจัดการ Password แบบ Supabase Auth (เตรียมใน Codebase 24/08/2026)

- Frontend รองรับ `OMS_AUTH_MODE = 'supabase'`: Login ผ่าน `signInWithPassword()` และใช้ Session ของ Supabase Auth
- หน้าเพิ่มผู้ใช้ยังรับ Password สำหรับสร้างบัญชีใหม่ แต่ไม่บันทึก Password จริงลง `public.users`
- หน้าแก้ไขไม่โหลด Password เดิม ช่อง Password จะว่าง และส่งค่าเฉพาะเมื่อต้องการตั้งรหัสใหม่
- Edge Function `supabase/functions/admin-user/index.ts` ตรวจผู้เรียกจาก JWT และยอมให้เฉพาะ Profile ที่เป็น `SuperAdmin`
- Edge Function ใช้ Admin API สร้าง/แก้ Supabase Auth user และเชื่อมกับ `users.auth_user_id`
- `005_admin_user_auth.sql` เพิ่มตัวสร้าง `USER-xxx` แบบใช้ Sequence โดยไม่ลบคอลัมน์ Password เดิม
- การลบผู้ใช้ยังคงเป็น Workflow เดิมและยังไม่ลบบัญชีใน Supabase Auth; แนะนำปิดสถานะจนกว่าจะอนุมัติ Delete Workflow แยก
- Production เดิมมี Password ตัวเลข 4 หลัก 72 บัญชี: หน้า Login จะแปลงค่าเดิมด้วย SHA-256 compatibility (`legacy-4-digit-v1`) ก่อนส่ง Supabase Auth ผู้ใช้จึงกรอกรหัสเดิมได้
- บัญชีใหม่และการตั้ง Password ใหม่บังคับอย่างน้อย 6 ตัวอักษรและไม่เกิน 72 bytes; compatibility ใช้เฉพาะค่าตัวเลข 4 หลักเดิมเท่านั้น
- ใน Auth mode ซ่อนปุ่มลบผู้ใช้ชั่วคราวเพื่อป้องกัน Auth account กำพร้า โดยยังปิด `status` ได้ตามเดิม

### ก่อนทดสอบ Auth User Management บน Staging

1. เปิดผ่าน `localhost` เพื่อให้ `config.js` เลือก Staging อัตโนมัติ ส่วน GitHub Pages ใช้ Production; ทั้งสอง Environment ใช้ `OMS_AUTH_MODE = 'supabase'`
2. รัน `005_admin_user_auth.sql` บน Staging
3. Deploy Function ชื่อ `admin-user` จาก `supabase/functions/admin-user`
4. ตรวจว่า SuperAdmin ที่ใช้ทดสอบมี `users.auth_user_id`, `role = 'SuperAdmin'` และ `status = true`
5. ทดสอบเพิ่มผู้ใช้, Login ด้วยบัญชีใหม่, แก้ Profileโดยเว้น Password และตั้ง Password ใหม่

### Production migration

1. Link CLI ไปยัง Production และรัน `001_prepare_auth.sql` กับ `005_admin_user_auth.sql`
2. รัน `migrate_production_auth.ps1 -ProjectRef <production-ref>`; Script ไม่แสดง Password และ Rollback บัญชีที่สร้างในรอบนั้นอัตโนมัติเมื่อเกิดข้อผิดพลาด
3. ตรวจว่า Active profile ทุกบัญชีเชื่อม `auth_user_id` แล้ว จึงรัน `002_enable_rls.sql`
4. Deploy `admin-user` ไป Production แล้วทดสอบ Login, RLS, Workflow และ Password reset ก่อนเปิด GitHub Pages
5. เก็บ Password เดิมใน `public.users` ไว้ชั่วคราวสำหรับ Emergency rollback โดย RLS ห้าม Client อ่านคอลัมน์นี้

> ห้ามนำ Secret/Service Role key ใส่ `config.js` หรือไฟล์ Frontend โดยเด็ดขาด ให้เก็บเฉพาะใน Supabase Edge Function Secrets

## สิ่งที่ตรวจพบก่อน Migration

- Login ปัจจุบันอ่าน `public.users.username/password` ด้วย `anon` key
- Session ปัจจุบันเก็บข้อมูลผู้ใช้ทั้งแถวใน `localStorage`
- หน้าเว็บอ่าน `users.select('*')` หลายจุด จึงยังเปิด RLS อย่างปลอดภัยไม่ได้
- Browser เขียน `ot_requests` และ `approval_steps` โดยตรง การอนุมัติควรย้ายเป็น Database RPC เพื่อให้การอัปเดตหลายตารางเป็น Transaction เดียว
- รูปพนักงานอัปโหลดเข้า Supabase Storage bucket `avatars`

## แผนเร็ว 4 ขั้น

1. **Backup + Staging** — ตรวจ Schema จริงและสร้างโครงสร้างทดสอบบน Project แยกโดยไม่คัดลอก Password/ข้อมูลพนักงาน
2. **Auth** — รัน `001_prepare_auth.sql`, สร้างผู้ใช้ใน Supabase Auth ด้วย Admin API และผูก `users.auth_user_id`
3. **Frontend** — Localhost ใช้ Supabase Auth, ไม่อ่าน `password` และใช้ RPC สำหรับการอนุมัติแล้ว
4. **RLS** — เปิดและทดสอบบน Staging แล้ว; ขั้นต่อไปคือเตรียม Production migration/cutover โดยยังไม่ลบข้อมูลเดิม

## เงื่อนไขก่อนเปิด RLS

- `users.auth_user_id` ของผู้ใช้ที่เปิดใช้งานครบ 100%
- Frontend ไม่มี `.eq('password', ...)`, ไม่มี `users.select('*')` และไม่เก็บข้อมูลทั้งแถวใน `localStorage`
- User สร้าง/แก้/ลบเฉพาะคำขอตนเอง แต่ผู้ใช้ที่ Login ทุก Role อ่านภาพรวม OT ของบริษัทผ่านปฏิทินได้
- ผู้อนุมัติดำเนินการได้เฉพาะ Step ที่มอบหมายและถึงลำดับแล้ว
- SuperAdmin จัดการผู้ใช้/ข้อมูลตั้งค่าได้
- Storage `avatars` มี Policy สำหรับอ่านและอัปโหลดตามสิทธิ์
- ผ่าน Login และงานหลักของ `User`, `SuperUser`, `Admin`, `SuperAdmin`

## ลำดับ Cutover

1. Deploy Frontend ที่รองรับ Supabase Auth
2. เปิด RLS ตารางอ้างอิงก่อน (`agency`, `departments`, `ot_types`, `holidays`, `day_of_week`)
3. เปิด `users`, `ot_requests`, `approval_steps`, `attachments`, `users_menu`
4. ตรวจ Login, ส่งคำขอ, อนุมัติบางรายการ/ทั้งหมด, ปฏิทิน, รายงาน และ Export
5. หลังระบบนิ่งค่อยลบคอลัมน์ `password` (เป็นงานทำลายข้อมูล ต้องอนุมัติแยก)
