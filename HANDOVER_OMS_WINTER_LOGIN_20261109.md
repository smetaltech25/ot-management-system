# ใบส่งต่องาน: หน้า Login ธีมฤดูหนาว OMS และ LMS

**วันที่:** 9 พฤศจิกายน 2026

**สถานะ:** โค้ดธีมและแพตช์เวอร์ชันแคชเผยแพร่แล้วทั้งสองระบบ; เอกสารฉบับนี้บันทึกผลที่ตรวจได้ ณ วันดังกล่าว

## 1. งานที่ส่งมอบ

| ระบบ | Production | Repository / วิธีเผยแพร่ | Commit ที่ตรวจ |
| --- | --- | --- | --- |
| OMS | https://smetaltech25.github.io/ot-management-system/ | `smetaltech25/ot-management-system`, push `main` ด้วยบัญชี `smetaltech25` แล้ว GitHub Pages เผยแพร่ | `fa5bec6` ธีม, `9de99ec` แคช |
| LMS | https://smetaltech26.github.io/leave-management-system/ | `smetaltech26/leave-management-system`, push `main` และรัน `npm run deploy` เพื่อ publish `gh-pages` ด้วยบัญชี `smetaltech26` | `27f53a0` บน `main`, `49e4810` บน `gh-pages` |

ทั้งสองระบบใช้คนละบัญชี GitHub ตามเจ้าของ repository การส่ง OMS ใช้ token ของ `smetaltech25` เฉพาะคำสั่ง จึงไม่ได้เปลี่ยนบัญชีเริ่มต้นของ GitHub CLI หรือบันทึก token ลงในโปรเจกต์

## 2. จุดเปลี่ยนใน OMS

| ไฟล์ | สิ่งที่เปลี่ยน |
| --- | --- |
| `index.html` | เปลี่ยนโครงหน้า Login ให้ตรงแนวภาพ LMS; คง ID ช่องกรอกและการเรียก `loginUsersSupabase()`; อ้าง `login-winter.css?v=20261109-1` และ `app.js?v=20261109-1` |
| `login-winter.css` | กำหนดภาพพื้นหลัง, การ์ด, ฟอร์ม, Dark Mode, safe area, ขนาดมือถือ และ reduced motion เฉพาะหน้า Login |
| `app.js` | เพิ่มการสร้างและสลับหิมะ; ปรับไอคอน Dark Mode และแสดงรหัสผ่านของหน้า Login โดยไม่เปลี่ยนกระบวนการยืนยันตัวตน |
| `assets/login-winter-background.png`, `assets/smt-logo.jpg` | ใช้ภาพต้นฉบับชุดเดียวกับ LMS โดยเก็บเป็นไฟล์ใน OMS เพื่อลดการพึ่งพา URL ภายนอกบนหน้า Login |

ไม่มีการเปลี่ยน schema, migration, RLS, Supabase Auth configuration, dependency หรือ workflow ของหน้าหลัง Login

## 3. ผลตรวจและหลักฐานการเผยแพร่

- OMS: `node --check app.js` ผ่าน; `node --test tests/ot-workflow.test.js` ผ่าน 8/8; `git diff --check` ผ่านก่อน commit
- OMS: ตรวจภาพใน Edge ขนาด Desktop และกรอบ viewport 390px กับ 320px; ตรวจ Dark Mode, ปุ่มหิมะ และปุ่มแสดงรหัสผ่าน
- LMS: `npm run build` ผ่าน และ `npm run deploy` แสดง `Published`
- Production OMS: URL ปกติตอบ HTTP 200; HTML เรียก `app.js?v=20261109-1` และ `login-winter.css?v=20261109-1`; JS/CSS และภาพใหม่ตอบ HTTP 200
- Production LMS: URL ปกติตอบ HTTP 200; HTML เรียก Vite asset hash `index-C85kyw8u.js` และ `index-BOpWzpFT.css`; asset และภาพฤดูหนาวตอบ HTTP 200
- เปิดหน้า Login จริงของทั้งสองเว็บใน Edge Desktop แล้วเห็นธีมฤดูหนาว; `main` ของทั้งสอง repo ตรงกับ remote และไม่มีไฟล์งานค้างหลัง deploy

**ยังไม่ได้ตรวจ:** การเข้าสู่ระบบด้วยบัญชีผู้ใช้จริง และ Safari/Chrome บน iPhone จริง จึงไม่ควรอ้างว่าสองส่วนนี้ผ่านแล้ว

## 4. สิ่งที่ผู้รับช่วงต่อควรรู้

1. GitHub Pages ของ OMS ส่ง `Cache-Control: max-age=600` สำหรับ HTML/asset เบราว์เซอร์ที่เปิดเว็บก่อน deploy อาจเก็บ HTML เก่าไว้ราว 10 นาที แม้ไฟล์ JS/CSS ใหม่จะพร้อมแล้ว หากต้องการเห็นทันทีให้เปิด URL พร้อม query ใหม่หรือ hard refresh หนึ่งครั้ง
2. เมื่อแก้ `app.js` หรือ `login-winter.css` ครั้งต่อไป ให้เปลี่ยน `?v=` ใน `index.html` ตาม release ใหม่ แล้วตรวจ HTML ที่ Production เสิร์ฟจริง รวมถึงไฟล์ที่ HTML อ้าง; การ push สำเร็จอย่างเดียวไม่ยืนยันว่า GitHub Pages อัปเดตแล้ว
3. OMS เป็นเว็บ HTML/JavaScript ตรง ๆ และเผยแพร่จาก `main`; LMS เป็น React/Vite และเผยแพร่ไฟล์ build ไป `gh-pages` ด้วย `npm run deploy` อย่าใช้ขั้นตอน deploy ของสอง repo สลับกัน
4. หากตรวจ regression ให้เริ่มจากหน้า Login ที่ความกว้าง 320/390px, Dark Mode, การปิดหิมะ, แสดงรหัสผ่าน และการเข้าสู่ระบบจริงด้วยบัญชีทดสอบที่ได้รับอนุญาต แล้วจึงตรวจหน้าหลัง Login ที่เกี่ยวข้อง

เอกสารบันทึกการเปลี่ยนแปลงย้อนหลังของ OMS อยู่ใน `DEV_HANDOVER.md`
