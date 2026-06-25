// config.js
// 🔑 ข้อมูลกุญแจเชื่อมต่อ Supabase ของพี่ต้นค่ะ

const SUPABASE_URL = "https://hperamyypofcxajmrskq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZXJhbXl5cG9mY3hham1yc2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzA2NzksImV4cCI6MjA5NzQwNjY3OX0.sggzmBI1cV-Vb-MzeIIaj-zaxsryHryF2r2_hnVi12A";

// 🛠️ สร้างตัวเชื่อมต่อฐานข้อมูล (เปลี่ยนชื่อตัวแปรเป็น supabaseClient เพื่อไม่ให้ชื่อชนกับระบบหลักค่ะ)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);