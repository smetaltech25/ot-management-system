# การจำลองทดสอบ SQL/RPC และความพร้อมของฐานข้อมูลก่อน Deploy

กฎข้อบังคับในการพัฒนาและ Deploy สำหรับระบบ OverTime Management System (OMS):

1. **จำลองและตรวจสอบความพร้อมของ SQL/RPC ก่อน Deploy เสมอ:**
   - เมื่อมีการเพิ่มหรือแก้ไข SQL Migration, RPC Function, View หรือ RLS Policy ในฐานข้อมูล ต้องตรวจสอบ Logic ให้ครอบคลุมทุกสถานะ (Status) เช่น `Pending`, `Approved`, `Rejected` และ Step ต่างๆ (เช่น Step 1, Step 2, Step 3)
   - ตรวจสอบสิทธิ์ Row Level Security (RLS) ว่าครอบคลุม Role ที่เกี่ยวข้อง (SuperAdmin, Approver, User) ไม่ให้เกิดปัญหา Silent Block (คำสั่ง UPDATE สำเร็จแต่ affected rows เป็น 0)
   - โค้ดฝั่ง Frontend ที่เรียก Database หรือ Direct Update ต้องมีกลไกตรวจสอบจำนวนแถวที่ได้รับผลกระทบ (เช่น `.select('id')`) ก่อนสรุปว่าสำเร็จ

2. **แจ้งเตือนและยืนยันการรัน SQL Migration ก่อนการทดสอบจริง:**
   - เมื่อมีการสร้างไฟล์ SQL Migration ใหม่ (เช่น ในโฟลเดอร์ `security/`) ต้องแจ้งเตือนพี่ต้นอย่างชัดเจนให้รันสคริปต์บน Supabase SQL Editor ก่อนเสมอ
   - ห้ามเริ่มทดสอบข้อมูลจริงบนเว็บ Production/Staging จนกว่าจะได้รับการยืนยันว่ารัน SQL Migration เรียบร้อยแล้ว เพื่อให้ Frontend และ Database ทำงานสอดรับกันอย่างถูกต้อง
