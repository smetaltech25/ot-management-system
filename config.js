// config.js
// 🔑 ข้อมูลกุญแจเชื่อมต่อ Supabase ของพี่ต้นค่ะ

const OMS_IS_LOCALHOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Production and Staging use Supabase Auth. Localhost stays on Staging.
const OMS_PRODUCTION_CONFIG = {
    authMode: 'supabase',
    url: "https://hperamyypofcxajmrskq.supabase.co",
    publishableKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwZXJhbXl5cG9mY3hham1yc2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MzA2NzksImV4cCI6MjA5NzQwNjY3OX0.sggzmBI1cV-Vb-MzeIIaj-zaxsryHryF2r2_hnVi12A"
};

// Paste only the Staging Publishable/Anon key here. Never place a Secret/Service Role key in this file.
const OMS_STAGING_CONFIG = {
    authMode: 'supabase',
    url: "https://hxxfecaiqhphknuotifz.supabase.co",
    publishableKey: "sb_publishable_woNXd7vyicSAtxcl_yN_aA_Pl4GT9vL"
};

const OMS_HAS_STAGING_KEY = OMS_STAGING_CONFIG.publishableKey.trim().length > 0;
const OMS_RUNTIME_CONFIG = OMS_IS_LOCALHOST && OMS_HAS_STAGING_KEY
    ? OMS_STAGING_CONFIG
    : OMS_PRODUCTION_CONFIG;
const OMS_AUTH_MODE = OMS_RUNTIME_CONFIG.authMode;

const SUPABASE_URL = OMS_RUNTIME_CONFIG.url;
const SUPABASE_ANON_KEY = OMS_RUNTIME_CONFIG.publishableKey;

// 🛠️ สร้างตัวเชื่อมต่อฐานข้อมูล (เปลี่ยนชื่อตัวแปรเป็น supabaseClient เพื่อไม่ให้ชื่อชนกับระบบหลักค่ะ)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
        fetch: (url, options) => {
            return fetch(url, { ...options, cache: 'no-store' });
        }
    }
});
