# Supabase Auth + RLS rollout (ฉบับกระชับ)

> ไฟล์ในโฟลเดอร์นี้เป็น **Draft สำหรับตรวจสอบเท่านั้น** ห้ามรันบน Production จนกว่า Frontend จะเปลี่ยนไปใช้ Supabase Auth และผ่านการทดสอบบน Staging

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

## สิ่งที่ตรวจพบ

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
