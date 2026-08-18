// ===================================================
// app.js - ไฟล์ควบคุมระบบ OverTime Management System (Supabase)
// ฉบับเต็มเวอร์ชันสมบูรณ์ (อัปเดตล่าสุด) จัดทำโดย ไนท์ เพื่อพี่ต้นค่ะ 💖
// ===================================================
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx79QQvGmdpuO8oRSKMn08KdZSYKYZLv9qf6KL-0l55p1EEkKZuZ1glyfGyZt2ma8i7dw/exec"; // ✨ เอา URL จากสเต็ป 2 มาวางตรงนี้นะคะ
let currentUser = null;
let myOtBarChartInstance = null;
let myOtDoughnutChartInstance = null;
let finalSelectedApprovers = []; 
let tempSelectedApprovers = [];  

const MY_OT_REQUESTS_PAGE_SIZE = 10;
let myOTDashboardRequests = [];
let myOTDashboardOTTypeMap = new Map();
let myOTDashboardHasActionMap = new Map();
let myOTDashboardCurrentPage = 1;
let myOTDashboardSearchTerm = "";
let otDetailRequestToken = 0;

const AGENCY_NAME_MAP = {
    'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending',
    'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding',
    'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR',
    'AGC-015': 'Planning', 'AGC-016': 'Accounting'
};

const DEPARTMENT_NAME_MAP = {
    'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี',
    'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM'
};

function getUserOrganizationLabel(user) {
    const agencyName = AGENCY_NAME_MAP[user?.agency] || user?.agency || '-';
    const departmentName = DEPARTMENT_NAME_MAP[user?.department] || user?.department || '-';
    return `${agencyName} : ${departmentName}`;
}

function parseOTRequestDate(dateValue) {
    if (!dateValue) return null;

    const isoMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));

    const slashMatch = String(dateValue).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!slashMatch) return null;

    let year = Number(slashMatch[3]);
    if (year > 2500) year -= 543;
    return new Date(year, Number(slashMatch[2]) - 1, Number(slashMatch[1]));
}

function getCurrentOTPeriod(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const isNewPeriod = referenceDate.getDate() >= 16;

    return {
        start: isNewPeriod ? new Date(year, month, 16) : new Date(year, month - 1, 16),
        end: isNewPeriod ? new Date(year, month + 1, 15) : new Date(year, month, 15)
    };
}

function formatOTPeriodDate(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function summarizeApprovedOTHours(requests, otTypes, dateFilter = () => true) {
    const otTypeMap = new Map((otTypes || []).map((ot, index) => [ot.id, { ...ot, displayOrder: index }]));
    const summaryMap = new Map();

    (requests || [])
        .filter(request => request.status === 'Approved' && dateFilter(request))
        .forEach(request => {
            const otType = otTypeMap.get(request.ot_type_id);
            if (!otType?.start_time || !otType?.end_time) return;

            const hours = Number(calculateOTHours(otType.start_time, otType.end_time));
            if (!Number.isFinite(hours)) return;

            const label = `${otType.start_time} - ${otType.end_time} (${otType.rate}x)`;
            const current = summaryMap.get(request.ot_type_id) || {
                id: request.ot_type_id,
                label,
                hours: 0,
                displayOrder: otType.displayOrder
            };
            current.hours += hours;
            summaryMap.set(request.ot_type_id, current);
        });

    const items = Array.from(summaryMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
    return {
        totalHours: items.reduce((sum, item) => sum + item.hours, 0),
        items
    };
}

function renderOTHoursBreakdown(containerId, summary, accentClass) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.replaceChildren();
    if (summary.items.length === 0) {
        const emptyText = document.createElement('p');
        emptyText.className = 'text-xs text-slate-400';
        emptyText.textContent = 'ยังไม่มีชั่วโมง OT ที่อนุมัติ';
        container.appendChild(emptyText);
        return;
    }

    summary.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2';

        const label = document.createElement('span');
        label.className = 'text-[11px] sm:text-xs font-medium text-slate-600 truncate';
        label.textContent = item.label;

        const hours = document.createElement('span');
        hours.className = `text-xs font-bold whitespace-nowrap ${accentClass}`;
        hours.textContent = `${item.hours.toFixed(2)} ชม.`;

        row.append(label, hours);
        container.appendChild(row);
    });
}

// ✨ ฟังก์ชันตัวช่วยสำหรับแสดงรูปโปรไฟล์ (ถ้าไม่มีรูประบบจะสุ่มสีอักษรย่อให้เหมือนเดิมค่ะ) ✨
function getAvatarUrl(fullname, url) {
    if (url && url.trim() !== '') return url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent((fullname || 'U').charAt(0))}&background=f1f5f9&color=64748b&size=128`;
}

// ----------------===================================
// 1. ระบบเข้าสู่ระบบ & ตรวจสอบสิทธิ์ (Authentication & RBAC)
// ----------------===================================
async function loginUsersSupabase() {
    const usernameInput = document.getElementById("loginusername").value.trim();
    const passwordInput = document.getElementById("loginpassword").value;

    if (!usernameInput || !passwordInput) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรอกข้อมูลให้ครบถ้วน 😤', 'warning');
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', usernameInput)
            .eq('password', passwordInput)
            .eq('status', true)
            .single();

        if (error || !data) {
            Swal.fire('เข้าสู่ระบบไม่สำเร็จ', '⚠️ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีอาจจะยังไม่เปิดใช้งานค่ะ', 'error');
            return;
        }

        currentUser = data;
        localStorage.setItem('oms_user_session', JSON.stringify(data)); // ✨ เพิ่มบรรทัดนี้: จำการล็อกอินลงในเครื่อง
        
        document.getElementById("headerFullname").innerText = data.fullname;
        document.getElementById("headerRole").innerText = getUserOrganizationLabel(data);
        
        // ✨ อัปเดตรูปมุมขวาบน ✨
        const avatarCircle = document.getElementById("userAvatarCircle");
        avatarCircle.classList.add("overflow-hidden"); 
        if(data.avatar_url) {
            avatarCircle.innerHTML = `<img src="${data.avatar_url}" class="w-full h-full object-cover">`;
        } else {
            avatarCircle.innerHTML = data.fullname.charAt(0);
        }

        const adminMenu = document.getElementById("adminMenuSection");
        const menuTab2 = document.getElementById("menuTab2"); 
        const menuTab5 = document.getElementById("menuTab5"); 

        if (adminMenu) {
            if (data.role === 'SuperAdmin') adminMenu.style.display = "block";
            else adminMenu.style.display = "none";
        }

        if (data.role === 'User') {
            if (menuTab2) menuTab2.style.display = "none";
            if (menuTab5) menuTab5.style.display = "none";
        } else {
            if (menuTab2) menuTab2.style.display = "flex";
            if (menuTab5) menuTab5.style.display = "flex";
        }

        document.getElementById("pageformLogin").style.display = "none";
        document.getElementById("dashboardPage").style.display = "block";

        changePage(1);

    } catch (err) {
        console.error("Login System Error:", err);
        Swal.fire('ข้อผิดพลาด', 'อุ๊ย! เกิดข้อผิดพลาดของระบบล็อกอินนิดหน่อยค่ะ ลองใหม่อีกครั้งนะคะ', 'error');
    }
}

// ----------------===================================
// 2. ระบบสลับหน้าเพจ (Multi-Page Tab Switching)
// ----------------===================================
function changePage(pageNumber) {
    const totalPages = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    
    const titles = { 
        1: "หน้าแรก (สรุปสถิติโอที)", 
        2: "รายการขออนุญาต OT", 
        3: "ปฏิทินตารางเวลา OT", 
        5: "รายงานการทำ OT",
        6: "ผู้ใช้งานระบบ",
        10: "สิทธิการใช้งาน",
        7: "ตั้งค่าหน่วยงาน",
        8: "ตั้งค่าฝ่าย",
        9: "ตั้งค่าเวลาโอที",
        11: "ตั้งค่าวันหยุด",
        12: "ตั้งค่าวันทำงาน",
        13: "ตั้งค่าระบบต่างๆ"
    };
    
    totalPages.forEach(num => {
        const pageEl = document.getElementById("page" + num);
        const tabEl = document.getElementById("menuTab" + num);
        
        if (pageEl) pageEl.style.display = (num === pageNumber) ? "block" : "none";
        
        if (tabEl) {
            if (num === pageNumber) tabEl.classList.add("active-menu");
            else tabEl.classList.remove("active-menu");
        }
    });

    if (document.getElementById("currentLayoutTitle")) {
        document.getElementById("currentLayoutTitle").innerText = titles[pageNumber] || "OMS Dashboard";
    }

    if (pageNumber === 1) loadMyOTDashboardData();
    if (pageNumber === 2) loadApprovalQueueData();
    if (pageNumber === 3) initCalendar(); 
    if (pageNumber === 5) initializeReportsPage();
    if (pageNumber === 6) loadUsersData(); 
    if (pageNumber === 7) loadAgenciesData(); 
    if (pageNumber === 8) loadDepartmentsData(); 
    if (pageNumber === 9) loadOTTypesData(); 
    if (pageNumber === 11) loadHolidaysData(); 
    if (pageNumber === 12) loadWorkdaysData();
    if (pageNumber === 13) loadSystemSettings(); 

    if (window.innerWidth < 640) {
        const sidebar = document.getElementById("mainSidebar");
        const backdrop = document.getElementById("sidebarBackdrop");
        if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
            sidebar.classList.add("-translate-x-full");
            backdrop.classList.add("hidden");
        }
    }
}

// ----------------===================================
// 3. ระบบหน้าสรุปประวัติและยอดสะสม OT ของตนเอง (Page 1)
// ----------------===================================
async function loadMyOTDashboardData() {
    if (!currentUser) return;

    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";

    const tbody = document.getElementById("myOTRequestsTableBody");
    if (!tbody) return;

    myOTDashboardCurrentPage = 1;
    myOTDashboardSearchTerm = "";
    tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400"><i class="bx bx-loader-alt bx-spin mr-1"></i>กำลังโหลดรายการคำขอ...</td></tr>`;

    try {
        // ชุดข้อมูลทั้ง 3 ส่วนไม่ต้องรอกัน จึงโหลดพร้อมกันเพื่อลดเวลารวม
        const [requestsResult, otTypesResult, profileResult] = await Promise.all([
            supabaseClient
                .from('ot_requests')
                .select('id, ot_type_id, date_start, description, status, submit_date')
                .eq('user_id', currentUser.id)
                .order('submit_date', { ascending: false }),
            supabaseClient.from('ot_types').select('id, rate, start_time, end_time').order('id', { ascending: true }),
            supabaseClient.from('users').select('employee_id').eq('id', currentUser.id).single()
        ]);

        if (requestsResult.error) throw requestsResult.error;
        if (otTypesResult.error) throw otTypesResult.error;

        const requests = requestsResult.data || [];
        const otTypes = otTypesResult.data || [];
        const latestUserProfile = profileResult.data;
        if (latestUserProfile) currentUser.employee_id = latestUserProfile.employee_id;

        // ดึงเฉพาะสถานะขั้นอนุมัติของคำขอชุดนี้ เพื่อใช้ล็อกปุ่มแก้ไข/ลบตามกติกาเดิม
        let allSteps = [];
        if (requests.length > 0) {
            const reqIds = requests.map(r => r.id);
            const { data: stepsData, error: stepsError } = await supabaseClient
                .from('approval_steps')
                .select('request_id, status')
                .in('request_id', reqIds);

            // หากอ่านสถานะไม่ได้ จะไม่แสดงปุ่มที่อาจอนุญาตให้แก้/ลบผิดกติกา
            if (stepsError) throw stepsError;
            allSteps = stepsData || [];
        }

        myOTDashboardRequests = requests;
        myOTDashboardOTTypeMap = new Map(otTypes.map(otType => [otType.id, otType]));
        myOTDashboardHasActionMap = new Map();
        allSteps.forEach(step => {
            if (step.status !== 'Pending') myOTDashboardHasActionMap.set(step.request_id, true);
        });

        const pendingCount = requests.filter(r => r.status === 'Pending').length;
        if(document.getElementById("statPendingCount")) document.getElementById("statPendingCount").innerText = pendingCount + " รายการ";

        const currentPeriod = getCurrentOTPeriod(new Date());
        const approvedCurrentPeriod = summarizeApprovedOTHours(requests, otTypes, request => {
            const requestDate = parseOTRequestDate(request.date_start);
            return requestDate && requestDate >= currentPeriod.start && requestDate <= currentPeriod.end;
        });
        const approvedAllTime = summarizeApprovedOTHours(requests, otTypes);

        if (document.getElementById("approvedOTPeriodLabel")) {
            document.getElementById("approvedOTPeriodLabel").innerText = `ชั่วโมง OT ที่อนุมัติรอบ ${formatOTPeriodDate(currentPeriod.start)} - ${formatOTPeriodDate(currentPeriod.end)}`;
        }
        if (document.getElementById("statApprovedHoursThisMonth")) {
            document.getElementById("statApprovedHoursThisMonth").innerText = `${approvedCurrentPeriod.totalHours.toFixed(2)} ชม.`;
        }
        if (document.getElementById("statTotalHours")) {
            document.getElementById("statTotalHours").innerText = `${approvedAllTime.totalHours.toFixed(2)} ชม.`;
        }
        renderOTHoursBreakdown("monthlyApprovedTypeBreakdown", approvedCurrentPeriod, "text-green-600");
        renderOTHoursBreakdown("totalApprovedTypeBreakdown", approvedAllTime, "text-blue-600");
        renderMyOTRequestsPage();

    } catch (err) {
        console.error("Load Personal Dashboard Data Error:", err);
        myOTDashboardRequests = [];
        myOTDashboardOTTypeMap = new Map();
        myOTDashboardHasActionMap = new Map();
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-red-500">โหลดข้อมูลหน้าแรกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</td></tr>`;
        updateMyOTDashboardPagination(0, 0);
    }
}

function getFilteredMyOTDashboardRequests() {
    if (!myOTDashboardSearchTerm) return myOTDashboardRequests;

    const agencyName = AGENCY_NAME_MAP[currentUser?.agency] || currentUser?.agency || '-';
    const departmentName = DEPARTMENT_NAME_MAP[currentUser?.department] || currentUser?.department || '-';

    return myOTDashboardRequests.filter(request => {
        const otType = myOTDashboardOTTypeMap.get(request.ot_type_id) || {};
        const statusLabel = request.status === 'Approved'
            ? 'อนุมัติ'
            : request.status === 'Rejected'
                ? 'ไม่อนุมัติ'
                : 'รออนุมัติ';
        const searchableText = [
            request.id,
            currentUser?.fullname,
            currentUser?.employee_id,
            agencyName,
            departmentName,
            request.description,
            request.date_start,
            request.status,
            statusLabel,
            otType.start_time,
            otType.end_time
        ].filter(Boolean).join(' ').toLowerCase();

        return searchableText.includes(myOTDashboardSearchTerm);
    });
}

function renderMyOTRequestsPage() {
    const tbody = document.getElementById("myOTRequestsTableBody");
    if (!tbody) return;

    const filteredRequests = getFilteredMyOTDashboardRequests();
    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / MY_OT_REQUESTS_PAGE_SIZE));
    myOTDashboardCurrentPage = Math.min(Math.max(1, myOTDashboardCurrentPage), totalPages);

    if (filteredRequests.length === 0) {
        const message = myOTDashboardSearchTerm
            ? 'ไม่พบรายการคำขอที่ตรงกับคำค้นหาค่ะ 🔎'
            : 'ยังไม่มีการยื่นคำขอโอทีในระบบในขณะนี้ค่ะ 🍃';
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400">${message}</td></tr>`;
        updateMyOTDashboardPagination(0, 0);
        return;
    }

    const startIndex = (myOTDashboardCurrentPage - 1) * MY_OT_REQUESTS_PAGE_SIZE;
    const pageRequests = filteredRequests.slice(startIndex, startIndex + MY_OT_REQUESTS_PAGE_SIZE);
    const agencyName = AGENCY_NAME_MAP[currentUser.agency] || currentUser.agency || '-';
    const departmentName = DEPARTMENT_NAME_MAP[currentUser.department] || currentUser.department || '-';
    const fragment = document.createDocumentFragment();

    pageRequests.forEach(row => {
        const otInfo = myOTDashboardOTTypeMap.get(row.ot_type_id) || {};
        const timeStr = otInfo.start_time ? `${otInfo.start_time} - ${otInfo.end_time}` : row.ot_type_id;
        const hrsStr = otInfo.start_time ? `${calculateOTHours(otInfo.start_time, otInfo.end_time)} ชม.` : '-';

        let badgeHTML = '';
        if (row.status === 'Approved') badgeHTML = '<span class="dashboard-status-approved px-3 py-1.5 rounded-full text-[11px] font-bold bg-green-100 text-green-600"><i class="bx bx-check-circle mr-1"></i>อนุมัติ</span>';
        else if (row.status === 'Rejected') badgeHTML = '<span class="dashboard-status-rejected px-3 py-1.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600"><i class="bx bx-x-circle mr-1"></i>ไม่อนุมัติ</span>';
        else badgeHTML = '<span class="dashboard-status-pending px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-600"><i class="bx bx-time-five mr-1"></i>รออนุมัติ</span>';

        let showDate = row.date_start;
        if (showDate && showDate.includes('-')) {
            const dateParts = showDate.split('-');
            showDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        }

        const hasAction = myOTDashboardHasActionMap.get(row.id) === true;
        const isDisable = row.status === 'Approved' || row.status === 'Rejected' || hasAction;
        const btnView = `<button onclick="openOTDetailModal('${row.id}')" class="dashboard-action-btn dashboard-btn-blue w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm" title="ดูรายละเอียด"><i class='bx bx-show text-lg'></i></button>`;
        const btnEdit = isDisable
            ? `<button onclick="Swal.fire('แก้ไขไม่ได้', 'รายการนี้ได้รับการพิจารณาไปแล้ว ไม่สามารถแก้ไขได้ค่ะ 😅', 'warning')" class="dashboard-action-btn dashboard-btn-disabled w-8 h-8 rounded-lg bg-slate-300 text-white flex items-center justify-center cursor-not-allowed shadow-sm" title="แก้ไขไม่ได้"><i class='bx bx-edit text-lg'></i></button>`
            : `<button onclick="editMyOTRequest('${row.id}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm" title="แก้ไข"><i class='bx bx-edit text-lg'></i></button>`;
        const btnDelete = isDisable
            ? `<button onclick="Swal.fire('ลบไม่ได้', 'รายการนี้ได้รับการพิจารณาไปแล้ว ไม่สามารถลบได้ค่ะ 😅', 'warning')" class="dashboard-action-btn dashboard-btn-disabled w-8 h-8 rounded-lg bg-slate-300 text-white flex items-center justify-center cursor-not-allowed shadow-sm" title="ลบไม่ได้"><i class='bx bx-trash text-lg'></i></button>`
            : `<button onclick="deleteMyOTRequest('${row.id}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm" title="ลบ"><i class='bx bx-trash text-lg'></i></button>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors duration-200";
        tr.innerHTML = `
            <td class="p-4 font-medium text-slate-700 text-center">${row.id}</td>
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-slate-100 text-slate-400 overflow-hidden flex-shrink-0 border border-slate-200 flex items-center justify-center shadow-sm">
                        <img src="${getAvatarUrl(currentUser.fullname, currentUser.avatar_url)}" class="w-full h-full object-cover">
                    </div>
                    <div>
                        <p class="font-bold text-sm text-slate-800">${currentUser.fullname}</p>
                        <p class="text-xs text-slate-500 mt-0.5">${agencyName} | ${departmentName}</p>
                    </div>
                </div>
            </td>
            <td class="p-4 text-slate-700 text-center font-bold whitespace-nowrap">${currentUser.employee_id || '-'}</td>
            <td class="p-4 text-slate-600 text-center">${timeStr}</td>
            <td class="p-4 text-slate-600 text-center">${showDate}</td>
            <td class="p-4 text-slate-600 text-center">${hrsStr}</td>
            <td class="p-4 text-slate-600 truncate max-w-[150px] text-center" title="${row.description || '-'}">${row.description || '-'}</td>
            <td class="p-4 text-center">${badgeHTML}</td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center space-x-1.5">
                    ${btnView}
                    ${btnEdit}
                    ${btnDelete}
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    updateMyOTDashboardPagination(filteredRequests.length, totalPages);
}

function updateMyOTDashboardPagination(totalItems, totalPages) {
    const pageInfo = document.getElementById("paginationInfoText");
    const currentPageButton = document.getElementById("myOTCurrentPageButton");
    const startItem = totalItems === 0 ? 0 : (myOTDashboardCurrentPage - 1) * MY_OT_REQUESTS_PAGE_SIZE + 1;
    const endItem = totalItems === 0 ? 0 : Math.min(myOTDashboardCurrentPage * MY_OT_REQUESTS_PAGE_SIZE, totalItems);

    if (pageInfo) pageInfo.innerText = `แสดง ${startItem} ถึง ${endItem} จาก ${totalItems} แถว`;
    if (currentPageButton) currentPageButton.innerText = totalItems === 0 ? '1' : String(myOTDashboardCurrentPage);

    const isFirstPage = totalItems === 0 || myOTDashboardCurrentPage <= 1;
    const isLastPage = totalItems === 0 || myOTDashboardCurrentPage >= totalPages;
    ["myOTFirstPageButton", "myOTPreviousPageButton"].forEach(id => setMyOTPaginationButtonState(id, isFirstPage));
    ["myOTNextPageButton", "myOTLastPageButton"].forEach(id => setMyOTPaginationButtonState(id, isLastPage));
}

function setMyOTPaginationButtonState(buttonId, disabled) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.disabled = disabled;
    button.classList.toggle('opacity-40', disabled);
    button.classList.toggle('cursor-not-allowed', disabled);
}

function changeMyOTDashboardPage(action) {
    const filteredRequests = getFilteredMyOTDashboardRequests();
    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / MY_OT_REQUESTS_PAGE_SIZE));

    if (action === 'first') myOTDashboardCurrentPage = 1;
    else if (action === 'previous') myOTDashboardCurrentPage = Math.max(1, myOTDashboardCurrentPage - 1);
    else if (action === 'next') myOTDashboardCurrentPage = Math.min(totalPages, myOTDashboardCurrentPage + 1);
    else if (action === 'last') myOTDashboardCurrentPage = totalPages;

    renderMyOTRequestsPage();
}

function drawMyOTCharts(labels, counts) {
    const barCtx = document.getElementById('otBarChart').getContext('2d');
    const doughCtx = document.getElementById('otDoughnutChart').getContext('2d');

    if (myOtBarChartInstance) myOtBarChartInstance.destroy();
    if (myOtDoughnutChartInstance) myOtDoughnutChartInstance.destroy();

    const bgColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    myOtBarChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'จำนวนชั่วโมงที่ขอ OT (ชม.)', // ✨ ไนท์เปลี่ยนข้อความตรงนี้ให้ค่ะ ✨
                data: counts,
                backgroundColor: '#10b981', 
                borderRadius: 4,
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { font: { family: 'Prompt' } } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { titleFont: { family: 'Prompt' }, bodyFont: { family: 'Prompt' } }
            }
        }
    });

    myOtDoughnutChartInstance = new Chart(doughCtx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: bgColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Prompt' } } },
                tooltip: { titleFont: { family: 'Prompt' }, bodyFont: { family: 'Prompt' } }
            }
        }
    });
}

// ----------------===================================
// 4. ระบบคิวงานพิจารณาอนุมัติแบบขั้นบันไดลำดับ 1->2->3 (Page 2)
// ----------------===================================
async function loadApprovalQueueData() {
    if (!currentUser) return;

    const tbody = document.getElementById("approvalQueueTableBody");
    if (!tbody) return;

    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    const showEmptyState = () => {
        tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400">ตอนนี้ไม่มีคำขอโอทีค้างรอให้คุณอนุมัติแล้วค่ะ ✨</td></tr>`;
    };

    tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400"><i class="bx bx-loader-alt bx-spin mr-1"></i>กำลังโหลดรายการรออนุมัติ...</td></tr>`;

    try {
        const { data: myPendingSteps, error: stepErr } = await supabaseClient
            .from('approval_steps')
            .select('id, request_id, step_order')
            .eq('approver_id', currentUser.id)
            .eq('status', 'Pending');

        if (stepErr) throw stepErr;

        if (!myPendingSteps || myPendingSteps.length === 0) {
            showEmptyState();
            return;
        }

        const requestIds = [...new Set(myPendingSteps.map(step => step.request_id).filter(Boolean))];
        if (requestIds.length === 0) {
            showEmptyState();
            return;
        }

        // ดึงขั้นอนุมัติและคำขอทั้งหมดเป็นชุด แทนการ Query ทีละแถว
        const [allStepsResult, requestsResult] = await Promise.all([
            supabaseClient
                .from('approval_steps')
                .select('request_id, step_order, status')
                .in('request_id', requestIds),
            supabaseClient
                .from('ot_requests')
                .select('id, user_id, ot_type_id, date_start, description')
                .in('id', requestIds)
        ]);

        if (allStepsResult.error) throw allStepsResult.error;
        if (requestsResult.error) throw requestsResult.error;

        const stepsByRequest = new Map();
        (allStepsResult.data || []).forEach(step => {
            if (!stepsByRequest.has(step.request_id)) stepsByRequest.set(step.request_id, []);
            stepsByRequest.get(step.request_id).push(step);
        });

        const eligibleSteps = myPendingSteps.filter(step => {
            const requestSteps = stepsByRequest.get(step.request_id) || [];
            return requestSteps
                .filter(item => Number(item.step_order) < Number(step.step_order))
                .every(item => item.status === 'Approved');
        });

        if (eligibleSteps.length === 0) {
            showEmptyState();
            return;
        }

        const requestMap = new Map((requestsResult.data || []).map(request => [request.id, request]));
        const eligibleRequests = eligibleSteps
            .map(step => requestMap.get(step.request_id))
            .filter(Boolean);
        const userIds = [...new Set(eligibleRequests.map(request => request.user_id).filter(Boolean))];
        const otTypeIds = [...new Set(eligibleRequests.map(request => request.ot_type_id).filter(Boolean))];

        const emptyResult = Promise.resolve({ data: [], error: null });
        const [usersResult, otTypesResult] = await Promise.all([
            userIds.length > 0
                ? supabaseClient
                    .from('users')
                    .select('id, fullname, avatar_url, role, department')
                    .in('id', userIds)
                : emptyResult,
            otTypeIds.length > 0
                ? supabaseClient
                    .from('ot_types')
                    .select('id, rate, start_time, end_time')
                    .in('id', otTypeIds)
                : emptyResult
        ]);

        if (usersResult.error) console.warn("Load approval users warning:", usersResult.error);
        if (otTypesResult.error) console.warn("Load approval OT types warning:", otTypesResult.error);

        const userMap = new Map((usersResult.data || []).map(user => [user.id, user]));
        const otTypeMap = new Map((otTypesResult.data || []).map(otType => [otType.id, otType]));
        const fragment = document.createDocumentFragment();

        eligibleSteps.forEach(step => {
            const request = requestMap.get(step.request_id);
            if (!request) return;

            const allSteps = stepsByRequest.get(step.request_id) || [];
            const userData = userMap.get(request.user_id);
            const otTypeData = otTypeMap.get(request.ot_type_id);

            const empName = userData ? userData.fullname : request.user_id;
            const empAvatar = getAvatarUrl(empName, userData?.avatar_url);
            const empRole = userData ? userData.role : '-';
            const empDept = userData ? (DEPARTMENT_NAME_MAP[userData.department] || userData.department) : '-';

            const otRate = otTypeData ? `โอที (${otTypeData.rate}) เท่า` : '-';
            const otTime = otTypeData ? `${otTypeData.start_time} - ${otTypeData.end_time}` : '-';

            // แปลงรูปแบบวันที่จาก YYYY-MM-DD เป็น DD/MM/YYYY ตามรูปแบบเดิมของหน้านี้
            let showDate = request.date_start;
            if (showDate && showDate.includes('-')) {
                const d = showDate.split('-');
                showDate = `${d[2]}/${d[1]}/${d[0]}`;
            }

            const statusBadge = '<span class="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-600"><i class="bx bx-hourglass mr-1"></i>รออนุมัติ</span>';
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0";
            tr.innerHTML = `
                <td class="p-3 text-center">
                    <input type="checkbox" class="rowCheckbox w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                           value="${step.id}"
                           data-request-id="${request.id}"
                           data-step-order="${step.step_order}"
                           data-total-steps="${allSteps.length}">
                </td>
                <td class="p-3 font-semibold text-slate-700 text-center">${request.id}</td>

                <td class="p-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-14 h-14 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm">
                            <img src="${empAvatar}" loading="lazy" decoding="async" class="w-full h-full object-cover object-top">
                        </div>
                        <div>
                            <p class="text-sm font-bold text-slate-700">${empName}</p>
                            <p class="text-[11px] text-slate-400">${empRole} | ${empDept}</p>
                        </div>
                    </div>
                </td>

                <td class="p-3 text-slate-600 text-center font-medium">${otRate}</td>
                <td class="p-3 text-slate-600 text-center">${showDate}</td>
                <td class="p-3 text-slate-600 text-center">${otTime}</td>
                <td class="p-3 text-slate-600 text-center truncate max-w-[120px]" title="${request.description}">${request.description || '-'}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center">
                    <button onclick="openOTDetailModal('${request.id}')" class="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 shadow-sm transition-transform hover:scale-105 flex items-center justify-center mx-auto">
                        <i class='bx bx-show mr-1'></i> ดูรายละเอียด
                    </button>
                </td>
            `;
            fragment.appendChild(tr);
        });

        tbody.innerHTML = "";
        tbody.appendChild(fragment);

        if (!tbody.querySelector('tr')) showEmptyState();
    } catch (err) {
        console.error("Load Approval Queue Error:", err);
        tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-500">โหลดรายการรออนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</td></tr>`;
    }
}

async function actionApproveStep(stepId, action, requestId, currentOrder, totalSteps) {
    const actionText = action === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';

    const { value: reasonInput } = await Swal.fire({
        title: `ยืนยันการ${actionText}`,
        text: `รายการ ${requestId}\n⚠️ กรุณาระบุเหตุผล/หมายเหตุ:`,
        input: 'text',
        inputPlaceholder: 'พิมพ์เหตุผลที่นี่...',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: action === 'Approved' ? '#22c55e' : '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return `จำเป็นต้องระบุเหตุผลในการ "${actionText}" ด้วยค่ะ ❌`;
            }
        }
    });

    if (!reasonInput) return; // กรณีผู้ใช้กดยกเลิก

    try {
        const now = new Date();
const timestampStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} : ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

await supabaseClient
    .from('approval_steps')
    .update({ 
        status: action, 
        approved_at: timestampStr,
        comment: reasonInput.trim()
    })
    .eq('id', stepId);

        if (action === 'Rejected') {
            await supabaseClient.from('ot_requests').update({ status: 'Rejected' }).eq('id', requestId);
        } else if (action === 'Approved' && currentOrder === totalSteps) {
            await supabaseClient.from('ot_requests').update({ status: 'Approved' }).eq('id', requestId);
        }

        Swal.fire('สำเร็จ!', 'ดำเนินการพิจารณาคำขอเรียบร้อยแล้วค่ะ! 🎉', 'success');
        loadApprovalQueueData();

    } catch (err) {
        console.error("Action Approve Processing Error:", err);
    }
}

// ----------------===================================
// 5. ระบบฟอร์มยื่นคำขอ OT (Card Selection UI & Calculations)
// ----------------===================================
function calculateOTHours(startStr, endStr) {
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);

    let start = sh + (sm / 60);
    let end = eh + (em / 60);

    // กรณีเวลาสิ้นสุดน้อยกว่าเวลาเริ่ม (กะข้ามวัน) จะบวกเวลาไปอีก 24 ชั่วโมง
    if (end <= start) {
        end += 24;
    }

    let totalHours = end - start;

    // หักเวลาพักเที่ยง (12:00 - 13:00)
    if (start <= 12 && end >= 13) {
        totalHours -= 1;
    }

    // ✨ หักเวลาพักดึก (00:00 - 01:00) สำหรับกะข้ามวัน (ช่วงชั่วโมงที่ 24 ถึง 25)
    if (start <= 24 && end >= 25) {
        totalHours -= 1;
    }

    return totalHours.toFixed(2);
}

async function loadOTTypesCards() {
    try {
        const { data: otTypes, error } = await supabaseClient.from('ot_types').select('*').order('id', { ascending: true });
        if (error) throw error;

        const container = document.getElementById("otTypeContainer");
        container.innerHTML = "";

        if (!otTypes || otTypes.length === 0) {
            container.innerHTML = `<p class="text-sm text-red-500 col-span-full">ไม่มีข้อมูลเวลา OT ในระบบ</p>`;
            return;
        }

        otTypes.forEach(ot => {
            const actualHours = calculateOTHours(ot.start_time, ot.end_time);
            
            const card = document.createElement('div');
            card.className = `ot-card relative flex flex-col items-center justify-center p-4 rounded-xl cursor-pointer bg-white border-2 border-slate-100 transition-all hover:border-blue-300 hover:shadow-md text-center h-full`;
            card.dataset.id = ot.id;
            
            card.innerHTML = `
                <div class="ot-card-icon w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl mb-2">
                    <i class='bx bx-briefcase-alt-2'></i>
                </div>
                <span class="ot-card-title font-bold text-slate-700 text-sm">${ot.start_time} - ${ot.end_time}</span>
                <span class="ot-card-rate text-xs text-slate-500 mt-1">โอที (${ot.rate}) เท่า</span>
                <span class="ot-card-hours text-[11px] font-semibold text-slate-400 mt-1 bg-slate-100 px-2 py-0.5 rounded-full">รวม ${actualHours} ชม.</span>
                
                <div class="check-icon absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full text-white flex items-center justify-center opacity-0 scale-50 transition-all duration-200">
                    <i class='bx bx-check text-sm'></i>
                </div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.ot-card').forEach(c => {
                    c.classList.remove('ot-card-selected');
                    c.classList.remove('border-blue-500', 'bg-blue-50');
                    c.classList.add('border-slate-100', 'bg-white');
                    c.querySelector('.check-icon').classList.remove('opacity-100', 'scale-100');
                    c.querySelector('.check-icon').classList.add('opacity-0', 'scale-50');
                });
                
                card.classList.remove('border-slate-100', 'bg-white');
                card.classList.add('border-blue-500', 'bg-blue-50');
                card.classList.add('ot-card-selected');
                card.querySelector('.check-icon').classList.remove('opacity-0', 'scale-50');
                card.querySelector('.check-icon').classList.add('opacity-100', 'scale-100');
                
                document.getElementById('reqOtType').value = ot.id;
            });

            container.appendChild(card);
        });

    } catch (err) {
        console.error("Load OT Types Cards Error:", err);
    }
}

async function openApproverModal() {
    tempSelectedApprovers = [...finalSelectedApprovers]; 
    document.getElementById('approverModal').classList.remove('hidden');
    
    try {
        const { data: users, error } = await supabaseClient.from('users').select('*').eq('status', true);
        if (error) throw error;
        
        const approvers = users.filter(u => u.role !== 'User');
        const container = document.getElementById('approver-list-container');
        
        renderApproversGrid(approvers, container);

    } catch (err) {
        console.error("Load Approvers List Error:", err);
    }
}

function closeApproverModal() {
    document.getElementById('approverModal').classList.add('hidden');
}

function renderApproversGrid(approvers, container) {
    container.innerHTML = '';
    
    const agencyMap = {
        'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending',
        'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding',
        'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR',
        'AGC-015': 'Planning', 'AGC-016': 'Accounting'
    };

    const deptMap = {
        'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี',
        'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM'
    };
    
    const superUsers = approvers.filter(u => u.role === 'SuperUser');
    const admins = approvers.filter(u => u.role === 'Admin');
    const superAdmins = approvers.filter(u => u.role === 'SuperAdmin');
    
    // ✨ จัดเรียงให้ชื่อที่มีคำว่า "ผู้ดูแลระบบ" ลงไปอยู่ท้ายสุดเสมอ
    superAdmins.sort((a, b) => {
        if (a.fullname.includes('ผู้ดูแลระบบ')) return 1; 
        if (b.fullname.includes('ผู้ดูแลระบบ')) return -1;
        return 0;
    });

    function createCard(u) {
        const isSelectedIdx = tempSelectedApprovers.findIndex(s => s.id === u.id);
        const isSelected = isSelectedIdx >= 0;
        
        const activeClasses = isSelected ? 'approver-card-selected border-green-500 bg-green-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm';
        const iconOpacity = isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50';
        const badgeStr = isSelected ? `<div class="absolute -top-2 -left-2 w-6 h-6 bg-amber-500 text-white rounded-full text-xs font-bold flex items-center justify-center border-2 border-white z-10 shadow-sm">${isSelectedIdx + 1}</div>` : '';
        
        const agencyName = agencyMap[u.agency] || u.agency || '-';
        const deptName = deptMap[u.department] || u.department || '-';

        let subText = u.role;
        if (u.role !== 'SuperUser') {
            subText = `${u.role} - ${agencyName} / ${deptName}`;
        }

        const card = document.createElement('div');
        card.className = `approver-card relative flex items-center p-3 md:p-4 rounded-xl border-2 cubic-bezier(0.4, 0, 0.2, 1) duration-200 cursor-pointer transition-all ${activeClasses}`;
        card.innerHTML = `
            ${badgeStr}
            <div class="approver-avatar w-11 h-11 md:w-14 md:h-14 rounded-full bg-slate-50 text-slate-400 overflow-hidden flex-shrink-0 mr-3 border border-slate-200 flex items-center justify-center text-xl shadow-inner">
                <!-- ✨ ใช้ getAvatarUrl ตรงนี้ ✨ -->
                <img src="${getAvatarUrl(u.fullname, u.avatar_url)}" class="w-full h-full object-cover">
            </div>
            <div class="flex-grow min-w-0 pr-2">
                <p class="approver-card-name font-bold text-sm text-slate-800 truncate">${u.fullname}</p>
                <p class="approver-card-meta text-[12px] text-slate-500 truncate mt-0.5">${subText}</p>
            </div>
            <div class="w-6 h-6 bg-green-500 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-all ${iconOpacity}">
                <i class='bx bx-check text-sm'></i>
            </div>
        `;
        
        card.addEventListener('click', () => {
            if (isSelected) {
                tempSelectedApprovers.splice(isSelectedIdx, 1); 
            } else {
                if (tempSelectedApprovers.length >= 3) {
                    Swal.fire('ครบโควตาแล้ว', 'เลือกผู้อนุมัติครบ 3 ท่านแล้ว ถ้าต้องการเปลี่ยน ให้กดเอาคนเดิมออกก่อนนะคะ 💕', 'warning');
                    return;
                }
                tempSelectedApprovers.push(u); 
            }
            renderApproversGrid(approvers, container); 
        });
        
        return card;
    }

    function createGrid(list) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 mb-4';
        list.forEach(u => grid.appendChild(createCard(u)));
        return grid;
    }

    if (superUsers.length > 0) {
        const header1 = document.createElement('h3');
        header1.className = 'font-bold text-slate-800 mb-2 mt-4 first:mt-0 text-base border-l-4 border-emerald-500 pl-2';
        header1.innerText = '🟢 ลำดับที่ 1: หัวหน้างาน / หัวหน้าฝ่าย (SuperUser)';
        container.appendChild(header1);

        const groupedSU = {};
        superUsers.forEach(u => {
            const agencyName = agencyMap[u.agency] || u.agency || '-';
            const deptName = deptMap[u.department] || u.department || '-';
            const groupName = `หัวหน้า${agencyName} - ${deptName}`;
            if (!groupedSU[groupName]) groupedSU[groupName] = [];
            groupedSU[groupName].push(u);
        });

        // ✨ ดึงกลุ่ม หัวหน้าMachine - ฝ่ายผลิต MA มาสร้างการ์ดไว้บนสุดก่อน ✨
        const topGroup = 'หัวหน้าMachine - ฝ่ายผลิต MA';
        if (groupedSU[topGroup]) {
            const topHeader = document.createElement('h4');
            topHeader.className = 'font-bold text-slate-700 mt-5 mb-3 text-[15px]';
            topHeader.innerText = topGroup;
            container.appendChild(topHeader);
            container.appendChild(createGrid(groupedSU[topGroup]));
            
            // วาดเสร็จแล้วลบออกจาก object จะได้ไม่ถูกนำไปวาดซ้ำด้านล่าง
            delete groupedSU[topGroup];
        }

        // วาดกลุ่มอื่นๆ ที่เหลือตามปกติ
        for (const gName in groupedSU) {
            const deptHeader = document.createElement('h4');
            deptHeader.className = 'font-bold text-slate-700 mt-5 mb-3 text-[15px]';
            deptHeader.innerText = gName;
            container.appendChild(deptHeader);
            
            container.appendChild(createGrid(groupedSU[gName]));
        }
    }

    if (admins.length > 0) {
        const header2 = document.createElement('h3');
        header2.className = 'font-bold text-slate-800 mb-4 mt-8 text-base border-l-4 border-blue-500 pl-2';
        header2.innerText = '🔵 ลำดับที่ 2: ผู้จัดการ (Admin)';
        container.appendChild(header2);
        
        container.appendChild(createGrid(admins));
    }

    if (superAdmins.length > 0) {
        const header3 = document.createElement('h3');
        header3.className = 'font-bold text-slate-800 mb-4 mt-8 text-base border-l-4 border-purple-500 pl-2';
        header3.innerText = '🟣 ลำดับที่ 3: HR / ผู้ดูแลระบบ (SuperAdmin)';
        container.appendChild(header3);
        
        container.appendChild(createGrid(superAdmins));
    }
}

function confirmApproverSelection() {
    finalSelectedApprovers = [...tempSelectedApprovers];
    closeApproverModal();
    
    const chipContainer = document.getElementById("selected-approvers");
    chipContainer.innerHTML = "";
    
    if(finalSelectedApprovers.length === 0) {
        chipContainer.innerHTML = `<span class="text-sm text-slate-400 italic">ยังไม่ได้เลือกผู้อนุมัติ...</span>`;
        return;
    }

    finalSelectedApprovers.forEach((u, idx) => {
        chipContainer.innerHTML += `
            <div class="selected-approver-chip flex items-center bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
                <span class="w-5 h-5 bg-amber-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center mr-2">${idx + 1}</span>
                <span class="selected-approver-chip-name text-sm font-semibold text-slate-700 mr-1">${u.fullname}</span>
            </div>
        `;
    });
}

async function submitOTRequestSupabase() {
    const dateStart = document.getElementById("reqDateStart").value;
    const otType = document.getElementById("reqOtType").value;
    const description = document.getElementById("reqDescription").value.trim();
    const editId = document.getElementById("reqEditId").value; 

    if (!dateStart || !otType || !description) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรอกข้อมูลและเลือกเวลาการ์ดโอทีให้ครบก่อนนะคะ 😊', 'warning');
        return;
    }

    if (finalSelectedApprovers.length !== 3) {
        Swal.fire('เลือกผู้อนุมัติไม่ครบ', `⚠️ กรุณาเลือกผู้อนุมัติพิจารณาให้ครบ 3 ลำดับนะคะ (ตอนนี้เลือกไว้เพียง ${finalSelectedApprovers.length} ท่าน)`, 'warning');
        return;
    }

    try {
        const nowObj = new Date();
const d = String(nowObj.getDate()).padStart(2, '0');
const m = String(nowObj.getMonth() + 1).padStart(2, '0');
const y = nowObj.getFullYear(); // ดึงปี ค.ศ. เสมอ
const h = String(nowObj.getHours()).padStart(2, '0');
const min = String(nowObj.getMinutes()).padStart(2, '0');
const todayStr = `${d}/${m}/${y} : ${h}:${min}`;
        
        let reqId = editId; 

        // ✨ 1. เตรียมข้อมูลที่จะส่งไปบันทึก (สังเกตว่าเราเอาคอลัมน์ id ออกไปแล้ว เพราะฐานข้อมูลจะจัดการให้)
        const requestPayload = {
            description: description,
            date_start: dateStart,
            user_id: currentUser.id,
            ot_type_id: otType,
            status: 'Pending',
            submit_date: todayStr
        };

        if (editId) {
            // กรณีแก้ไข: อัปเดตข้อมูลเดิมตามปกติ
            await supabaseClient.from('ot_requests').update(requestPayload).eq('id', editId);
            await supabaseClient.from('approval_steps').delete().eq('request_id', editId);
        } else {
            // ✨ 2. กรณีสร้างใหม่: สั่ง Insert แล้วพ่วงคำสั่ง .select('id').single() เพื่อดึงรหัสใหม่กลับมา
            const { data: newReq, error: insertErr } = await supabaseClient
                .from('ot_requests')
                .insert([requestPayload])
                .select('id')
                .single();

            if (insertErr) throw insertErr;
            
            // นำรหัสใหม่เอี่ยม (เช่น OTR-0039) เก็บใส่ตัวแปร reqId ไว้ใช้สร้างคิวอนุมัติและส่ง Webhook ต่อ
            reqId = newReq.id; 
        }

        // นำ reqId ไปสร้าง Step อนุมัติ 1-2-3 (โค้ดส่วนนี้ใช้ของเดิมได้เลยค่ะ)
        const stepsData = [
            { id: reqId + "-STEP1", request_id: reqId, step_order: 1, approver_id: finalSelectedApprovers[0].id, status: 'Pending', assigned_date: todayStr },
            { id: reqId + "-STEP2", request_id: reqId, step_order: 2, approver_id: finalSelectedApprovers[1].id, status: 'Pending', assigned_date: todayStr },
            { id: reqId + "-STEP3", request_id: reqId, step_order: 3, approver_id: finalSelectedApprovers[2].id, status: 'Pending', assigned_date: todayStr }
        ];

        await supabaseClient.from('approval_steps').insert(stepsData);

        Swal.fire('สำเร็จ!', editId ? "📝 บันทึกการแก้ไขคำขอเรียบร้อยแล้วค่ะ!" : "🚀 ส่งใบคำขอ OT ให้พิจารณาอนุมัติเรียบร้อยแล้ว!", 'success');
        
        // 🚀 ส่งสัญญาณ Webhook แจ้งเตือนขอ OT
        if (!editId) {
            const notifyPayload = {
                action: 'new_request',
                data: {
                    id: reqId, // ตัวนี้ก็จะได้ OTR ใหม่ไปส่งด้วยอย่างสวยงามค่ะ
                    user_id: currentUser.id, 
                    fullname: currentUser.fullname,
                    date: dateStart,
                    description: description
                }
            };
            fetch(WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(notifyPayload)
            }).catch(err => console.error(err));
        }
        
        closeRequestFormModal();
        loadMyOTDashboardData(); 

    } catch (err) {
        console.error("Submit Request Error:", err);
        Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกคำขอค่ะ', 'error');
    }
}

function openRequestFormModal() { 
    document.getElementById("reqEditId").value = ""; 
    document.getElementById("reqOtType").value = "";
    document.getElementById("reqDateStart").value = "";
    document.getElementById("reqDescription").value = "";
    
    // ล้างค่าผู้พิจารณาเดิมทิ้ง
    finalSelectedApprovers = [];
    tempSelectedApprovers = []; 
    
    confirmApproverSelection(); 
    
    loadOTTypesCards(); 
    document.getElementById("otRequestFormModal").classList.remove("hidden"); 
}

function closeRequestFormModal() { 
    document.getElementById("otRequestFormModal").classList.add("hidden"); 
}

// ----------------===================================
// 6. ระบบออกจากระบบ (Logout Session Handler)
// ----------------===================================
function logoutUsers() {
    // ✨ โชว์ SweetAlert ก่อน แล้วค่อยตัดระบบไปหน้า Login
    Swal.fire({
        title: 'ออกจากระบบสำเร็จ',
        text: 'ออกจากระบบเรียบร้อยแล้วค่ะ 👋💕',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6',
        timer: 2000 // ตั้งให้ปิดอัตโนมัติใน 2 วินาทีได้ด้วยค่ะ
    }).then(() => {
        currentUser = null;
        localStorage.removeItem('oms_user_session'); // ✨ เพิ่มบรรทัดนี้: ล้างการจำล็อกอินทิ้งเมื่อกดออกจากระบบ
        document.getElementById("dashboardPage").style.display = "none";
        document.getElementById("pageformLogin").style.display = "flex"; 
        
        document.getElementById("loginusername").value = "";
        document.getElementById("loginpassword").value = "";
    });
}

async function openOTDetailModal(reqId) {
    const modal = document.getElementById('otDetailModal');
    const loading = document.getElementById('modalLoading');
    const requestToken = ++otDetailRequestToken;

    modal.classList.remove('hidden');
    loading.classList.remove('hidden');

    try {
        const { data: reqData, error: reqErr } = await supabaseClient
            .from('ot_requests')
            .select('id, user_id, ot_type_id, date_start, description, status')
            .eq('id', reqId)
            .single();
        if (reqErr) throw reqErr;
        if (requestToken !== otDetailRequestToken) return;

        // ข้อมูลทั้ง 3 ส่วนอาศัยเฉพาะ reqData จึงโหลดพร้อมกันได้
        const [userResult, otTypeResult, stepsResult] = await Promise.all([
            supabaseClient
                .from('users')
                .select('fullname, avatar_url, agency, department')
                .eq('id', reqData.user_id)
                .single(),
            supabaseClient
                .from('ot_types')
                .select('start_time, end_time, rate')
                .eq('id', reqData.ot_type_id)
                .single(),
            supabaseClient
                .from('approval_steps')
                .select('approver_id, step_order, status, approved_at, comment')
                .eq('request_id', reqId)
                .order('step_order', { ascending: true })
        ]);

        if (requestToken !== otDetailRequestToken) return;
        if (stepsResult.error) throw stepsResult.error;
        if (userResult.error) console.warn('Load OT detail user warning:', userResult.error);
        if (otTypeResult.error) console.warn('Load OT detail type warning:', otTypeResult.error);

        const userData = userResult.data;
        const otType = otTypeResult.data;
        const stepsData = stepsResult.data || [];
        const approverIds = [...new Set(stepsData.map(step => step.approver_id).filter(Boolean))];
        const approversResult = approverIds.length > 0
            ? await supabaseClient.from('users').select('id, fullname').in('id', approverIds)
            : { data: [], error: null };

        if (requestToken !== otDetailRequestToken) return;
        if (approversResult.error) console.warn('Load OT detail approvers warning:', approversResult.error);
        const approverMap = new Map((approversResult.data || []).map(approver => [approver.id, approver.fullname]));

        const avatarUrl = getAvatarUrl(userData?.fullname, userData?.avatar_url);
        document.getElementById('modalEmpImage').src = avatarUrl;
        document.getElementById('modalEmpName').innerText = userData?.fullname || reqData.user_id;
        const agencyName = AGENCY_NAME_MAP[userData?.agency] || userData?.agency || '-';
        const deptName = DEPARTMENT_NAME_MAP[userData?.department] || userData?.department || '-';

        document.getElementById('modalEmpDept').innerHTML = `หน่วยงาน: ${agencyName} <br> ฝ่าย: ${deptName}`;
        document.getElementById('modalReqId').innerText = reqData.id;

        let showDate = reqData.date_start;
        if (showDate && showDate.includes('-')) {
            const d = showDate.split('-');
            showDate = `${d[2]}/${d[1]}/${d[0]}`;
        }
        document.getElementById('modalDate').innerText = showDate;
        document.getElementById('modalDesc').innerText = reqData.description || '-';

        document.getElementById('modalTime').innerText = otType ? `${otType.start_time} - ${otType.end_time}` : '-';
        document.getElementById('modalRate').innerText = otType ? `${otType.rate} เท่า` : '-';
        document.getElementById('modalTotalHours').innerText = otType
            ? `${calculateOTHours(otType.start_time, otType.end_time)} ชม.`
            : '-';

        let mainBadge = '';
        if (reqData.status === 'Approved') mainBadge = '<span class="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-bold">อนุมัติเรียบร้อย</span>';
        else if (reqData.status === 'Rejected') mainBadge = '<span class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">ไม่อนุมัติ</span>';
        else mainBadge = '<span class="px-3 py-1 bg-amber-100 text-amber-600 rounded-full text-xs font-bold">รออนุมัติ</span>';
        document.getElementById('modalStatusBadge').innerHTML = mainBadge;

        const timelineContainer = document.getElementById('modalTimeline');
        timelineContainer.innerHTML = '';

        if (stepsData.length > 0) {
            timelineContainer.innerHTML = stepsData.map(step => {
                const approverName = approverMap.get(step.approver_id) || step.approver_id;
                let displayDate = step.approved_at || '-';
                if (displayDate !== '-' && displayDate.includes('/')) {
                    const [datePart, timePart] = displayDate.split(' : ');
                    const parts = datePart.trim().split('/');
                    const d = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    let y = parseInt(parts[2]);
                    if (y > 2500) y -= 543;

                    displayDate = `${d}/${m}/${y}`;
                    if (timePart) displayDate += ` : ${timePart}`;
                }

                let iconColor = 'bg-slate-200 text-slate-400';
                let statusText = '<span class="text-slate-500 text-xs">รอคิวพิจารณา</span>';

                if (step.status === 'Approved') {
                    iconColor = 'bg-green-500 text-white';
                    statusText = `<span class="text-green-600 text-xs font-bold">อนุมัติแล้ว (${displayDate})</span>`;
                } else if (step.status === 'Rejected') {
                    iconColor = 'bg-red-500 text-white';
                    statusText = `<span class="text-red-600 text-xs font-bold">ไม่อนุมัติ (${displayDate})</span>`;
                } else if (step.status === 'Pending') {
                    iconColor = 'bg-amber-400 text-white border-2 border-amber-200';
                    statusText = '<span class="text-amber-500 text-xs font-bold">กำลังรอพิจารณา</span>';
                }

                const commentHtml = step.comment && step.comment !== '-'
                    ? `<p class="text-xs text-slate-600 mt-1.5 bg-slate-100 p-2 rounded-lg border border-slate-200"><i class='bx bx-message-rounded-dots mr-1 text-slate-400'></i>หมายเหตุ: ${step.comment}</p>`
                    : '';

                return `
                    <div class="relative pl-8 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0">
                        <div class="absolute -left-[13px] top-0 w-6 h-6 rounded-full ${iconColor} flex items-center justify-center text-[10px] font-bold shadow-sm">
                            ${step.step_order}
                        </div>
                        <div>
                            <p class="font-bold text-slate-700 text-sm">${approverName}</p>
                            ${statusText}
                            ${commentHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

    } catch (err) {
        if (requestToken !== otDetailRequestToken) return;
        console.error("Error loading OT details:", err);
        Swal.fire('ข้อผิดพลาด', 'ดึงข้อมูลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ', 'error');
        modal.classList.add('hidden');
    } finally {
        if (requestToken === otDetailRequestToken) loading.classList.add('hidden');
    }
}

function closeOTDetailModal() {
    otDetailRequestToken++;
    document.getElementById('otDetailModal').classList.add('hidden');
    document.getElementById('modalLoading').classList.add('hidden');
}

function toggleAllCheckboxes(source) {
    const checkboxes = document.querySelectorAll('.rowCheckbox');
    checkboxes.forEach(cb => {
        cb.checked = source.checked;
    });
}

async function bulkApproveSteps(action) {
    const checkboxes = document.querySelectorAll('.rowCheckbox:checked');
    
    if (checkboxes.length === 0) {
        Swal.fire('แจ้งเตือน', 'ยังไม่ได้เลือกรายการที่ต้องการดำเนินการ 😅 ติ๊กถูกข้างหน้าก่อนค่ะ', 'warning');
        return;
    }

    const actionText = action === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    
    // ✨ ใช้ SweetAlert2 แทนกล่อง Prompt เดิม
    const { value: reasonInput } = await Swal.fire({
        title: `ยืนยันการ${actionText}`,
        text: `ต้องการยืนยัน "${actionText}" ทั้งหมด ${checkboxes.length} รายการ\n⚠️ กรุณาระบุเหตุผล/หมายเหตุ:`,
        input: 'text',
        inputPlaceholder: 'พิมพ์เหตุผลที่นี่...',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: action === 'Approved' ? '#22c55e' : '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return 'จำเป็นต้องระบุเหตุผลในการดำเนินการค่ะ ❌';
            }
        }
    });
    
    if (!reasonInput) return; // กรณีผู้ใช้กดยกเลิก

    // ✨ โชว์หน้าต่างกำลังโหลด (Loading Spinner)
    Swal.fire({
        title: 'กำลังประมวลผล...',
        html: 'ระบบกำลังบันทึกข้อมูล กรุณารอสักครู่นะคะ ⏳',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // ใช้เฉพาะ Checkbox ที่ถูกเลือก จึงรองรับทั้งเลือกบางรายการและเลือกทั้งหมด
        const selectedItems = Array.from(checkboxes).map(cb => ({
            checkbox: cb,
            stepId: cb.value,
            requestId: cb.dataset.requestId,
            currentOrder: Number(cb.dataset.stepOrder),
            totalSteps: Number(cb.dataset.totalSteps)
        }));
        const stepIds = [...new Set(selectedItems.map(item => item.stepId).filter(Boolean))];
        const now = new Date();
        const timestampStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} : ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // อัปเดตขั้นอนุมัติที่ถูกเลือกทั้งหมดในคำสั่งเดียว
        const { error: stepsUpdateError } = await supabaseClient
            .from('approval_steps')
            .update({
                status: action,
                approved_at: timestampStr,
                comment: reasonInput.trim()
            })
            .in('id', stepIds);

        if (stepsUpdateError) throw stepsUpdateError;

        // อัปเดตสถานะคำขอเป็นชุด เฉพาะรายการที่ต้องปิด Workflow เท่านั้น
        const requestUpdatePromises = [];
        if (action === 'Rejected') {
            const rejectedRequestIds = [...new Set(selectedItems.map(item => item.requestId).filter(Boolean))];
            if (rejectedRequestIds.length > 0) {
                requestUpdatePromises.push(
                    supabaseClient.from('ot_requests').update({ status: 'Rejected' }).in('id', rejectedRequestIds)
                );
            }
        } else if (action === 'Approved') {
            const finalApprovedRequestIds = [...new Set(
                selectedItems
                    .filter(item => item.currentOrder === item.totalSteps)
                    .map(item => item.requestId)
                    .filter(Boolean)
            )];
            if (finalApprovedRequestIds.length > 0) {
                requestUpdatePromises.push(
                    supabaseClient.from('ot_requests').update({ status: 'Approved' }).in('id', finalApprovedRequestIds)
                );
            }
        }

        const requestUpdateResults = await Promise.all(requestUpdatePromises);
        const requestUpdateError = requestUpdateResults.find(result => result.error)?.error;
        if (requestUpdateError) throw requestUpdateError;

        const approvedPayloadData = action === 'Approved'
            ? selectedItems.map(item => {
                const tr = item.checkbox.closest('tr');
                const empName = tr.querySelector('.font-bold.text-slate-700').innerText;
                const otDate = tr.cells[4].innerText;
                const otHoursStr = tr.cells[5].innerText;
                let hrs = 0;

                if (otHoursStr.includes('-')) {
                    const [start, end] = otHoursStr.split('-').map(value => value.trim());
                    hrs = calculateOTHours(start, end);
                }

                return {
                    user_id: currentUser.id,
                    approver_name: currentUser.fullname,
                    emp_id: tr.querySelector('.font-semibold').innerText,
                    fullname: empName,
                    date: otDate,
                    hours: hrs
                };
            })
            : [];

        // ✨ ยิง Webhook แบบมัดรวมก้อนเดียวส่งเลย! (ถ้ามีการอนุมัติ) ✨
        if (action === 'Approved' && approvedPayloadData.length > 0) {
            fetch(WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                // ✨ ไนท์เปลี่ยนจาก application/json เป็น text/plain เพื่อให้ยิงผ่านแบบ 100% ค่ะ
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'bulk_approve', data: approvedPayloadData })
            }).catch(err => console.error(err));
        }

        // ✨ เปลี่ยน Alert ตอนสำเร็จเป็น SweetAlert
        Swal.fire('สำเร็จ!', `✅ ดำเนินการ ${actionText} สำเร็จเรียบร้อยแล้วค่ะ!`, 'success');
        
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) selectAllCb.checked = false;
        loadApprovalQueueData();

    } catch (err) {
        console.error("Bulk Approve Error:", err);
        Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ ลองใหม่อีกครั้งนะคะ', 'error');
    }
}

async function deleteMyOTRequest(reqId) {
    // ✨ เช็คก่อนลบ ป้องกันการลบข้อมูลที่กำลังพิจารณา
    const { data: stepsCheck } = await supabaseClient.from('approval_steps').select('status').eq('request_id', reqId);
    const hasAction = stepsCheck && stepsCheck.some(s => s.status !== 'Pending');
    
    if (hasAction) {
        Swal.fire('ลบไม่ได้', 'รายการนี้เริ่มเข้าสู่ขั้นตอนการพิจารณาแล้ว ไม่สามารถลบได้ค่ะ 😅', 'warning');
        return;
    }

    // ✨ อัปเกรดเป็น SweetAlert2 ให้สวยเข้าชุด
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบคำขอโอทีรหัส ${reqId} ใช่ไหมคะ?\n⚠️ ลบแล้วไม่สามารถกู้คืนได้นะคะ`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('approval_steps').delete().eq('request_id', reqId);
        await supabaseClient.from('ot_requests').delete().eq('id', reqId);
        
        Swal.fire('สำเร็จ', '🗑️ ลบรายการสำเร็จแล้วค่ะ!', 'success');
        loadMyOTDashboardData(); 

    } catch (err) {
        console.error("Delete OT Request Error:", err);
        Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการลบข้อมูลค่ะ ลองใหม่อีกครั้งนะคะ', 'error');
    }
}

async function editMyOTRequest(reqId) {
    try {
        const { data: reqData, error: reqErr } = await supabaseClient
            .from('ot_requests').select('*').eq('id', reqId).single();
        if (reqErr) throw reqErr;

        // ✨ ป้องกันคนหัวหมอแอบส่งคำสั่งแก้: เช็คว่าเริ่มพิจารณาไปแล้วหรือยัง
        const { data: stepsCheck } = await supabaseClient.from('approval_steps').select('status').eq('request_id', reqId);
        const hasAction = stepsCheck && stepsCheck.some(s => s.status !== 'Pending');

        if (reqData.status === 'Approved' || reqData.status === 'Rejected' || hasAction) {
            Swal.fire('แก้ไขไม่ได้', 'รายการนี้เริ่มเข้าสู่ขั้นตอนการพิจารณาแล้ว ไม่สามารถแก้ไขได้ค่ะ 😅', 'warning');
            return;
        }

        const { data: stepsData } = await supabaseClient
            .from('approval_steps').select('*').eq('request_id', reqId).order('step_order', { ascending: true });

        finalSelectedApprovers = [];
        if (stepsData && stepsData.length > 0) {
            const approverIds = stepsData.map(s => s.approver_id);
            const { data: approvers } = await supabaseClient.from('users').select('*').in('id', approverIds);
            
            stepsData.forEach(step => {
                const user = approvers.find(u => u.id === step.approver_id);
                if (user) finalSelectedApprovers.push(user);
            });
        }

        document.getElementById("reqEditId").value = reqId; 
        document.getElementById("reqDateStart").value = reqData.date_start;
        document.getElementById("reqDescription").value = reqData.description;
        document.getElementById("reqOtType").value = reqData.ot_type_id;

        await loadOTTypesCards(); 
        
        setTimeout(() => {
            const cards = document.querySelectorAll('.ot-card');
            cards.forEach(c => {
                if (c.dataset.id == reqData.ot_type_id) c.click(); 
            });
        }, 100);

        confirmApproverSelection(); 
        document.getElementById("otRequestFormModal").classList.remove("hidden"); 

    } catch (err) {
        console.error("Edit OT Request Error:", err);
        Swal.fire('ข้อผิดพลาด', 'ดึงข้อมูลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ', 'error');
    }
}

function searchOTRequests() {
    const searchInput = document.getElementById("searchInput");
    myOTDashboardSearchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
    myOTDashboardCurrentPage = 1;
    renderMyOTRequestsPage();
}

// ===================================================
// ระบบปฏิทินภาพรวม OT (OT Calendar)
// ===================================================
let currentCalDate = new Date(); 
let calendarOTData = []; 
let calendarHolidaysData = [];
let calendarWorkdaysData = [];
let calendarOTByDate = new Map();
let calendarHolidayByDate = new Map();
let calendarWorkdayByNumber = new Map();
let calendarMonthCache = new Map();
let calendarReferenceDataPromise = null;
let calendarLoadToken = 0;

const CALENDAR_PAGE_SIZE = 1000;

function formatCalendarISODate(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeCalendarDateKey(dateValue) {
    const parsedDate = parseOTRequestDate(dateValue);
    if (!parsedDate) return '';
    return formatCalendarISODate(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
}

function formatCalendarDisplayDate(dateValue) {
    const dateKey = normalizeCalendarDateKey(dateValue);
    if (!dateKey) return '-';
    const [year, month, day] = dateKey.split('-');
    return `${day}-${month}-${year}`;
}

function getCalendarMonthRange(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        startDate: formatCalendarISODate(year, month, 1),
        endDate: formatCalendarISODate(year, month, lastDay)
    };
}

function updateCalendarMonthHeading(date = currentCalDate) {
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const heading = document.getElementById("calendarMonthYear");
    if (heading) heading.innerText = `${monthNames[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function setCalendarLoadingState(date = currentCalDate) {
    updateCalendarMonthHeading(date);
    const grid = document.getElementById("calendarGrid");
    if (!grid) return;
    grid.innerHTML = `
        <div class="col-span-7 min-h-[280px] flex flex-col items-center justify-center text-slate-400">
            <i class='bx bx-loader-alt bx-spin text-4xl text-blue-500'></i>
            <p class="mt-3 text-sm font-medium">กำลังโหลดข้อมูลปฏิทิน...</p>
        </div>
    `;
}

async function fetchCalendarRequestsByMonth(startDate, endDate) {
    const allRequests = [];

    for (let from = 0; ; from += CALENDAR_PAGE_SIZE) {
        const to = from + CALENDAR_PAGE_SIZE - 1;
        const { data, error } = await supabaseClient
            .from('ot_requests')
            .select('id, user_id, ot_type_id, date_start, status')
            .gte('date_start', startDate)
            .lte('date_start', endDate)
            .order('date_start', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw error;

        const page = data || [];
        allRequests.push(...page);
        if (page.length < CALENDAR_PAGE_SIZE) break;
    }

    return allRequests;
}

async function fetchCalendarReferenceData() {
    if (!calendarReferenceDataPromise) {
        calendarReferenceDataPromise = Promise.all([
            supabaseClient.from('users').select('id, fullname, department, agency, avatar_url'),
            supabaseClient.from('holidays').select('holiday_date, description'),
            supabaseClient.from('ot_types').select('id, start_time, end_time'),
            supabaseClient.from('day_of_week').select('day_number, is_working')
        ]).then(([userRes, holRes, typeRes, workRes]) => {
            const firstError = userRes.error || holRes.error || typeRes.error || workRes.error;
            if (firstError) throw firstError;

            return {
                users: userRes.data || [],
                holidays: holRes.data || [],
                otTypes: typeRes.data || [],
                workdays: workRes.data || []
            };
        }).catch(error => {
            calendarReferenceDataPromise = null;
            throw error;
        });
    }

    return calendarReferenceDataPromise;
}

function buildCalendarOTDateIndex(requests) {
    const dateIndex = new Map();

    requests.forEach(request => {
        const dateKey = normalizeCalendarDateKey(request.date_start);
        if (!dateKey) return;
        if (!dateIndex.has(dateKey)) dateIndex.set(dateKey, []);
        dateIndex.get(dateKey).push(request);
    });

    return dateIndex;
}

async function initCalendar() {
    calendarOTData = [];
    calendarHolidaysData = [];
    calendarWorkdaysData = [];
    calendarOTByDate = new Map();
    calendarHolidayByDate = new Map();
    calendarWorkdayByNumber = new Map();
    calendarMonthCache = new Map();
    calendarReferenceDataPromise = null;

    const loaded = await fetchOTForCalendar(currentCalDate, { forceRefresh: true });
    if (loaded) renderCalendar();
}

async function fetchOTForCalendar(targetDate = currentCalDate, { forceRefresh = false } = {}) {
    const monthRange = getCalendarMonthRange(targetDate);
    const cachedMonth = calendarMonthCache.get(monthRange.key);
    const loadToken = ++calendarLoadToken;

    if (cachedMonth && !forceRefresh) {
        calendarOTData = cachedMonth.requests;
        calendarOTByDate = cachedMonth.byDate;
        return true;
    }

    setCalendarLoadingState(targetDate);

    try {
        const [reqs, referenceData] = await Promise.all([
            fetchCalendarRequestsByMonth(monthRange.startDate, monthRange.endDate),
            fetchCalendarReferenceData()
        ]);

        if (loadToken !== calendarLoadToken) return false;

        const userMap = new Map(referenceData.users.map(user => [user.id, user]));
        const otTypeMap = new Map(referenceData.otTypes.map(otType => [otType.id, otType]));
        const mappedRequests = reqs.map(req => {
            const user = userMap.get(req.user_id) || {};
            const otType = otTypeMap.get(req.ot_type_id) || {};

            return {
                ...req,
                fullname: user.fullname || req.user_id || 'ไม่ทราบชื่อ',
                department: user.department || 'ไม่ระบุฝ่าย',
                agency: user.agency || '-',
                avatar_url: user.avatar_url || '',
                time_range: otType.start_time ? `${otType.start_time} - ${otType.end_time}` : '-'
            };
        });

        const byDate = buildCalendarOTDateIndex(mappedRequests);
        calendarMonthCache.set(monthRange.key, { requests: mappedRequests, byDate });

        calendarOTData = mappedRequests;
        calendarOTByDate = byDate;
        calendarHolidaysData = referenceData.holidays;
        calendarWorkdaysData = referenceData.workdays;
        calendarHolidayByDate = new Map(
            calendarHolidaysData
                .map(holiday => [normalizeCalendarDateKey(holiday.holiday_date), holiday])
                .filter(([dateKey]) => dateKey)
        );
        calendarWorkdayByNumber = new Map(
            calendarWorkdaysData.map(workday => [Number(workday.day_number), workday])
        );

        return true;
    } catch (err) {
        console.error("Fetch Calendar Error:", err);
        if (loadToken === calendarLoadToken) {
            const grid = document.getElementById("calendarGrid");
            if (grid) {
                grid.innerHTML = `
                    <div class="col-span-7 min-h-[280px] flex flex-col items-center justify-center text-red-500">
                        <i class='bx bx-error-circle text-4xl'></i>
                        <p class="mt-3 text-sm font-semibold">โหลดข้อมูลปฏิทินไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ</p>
                    </div>
                `;
            }
        }
        return false;
    }
}

function renderCalendar() {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth(); 
    updateCalendarMonthHeading(currentCalDate);

    const grid = document.getElementById("calendarGrid");
    if (!grid) return; 

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // ✨ เพิ่มตัวย่อวันสำหรับแสดงมุมขวาของการ์ด ✨
    const dayAbbr = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
    const deptMap = { 'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี', 'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM' };

    const calendarCells = [];

    // สร้างกล่องล่องหนสำหรับวันว่างก่อนเริ่มเดือน
    for (let i = 0; i < firstDay; i++) {
        calendarCells.push(`<div class="bg-slate-50/40 rounded-2xl border-2 border-transparent"></div>`);
    }

    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateDash = formatCalendarISODate(year, month, day);

        const companyHoliday = calendarHolidayByDate.get(dateDash);

        let currentDateObj = new Date(year, month, day);
        let jsDayIndex = currentDateObj.getDay(); 
        let dbDayNum = jsDayIndex === 0 ? 7 : jsDayIndex; 
        
        let currentDayName = dayAbbr[jsDayIndex]; // ดึงตัวย่อของวัน
        
        let dayConfig = calendarWorkdayByNumber.get(dbDayNum);
        let isWeeklyHoliday = dayConfig ? (dayConfig.is_working === false) : false;

        let isHoliday = companyHoliday || isWeeklyHoliday;
        let holidayDesc = "";
        
        if (companyHoliday) {
            holidayDesc = companyHoliday.description; 
        } else if (isWeeklyHoliday) {
            holidayDesc = "วันหยุดประจำสัปดาห์"; 
        }

        const otToday = calendarOTByDate.get(dateDash) || [];
        const groupedByDept = {};
        otToday.forEach(ot => {
            const deptName = deptMap[ot.department] || ot.department || 'ไม่ระบุฝ่าย';
            if (!groupedByDept[deptName]) groupedByDept[deptName] = [];
            groupedByDept[deptName].push(ot);
        });

        let deptBadgesHTML = "";
        for (const [dept, requests] of Object.entries(groupedByDept)) {
            // ✨ ป้ายแผนกแบบใหม่ พื้นเทา ไอคอนตึก แบบมีมิติ ✨
            deptBadgesHTML += `
                <div onclick="openDeptOTListModal('${dateDash}', '${dept}')" class="calendar-dept-chip text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-semibold flex items-center cursor-pointer hover:bg-slate-200 transition-colors shadow-sm mb-1.5 group border border-slate-200/60">
                    <i class='bx bxs-buildings text-slate-400 mr-2 text-sm group-hover:text-blue-500 transition-colors'></i>
                    <span class="truncate flex-1">${dept} <span class="text-slate-500">(${requests.length})</span></span>
                </div>
            `;
        }

        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        
        // ✨ กำหนดสไตล์ของการ์ดแต่ละใบ ✨
        let cellClasses = "bg-white p-2 flex flex-col relative rounded-2xl shadow-sm border-2 transition-all hover:shadow-md group/cell";
        let holidayText = "";
        let paddingTop = "pt-1";

        if (isHoliday) {
            cellClasses += " border-red-400"; // ขอบแดงสำหรับวันหยุด
            holidayText = `<div class="text-[10px] text-red-500 text-center font-bold truncate absolute top-2 left-0 w-full px-2" title="${holidayDesc}">${holidayDesc}</div>`;
            paddingTop = "pt-6"; // ดันตัวเลขลงมาเพื่อหลบข้อความ
        } else if (isToday) {
            cellClasses += " border-green-500 border-[3px] "; // ขอบเขียวสำหรับวันนี้
        } else {
            cellClasses += " border-slate-100 hover:border-blue-300"; // ขอบปกติ
        }

        calendarCells.push(`
            <div class="${cellClasses}">
                ${holidayText}
                <div class="flex justify-between items-start w-full ${paddingTop} px-1.5 mb-2">
                    <span class="font-bold text-slate-800 text-xl leading-none">${day}</span>
                    <span class="text-[10px] font-bold text-slate-400 leading-none">${currentDayName}</span>
                </div>
                <div class="flex-1 overflow-y-auto mt-1 custom-scrollbar scrollbar-hide space-y-1 px-0.5 pb-1">
                    ${deptBadgesHTML}
                </div>
            </div>
        `);
    }

    // สร้างกล่องล่องหนเติมให้เต็มตาราง
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells > 35 ? 42 - totalCells : 35 - totalCells; 
    for (let i = 0; i < remainingCells; i++) {
        calendarCells.push(`<div class="bg-slate-50/40 rounded-2xl border-2 border-transparent"></div>`);
    }

    grid.innerHTML = calendarCells.join('');
}

async function changeCalendarMonth(offset) {
    currentCalDate = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + offset, 1);
    const loaded = await fetchOTForCalendar(currentCalDate);
    if (loaded) renderCalendar();
}

function openDeptOTListModal(dateDash, deptName) {
    const modal = document.getElementById("deptOTListModal");
    const container = document.getElementById("deptOTListContainer");
    
    const deptMapReverse = { 'ฝ่ายผลิต MA': 'DPM-001', 'ฝ่ายบุคคล': 'DPM-002', 'ฝ่ายบัญชี': 'DPM-003', 'ฝ่ายวิศวกรรม': 'DPM-004', 'ฝ่ายวางแผน': 'DPM-005', 'ฝ่ายผลิต SM': 'DPM-006' };
    const deptCode = deptMapReverse[deptName] || deptName;

    const filteredReqs = (calendarOTByDate.get(dateDash) || []).filter(ot => 
        (ot.department === deptCode || ot.department === deptName)
    );

    document.getElementById("modalDeptTitle").innerText = deptName;
    document.getElementById("modalDeptCount").innerText = `วันที่ ${formatCalendarDisplayDate(dateDash)} • ${filteredReqs.length} คำขอ`;

    container.innerHTML = "";

    if (filteredReqs.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">ไม่พบข้อมูลคำขอ</div>`;
    } else {
        filteredReqs.forEach(req => {
            let statusHtml = '';
            if (req.status === 'Approved') statusHtml = '<span class="dashboard-status-approved px-2 md:px-2.5 py-1 md:py-1.5 rounded-full text-[10px] font-bold bg-green-100 text-green-600 border border-green-200"><i class="bx bx-check-circle mr-0.5"></i>อนุมัติ</span>';
            else if (req.status === 'Rejected') statusHtml = '<span class="dashboard-status-rejected px-2 md:px-2.5 py-1 md:py-1.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 border border-red-200"><i class="bx bx-x-circle mr-0.5"></i>ไม่อนุมัติ</span>';
            else statusHtml = '<span class="dashboard-status-pending px-2 md:px-2.5 py-1 md:py-1.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200"><i class="bx bx-time-five mr-0.5"></i>รออนุมัติ</span>';

            // ✨ สร้างตัวแปลงชื่อหน่วยงาน เพื่อโชว์ชื่อแทนรหัส ✨
            const agencyMapList = { 'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending', 'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding', 'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR', 'AGC-015': 'Planning', 'AGC-016': 'Accounting' };
            const mappedAgencyName = agencyMapList[req.agency] || req.agency || '-';

            const row = document.createElement("div");
            row.className = "calendar-modal-row grid grid-cols-12 gap-2 items-center p-3 md:p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 rounded-lg transition-colors";
            
            row.innerHTML = `
                <div class="col-span-5 flex items-center space-x-2 pl-1 overflow-hidden">
                    <div class="w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden border border-slate-300 shadow-sm">
                        <img src="${getAvatarUrl(req.fullname, req.avatar_url)}" class="w-full h-full object-cover">
                    </div>
                    <div class="min-w-0">
                        <p class="text-xs md:text-sm font-bold text-slate-700 truncate">${req.fullname}</p>
                        <!-- ✨ แก้ไขที่ 3: โชว์แค่ชื่อหน่วยงาน และไม่แสดงรหัสฝ่ายแล้ว ✨ -->
                        <p class="text-[10px] text-slate-400 truncate">${mappedAgencyName}</p>
                    </div>
                </div>
                <div class="col-span-3 text-center text-xs font-medium text-slate-600">
                    ${req.time_range}
                </div>
                <div class="col-span-2 text-center flex justify-center">
                    ${statusHtml}
                </div>
                <div class="col-span-2 text-center flex justify-center">
                    <button onclick="openOTDetailModal('${req.id}')" class="dashboard-action-btn dashboard-btn-blue w-7 h-7 md:w-9 md:h-9 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-110" title="ดูรายละเอียด">
                        <i class='bx bx-show text-sm md:text-lg'></i>
                    </button>
                </div>
            `;
            container.appendChild(row);
        });
    }

    modal.classList.remove("hidden");
}

function closeDeptOTListModal() {
    document.getElementById("deptOTListModal").classList.add("hidden");
}

// ===================================================
// ฟังก์ชันค้นหาข้อมูลในตารางแบบครอบจักรวาล (ใช้ได้ทุกหน้า)
// ===================================================
function searchTable(inputId, tbodyId) {
    const input = document.getElementById(inputId).value.toLowerCase();
    const rows = document.getElementById(tbodyId).getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) {
        rows[i].style.display = rows[i].innerText.toLowerCase().includes(input) ? "" : "none";
    }
}

// ===================================================
// ระบบจัดการผู้ใช้งาน (Page 6)
// ===================================================
async function loadUsersData() {
    try {
        const [usersRes, agenciesRes, departmentsRes] = await Promise.all([
            supabaseClient.from('users').select('*').order('id', { ascending: true }),
            supabaseClient.from('agency').select('*').order('id', { ascending: true }),
            supabaseClient.from('departments').select('*').order('id', { ascending: true })
        ]);

        if (usersRes.error) throw usersRes.error;
        if (agenciesRes.error) console.warn("Load User Agencies Error:", agenciesRes.error);
        if (departmentsRes.error) console.warn("Load User Departments Error:", departmentsRes.error);

        const users = usersRes.data || [];
        const agencyNameMap = new Map((agenciesRes.data || []).map(agency => [
            agency.id,
            agency.name || agency.agency_name || agency.description || agency.id
        ]));
        const departmentNameMap = new Map((departmentsRes.data || []).map(department => [
            department.id,
            department.name || department.department_name || department.id
        ]));

        const tbody = document.getElementById("usersTableBody");
        tbody.innerHTML = "";

        users.forEach(u => {
            const statusBadge = u.status 
                ? '<span class="dashboard-status-approved px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-600 border border-green-200">เปิดใช้งาน</span>'
                : '<span class="user-status-inactive px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">ปิดใช้งาน</span>';

            let roleBadge = '';
            if(u.role === 'SuperAdmin') roleBadge = '<span class="user-role-superadmin text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg border border-transparent">SuperAdmin</span>';
            else if(u.role === 'Admin') roleBadge = '<span class="user-role-admin text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-transparent">Admin</span>';
            else if(u.role === 'SuperUser') roleBadge = '<span class="user-role-superuser text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-transparent">SuperUser</span>';
            else roleBadge = '<span class="user-role-user text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-transparent">User</span>';

            const agencyName = agencyNameMap.get(u.agency) || u.agency || '-';
            const departmentName = departmentNameMap.get(u.department) || u.department || '-';

            tbody.innerHTML += `
                <tr class="user-table-row hover:bg-slate-50 transition-colors">
                    <td class="p-3 text-center font-bold text-slate-700">${u.id}</td>
                    
                    <td class="p-3">
                        <div class="flex items-center space-x-3">
                            <div class="w-9 h-9 sm:w-14 sm:h-14 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm">
                                <img src="${getAvatarUrl(u.fullname, u.avatar_url)}" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <p class="text-sm font-bold text-slate-700">${u.fullname}</p>
                                <p class="text-[11px] text-slate-400">@${u.username}</p>
                            </div>
                        </div>
                    </td>
                    <td class="p-3 text-center font-bold text-slate-700 whitespace-nowrap">${u.employee_id ?? '-'}</td>
                    <td class="p-3 text-center">${roleBadge}</td>
                    <td class="p-3 text-center text-xs text-slate-600"><span class="font-semibold">${agencyName}</span> <br> <span class="text-[11px] text-slate-400">${departmentName}</span></td>
                    <td class="p-3 text-center">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <button onclick="openUserModal('${u.id}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1" title="แก้ไข"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteUserData('${u.id}', '${u.fullname}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="ลบ"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load Users Error:", err); }
}

// ===================================================
// ตัวแปรและฟังก์ชันสำหรับอัปโหลดรูปโปรไฟล์
// ===================================================
let selectedAvatarFile = null; // ตัวแปรเก็บไฟล์รูปภาพที่ผู้ใช้เลือก

function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        selectedAvatarFile = file; // เก็บไฟล์ไว้รออัปโหลด
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatarPreview');
            const placeholder = document.getElementById('avatarPlaceholder');
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
        reader.readAsDataURL(file);
    }
}

async function openUserModal(id = null) {
    document.getElementById("userFormModal").classList.remove("hidden");
    const title = document.getElementById("userModalTitle");
    
    // เคลียร์ฟอร์มให้สะอาด
    document.getElementById("formUserId").value = "";
    document.getElementById("formUsername").value = "";
    document.getElementById("formPassword").value = "";
    document.getElementById("formEmployeeId").value = "";
    document.getElementById("formFirstName").value = "";
    document.getElementById("formLastName").value = "";
    document.getElementById("formAvatarUrl").value = ""; 
    document.getElementById("formRole").value = "User";
    document.getElementById("formStatus").checked = true;

    // ✨ เคลียร์ส่วนอัปโหลดรูปรอไว้
    selectedAvatarFile = null; 
    document.getElementById("uploadAvatarInput").value = ""; 
    document.getElementById('avatarPreview').classList.add('hidden');
    document.getElementById('avatarPreview').src = "";
    document.getElementById('avatarPlaceholder').classList.remove('hidden');

    try {
        const [agencyRes, deptRes] = await Promise.all([
            supabaseClient.from('agency').select('*').order('id', { ascending: true }),
            supabaseClient.from('departments').select('*').order('id', { ascending: true })
        ]);
        
        const agencySelect = document.getElementById("formAgency");
        agencySelect.innerHTML = '<option value="">-- เลือกหน่วยงาน --</option>';
        if (agencyRes.data) {
            agencyRes.data.forEach(a => {
                const aName = a.name || a.agency_name || a.description || '';
                agencySelect.innerHTML += `<option value="${a.id}">${a.id} - ${aName}</option>`;
            });
        }

        const deptSelect = document.getElementById("formDept");
        deptSelect.innerHTML = '<option value="">-- เลือกฝ่าย --</option>';
        if (deptRes.data) {
            deptRes.data.forEach(d => {
                const dName = d.name || d.department_name || '';
                deptSelect.innerHTML += `<option value="${d.id}">${d.id} - ${dName}</option>`;
            });
        }
    } catch (err) {
        console.error("Error loading dropdown data:", err);
    }

    if (id) {
        title.innerHTML = "<i class='bx bxs-user-detail mr-2'></i>แก้ไขข้อมูลผู้ใช้งาน";
        try {
            const { data } = await supabaseClient.from('users').select('*').eq('id', id).single();
            if (data) {
                document.getElementById("formUserId").value = data.id;
                document.getElementById("formUsername").value = data.username;
                document.getElementById("formPassword").value = data.password;
                document.getElementById("formEmployeeId").value = data.employee_id ?? "";
                const normalizedFullname = String(data.fullname || "").trim().replace(/\s+/g, " ");
                const fullnameParts = normalizedFullname ? normalizedFullname.split(" ") : [];
                document.getElementById("formFirstName").value = fullnameParts.shift() || "";
                document.getElementById("formLastName").value = fullnameParts.join(" ");
                document.getElementById("formAvatarUrl").value = data.avatar_url || ""; 
                document.getElementById("formAgency").value = data.agency || "";
                document.getElementById("formDept").value = data.department || "";
                document.getElementById("formRole").value = data.role;
                document.getElementById("formStatus").checked = data.status;

                // ✨ ถ้าระบบมีลิงก์รูปภาพเก่า หรือรูปใน Supabase ให้ดึงมาแสดง Preview
                if (data.avatar_url) {
                    document.getElementById('avatarPreview').src = data.avatar_url;
                    document.getElementById('avatarPreview').classList.remove('hidden');
                    document.getElementById('avatarPlaceholder').classList.add('hidden');
                }
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-user-plus mr-2'></i>เพิ่มผู้ใช้งานใหม่";
    }
}

function closeUserModal() { document.getElementById("userFormModal").classList.add("hidden"); }

async function saveUserData() {
    const id = document.getElementById("formUserId").value;
    const btnSave = event.currentTarget || event.target; 
    const originalBtnText = btnSave.innerHTML; 

    const username = document.getElementById("formUsername").value.trim();
    const password = document.getElementById("formPassword").value.trim();
    const employeeId = document.getElementById("formEmployeeId").value.trim();
    const firstName = document.getElementById("formFirstName").value.trim().replace(/\s+/g, " ");
    const lastName = document.getElementById("formLastName").value.trim().replace(/\s+/g, " ");
    const fullname = `${firstName} ${lastName}`;
    const agency = document.getElementById("formAgency").value;
    const department = document.getElementById("formDept").value;
    const role = document.getElementById("formRole").value;
    const status = document.getElementById("formStatus").checked;
    
    let finalAvatarUrl = document.getElementById("formAvatarUrl").value;

    if (!username || !password || !firstName || !lastName) {
        Swal.fire('ข้อมูลไม่ครบ', 'อย่าลืมกรอก Username, Password, ชื่อ และนามสกุลให้ครบถ้วนนะคะ 🥺', 'warning'); 
        return;
    }

    try {
        btnSave.innerHTML = "<i class='bx bx-loader-alt bx-spin mr-1'></i> กำลังบันทึกข้อมูล...";
        btnSave.disabled = true;

        // ✨ ขั้นตอนที่ 1: ตรวจสอบว่ามีการเลือกไฟล์รูปใหม่หรือไม่?
        if (selectedAvatarFile) {
            const fileExt = selectedAvatarFile.name.split('.').pop();
            const fileName = `avatar_${username}_${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('avatars') 
                .upload(fileName, selectedAvatarFile, {
                    cacheControl: '3600',
                    upsert: false 
                });

            if (uploadError) {
                console.error("Upload Error:", uploadError);
                throw new Error("ไม่สามารถอัปโหลดรูปภาพได้ค่ะ ลองตรวจสอบชื่อไฟล์หรือขนาดไฟล์ดูนะคะ");
            }

            const { data: publicUrlData } = supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);

            finalAvatarUrl = publicUrlData.publicUrl; 
        }

        // ✨ ขั้นตอนที่ 2: เตรียมแพ็กเกจข้อมูล (พี่ต้นข้ามบรรทัดนี้ไปค่ะ เลยเอามาเติมให้แล้ว)
        const payload = {
            username: username,
            password: password,
            employee_id: employeeId || null,
            fullname: fullname,
            avatar_url: finalAvatarUrl, 
            agency: agency,
            department: department,
            role: role,
            status: status
        };

        // ✨ ขั้นตอนที่ 3: ตรวจสอบว่าเป็นการแก้ไขหรือเพิ่มใหม่
        if (id) {
            const { error: updateError } = await supabaseClient.from('users').update(payload).eq('id', id);
            if (updateError) throw updateError;
        } else {
            // ถ้ารหัสพนักงานใหม่ ให้ไปหารหัสล่าสุดมาก่อน
            const { data: lastUser, error: lastUserErr } = await supabaseClient
                .from('users')
                .select('id')
                .order('id', { ascending: false })
                .limit(1);

            if (lastUserErr) throw lastUserErr;

            let newId = "USER-001"; // ค่าเริ่มต้น

            if (lastUser && lastUser.length > 0) {
                const lastIdStr = lastUser[0].id;
                const lastNum = parseInt(lastIdStr.split('-')[1], 10); 
                const nextNum = lastNum + 1; 
                newId = "USER-" + String(nextNum).padStart(3, '0'); 
            }

            payload.id = newId; // ใส่รหัสใหม่เข้าไปใน payload
            
            const { error: insertError } = await supabaseClient.from('users').insert([payload]);
            if (insertError) throw insertError;
        }
        
        closeUserModal();
        loadUsersData(); 
        
        Swal.fire('สำเร็จ!', id ? "อัปเดตข้อมูลสำเร็จเรียบร้อยค่ะ ✨" : "เพิ่มผู้ใช้งานและอัปโหลดรูปสำเร็จ ✨", 'success');

    } catch (err) { 
        Swal.fire('ข้อผิดพลาด', err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ ลองใหม่อีกครั้งนะคะ", 'error');
        console.error("Save User Error:", err); 
    } finally {
        btnSave.innerHTML = originalBtnText;
        btnSave.disabled = false;
    }
}

async function deleteUserData(id, name) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบผู้ใช้งาน "${name}" ใช่หรือไม่?\n⚠️ การลบอาจทำให้ข้อมูลประวัติ OT ของคนนี้หายไปด้วยนะคะ ไนท์แนะนำให้ใช้วิธี 'ปิดสถานะการใช้งาน' แทนค่ะ`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('users').delete().eq('id', id);
        loadUsersData();
        Swal.fire('สำเร็จ', 'ลบข้อมูลสำเร็จค๊าา', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'ลบไม่สำเร็จค่ะ ติดข้อมูลที่ผูกไว้', 'error'); }
}

// ===================================================
// ระบบจัดการหน่วยงาน (Page 7)
// ===================================================
async function loadAgenciesData() {
    try {
        const { data: agencies, error } = await supabaseClient.from('agency').select('*').order('id', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("agenciesTableBody");
        tbody.innerHTML = "";

        if (!agencies || agencies.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูลหน่วยงานค่ะ</td></tr>`;
            return;
        }

        agencies.forEach(a => {
            const agencyName = a.name || a.agency_name || a.description || '-'; 
            
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-700">${a.id}</td>
                    <td class="p-4 text-slate-600 font-medium">${agencyName}</td>
                    <td class="p-4 text-center">
                        <button onclick="openAgencyModal('${a.id}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1" title="แก้ไข"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteAgencyData('${a.id}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="ลบ"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load Agencies Error:", err); }
}

async function openAgencyModal(id = null) {
    document.getElementById("agencyFormModal").classList.remove("hidden");
    const title = document.getElementById("agencyModalTitle");
    
    document.getElementById("formAgencyOldId").value = "";
    document.getElementById("formAgencyId").value = "";
    document.getElementById("formAgencyName").value = "";

    if (id) {
        title.innerHTML = "<i class='bx bx-edit mr-2'></i>แก้ไขหน่วยงาน";
        try {
            const { data } = await supabaseClient.from('agency').select('*').eq('id', id).single();
            if (data) {
                document.getElementById("formAgencyOldId").value = data.id;
                document.getElementById("formAgencyId").value = data.id;
                document.getElementById("formAgencyName").value = data.name || data.agency_name || data.description || "";
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-buildings mr-2'></i>เพิ่มหน่วยงานใหม่";
    }
}

function closeAgencyModal() { document.getElementById("agencyFormModal").classList.add("hidden"); }

async function saveAgencyData() {
    const oldId = document.getElementById("formAgencyOldId").value;
    const newId = document.getElementById("formAgencyId").value.trim();
    const newName = document.getElementById("formAgencyName").value.trim();

    if (!newId || !newName) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกรหัสและชื่อหน่วยงานให้ครบนะคะ', 'warning');
        return;
    }

    const payload = { id: newId, name: newName }; 

    try {
        if (oldId) await supabaseClient.from('agency').update(payload).eq('id', oldId);
        else await supabaseClient.from('agency').insert([payload]);
        
        closeAgencyModal();
        loadAgenciesData();
        Swal.fire('สำเร็จ!', 'บันทึกข้อมูลหน่วยงานเรียบร้อยค่ะ ✨', 'success');
    } catch (err) { 
        Swal.fire('ข้อผิดพลาด', 'บันทึกไม่สำเร็จ รหัสอาจจะซ้ำกันค่ะ!', 'error'); 
        console.error(err); 
    }
}

async function deleteAgencyData(id) { // เปลี่ยนชื่อฟังก์ชันและพารามิเตอร์ตามของเดิม
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบข้อมูลรหัส ${id} ใช่หรือไม่?`, // แก้ไขข้อความตามความเหมาะสม
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('agency').delete().eq('id', id); // แก้ชื่อ table ตามฟังก์ชันนั้นๆ
        loadAgenciesData(); // เรียกใช้โหลดใหม่ให้ถูกฟังก์ชัน
        
        Swal.fire('สำเร็จ', 'ลบข้อมูลสำเร็จค๊าา', 'success');
    } catch (err) {
        Swal.fire('ลบไม่ได้', 'ลบไม่สำเร็จค่ะ อาจมีข้อมูลอื่นผูกอยู่', 'error');
    }
}

// ===================================================
// ระบบจัดการฝ่าย (Page 8)
// ===================================================
async function loadDepartmentsData() {
    try {
        const { data: depts, error } = await supabaseClient.from('departments').select('*').order('id', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("deptsTableBody");
        tbody.innerHTML = "";

        if (!depts || depts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูลฝ่ายค่ะ</td></tr>`;
            return;
        }

        depts.forEach(d => {
            const deptName = d.name || d.department_name || '-'; 
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-700">${d.id}</td>
                    <td class="p-4 text-slate-600 font-medium">${deptName}</td>
                    <td class="p-4 text-center">
                        <button onclick="openDeptModal('${d.id}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteDeptData('${d.id}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load Departments Error:", err); }
}

async function openDeptModal(id = null) {
    document.getElementById("deptFormModal").classList.remove("hidden");
    const title = document.getElementById("deptModalTitle");
    
    document.getElementById("formDeptOldId").value = "";
    document.getElementById("formDeptId").value = "";
    document.getElementById("formDeptName").value = "";

    if (id) {
        title.innerHTML = "<i class='bx bx-edit mr-2'></i>แก้ไขฝ่าย";
        try {
            const { data } = await supabaseClient.from('departments').select('*').eq('id', id).single();
            if (data) {
                document.getElementById("formDeptOldId").value = data.id;
                document.getElementById("formDeptId").value = data.id;
                document.getElementById("formDeptName").value = data.name || data.department_name || "";
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-group mr-2'></i>เพิ่มฝ่ายใหม่";
    }
}

function closeDeptModal() { document.getElementById("deptFormModal").classList.add("hidden"); }

async function saveDeptData() {
    const oldId = document.getElementById("formDeptOldId").value;
    const newId = document.getElementById("formDeptId").value.trim();
    const newName = document.getElementById("formDeptName").value.trim();

    if (!newId || !newName) { Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลให้ครบนะคะ', 'warning'); return; }

    const payload = { id: newId, name: newName }; 

    try {
        if (oldId) await supabaseClient.from('departments').update(payload).eq('id', oldId);
        else await supabaseClient.from('departments').insert([payload]);
        
        closeDeptModal();
        loadDepartmentsData();
        Swal.fire('สำเร็จ!', 'บันทึกข้อมูลฝ่ายเรียบร้อยค่ะ ✨', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!', 'error'); console.error(err); }
}

async function deleteDeptData(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบฝ่ายรหัส ${id} ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('departments').delete().eq('id', id);
        loadDepartmentsData();
        Swal.fire('สำเร็จ', 'ลบข้อมูลฝ่ายเรียบร้อยค่ะ', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'ลบไม่สำเร็จค่ะ', 'error'); }
}

// ===================================================
// ระบบจัดการวันหยุด (Page 11)
// ===================================================
async function loadHolidaysData() {
    try {
        const { data: holidays, error } = await supabaseClient.from('holidays').select('*').order('id', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("holidaysTableBody");
        tbody.innerHTML = "";

        if (!holidays || holidays.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูลวันหยุดค่ะ</td></tr>`;
            return;
        }

        holidays.forEach(h => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-700">${h.id}</td>
                    <td class="holiday-date p-4 text-center text-rose-600 font-semibold">${h.holiday_date}</td>
                    <td class="p-4 text-slate-600 font-medium">${h.description || '-'}</td>
                    <td class="p-4 text-center">
                        <button onclick="openHolidayModal('${h.id}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1" title="แก้ไข"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteHolidayData('${h.id}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="ลบ"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load Holidays Error:", err); }
}

async function openHolidayModal(id = null) {
    document.getElementById("holidayFormModal").classList.remove("hidden");
    const title = document.getElementById("holidayModalTitle");
    
    document.getElementById("formHolOldId").value = "";
    document.getElementById("formHolId").value = "";
    document.getElementById("formHolDate").value = "";
    document.getElementById("formHolDesc").value = "";

    if (id) {
        title.innerHTML = "<i class='bx bx-edit mr-2'></i>แก้ไขวันหยุด";
        try {
            const { data } = await supabaseClient.from('holidays').select('*').eq('id', id).single();
            if (data) {
                document.getElementById("formHolOldId").value = data.id;
                document.getElementById("formHolId").value = data.id;
                document.getElementById("formHolDate").value = data.holiday_date;
                document.getElementById("formHolDesc").value = data.description;
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-calendar-star mr-2'></i>เพิ่มวันหยุดใหม่";
    }
}

function closeHolidayModal() { document.getElementById("holidayFormModal").classList.add("hidden"); }

async function saveHolidayData() {
    const oldId = document.getElementById("formHolOldId").value;
    const newId = document.getElementById("formHolId").value.trim();
    const newDate = document.getElementById("formHolDate").value.trim();
    const newDesc = document.getElementById("formHolDesc").value.trim();

    if (!newId || !newDate || !newDesc) { Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลให้ครบถ้วนนะคะ', 'warning'); return; }

    const payload = { 
        id: newId, 
        holiday_date: newDate,
        description: newDesc
    }; 

    try {
        if (oldId) await supabaseClient.from('holidays').update(payload).eq('id', oldId);
        else await supabaseClient.from('holidays').insert([payload]);
        
        closeHolidayModal();
        loadHolidaysData();
        Swal.fire('สำเร็จ!', 'บันทึกข้อมูลวันหยุดเรียบร้อยค่ะ ✨', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!', 'error'); console.error(err); }
}

async function deleteHolidayData(id) { // เปลี่ยนชื่อฟังก์ชันและพารามิเตอร์ตามของเดิม
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบวันหยุดรหัส ${id} ใช่หรือไม่?`, // แก้ไขข้อความตามความเหมาะสม
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('holidays').delete().eq('id', id); // แก้ชื่อ table ตามฟังก์ชันนั้นๆ
        loadHolidaysData(); // เรียกใช้โหลดใหม่ให้ถูกฟังก์ชัน
        
        Swal.fire('สำเร็จ', 'ลบข้อมูลสำเร็จค๊าา', 'success');
    } catch (err) {
        Swal.fire('ลบไม่ได้', 'ลบไม่สำเร็จค่ะ อาจมีข้อมูลอื่นผูกอยู่', 'error');
    }
}

// ===================================================
// ระบบจัดการเมนูบนมือถือ (Mobile Responsive)
// ===================================================
function toggleMobileMenu() {
    const sidebar = document.getElementById("mainSidebar");
    const backdrop = document.getElementById("sidebarBackdrop");
    
    if (sidebar.classList.contains("-translate-x-full")) {
        sidebar.classList.remove("-translate-x-full");
        backdrop.classList.remove("hidden");
    } else {
        sidebar.classList.add("-translate-x-full");
        backdrop.classList.add("hidden");
    }
}

// ===================================================
// ระบบจัดการเวลาโอที (Page 9)
// ===================================================
async function loadOTTypesData() {
    try {
        const { data: otTypes, error } = await supabaseClient.from('ot_types').select('*').order('id', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("otTypesTableBody");
        tbody.innerHTML = "";

        if (!otTypes || otTypes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูลเวลาโอทีค่ะ</td></tr>`;
            return;
        }

        otTypes.forEach(ot => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-700">${ot.id}</td>
                    <td class="p-4 text-center text-slate-600 font-medium">${ot.start_time}</td>
                    <td class="p-4 text-center text-slate-600 font-medium">${ot.end_time}</td>
                    <td class="p-4 text-center">
                        <span class="report-rate-badge bg-orange-100 text-orange-600 font-bold px-3 py-1 rounded-full text-xs border border-transparent">${ot.rate} เท่า</span>
                    </td>
                    <td class="p-4 text-center">
                        <button onclick="openOTTypeModal('${ot.id}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1" title="แก้ไข"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteOTTypeData('${ot.id}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="ลบ"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load OT Types Error:", err); }
}

async function openOTTypeModal(id = null) {
    document.getElementById("otTypeFormModal").classList.remove("hidden");
    const title = document.getElementById("otTypeModalTitle");
    
    document.getElementById("formOtOldId").value = "";
    document.getElementById("formOtId").value = "";
    document.getElementById("formOtStart").value = "";
    document.getElementById("formOtEnd").value = "";
    document.getElementById("formOtRate").value = "";

    if (id) {
        title.innerHTML = "<i class='bx bx-edit mr-2'></i>แก้ไขเวลาโอที";
        try {
            const { data } = await supabaseClient.from('ot_types').select('*').eq('id', id).single();
            if (data) {
                document.getElementById("formOtOldId").value = data.id;
                document.getElementById("formOtId").value = data.id;
                document.getElementById("formOtStart").value = data.start_time;
                document.getElementById("formOtEnd").value = data.end_time;
                document.getElementById("formOtRate").value = data.rate;
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-time-five mr-2'></i>เพิ่มเวลาโอทีใหม่";
    }
}

function closeOTTypeModal() { document.getElementById("otTypeFormModal").classList.add("hidden"); }

async function saveOTTypeData() {
    const oldId = document.getElementById("formOtOldId").value;
    const newId = document.getElementById("formOtId").value.trim();
    const start = document.getElementById("formOtStart").value;
    const end = document.getElementById("formOtEnd").value;
    const rate = document.getElementById("formOtRate").value;

    if (!newId || !start || !end || !rate) { Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลให้ครบถ้วนนะคะ', 'warning'); return; }

    const payload = { 
        id: newId, 
        start_time: start,
        end_time: end,
        rate: parseFloat(rate)
    }; 

    try {
        if (oldId) await supabaseClient.from('ot_types').update(payload).eq('id', oldId);
        else await supabaseClient.from('ot_types').insert([payload]);
        
        closeOTTypeModal();
        loadOTTypesData();
        Swal.fire('สำเร็จ!', 'บันทึกข้อมูลเวลาโอทีเรียบร้อยค่ะ ✨', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!', 'error'); console.error(err); }
}

async function deleteOTTypeData(id) { // เปลี่ยนชื่อฟังก์ชันและพารามิเตอร์ตามของเดิม
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบเวลาโอทีรหัส ${id} ใช่หรือไม่?\n⚠️ ระวัง: หากลบ อาจส่งผลกระทบต่อรายการคำขอโอทีเก่าที่เคยเลือกเวลานี้ไว้นะคะ`, // แก้ไขข้อความตามความเหมาะสม
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('ot_types').delete().eq('id', id); // แก้ชื่อ table ตามฟังก์ชันนั้นๆ
        loadOTTypesData(); // เรียกใช้โหลดใหม่ให้ถูกฟังก์ชัน
        
        Swal.fire('สำเร็จ', 'ลบข้อมูลสำเร็จค๊าา', 'success');
    } catch (err) {
        Swal.fire('ลบไม่ได้', 'ลบไม่สำเร็จค่ะ อาจมีข้อมูลอื่นผูกอยู่', 'error');
    }
}

// ===================================================
// ระบบจัดการวันทำงาน (Page 12)
// ===================================================
async function loadWorkdaysData() {
    try {
        const { data: workdays, error } = await supabaseClient.from('day_of_week').select('*').order('day_number', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("workdaysTableBody");
        tbody.innerHTML = "";

        if (!workdays || workdays.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">ยังไม่มีข้อมูลวันทำงานค่ะ</td></tr>`;
            return;
        }

        workdays.forEach(wd => {
            const workingBadge = wd.is_working 
                ? '<span class="dashboard-status-approved px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-600 border border-transparent"><i class="bx bx-check-circle mr-1"></i>วันทำงาน</span>'
                : '<span class="dashboard-status-rejected px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-600 border border-transparent"><i class="bx bx-x-circle mr-1"></i>วันหยุด</span>';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-400">${wd.day_number}</td>
                    <td class="p-4 text-slate-700 font-bold">${wd.day_name}</td>
                    <td class="p-4 text-center">${workingBadge}</td>
                    <td class="p-4 text-center">
                        <button onclick="openWorkdayModal('${wd.day_name}')" class="dashboard-action-btn dashboard-btn-orange w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1" title="แก้ไข"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteWorkdayData('${wd.day_name}')" class="dashboard-action-btn dashboard-btn-red w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="ลบ"><i class='bx bx-trash text-sm'></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (err) { console.error("Load Workdays Error:", err); }
}

async function openWorkdayModal(dayName = null) {
    document.getElementById("workdayFormModal").classList.remove("hidden");
    const title = document.getElementById("workdayModalTitle");
    
    document.getElementById("formWdOldName").value = "";
    document.getElementById("formWdName").value = "";
    document.getElementById("formWdNumber").value = "";
    document.getElementById("formWdIsWorking").checked = true;

    if (dayName) {
        title.innerHTML = "<i class='bx bx-edit mr-2'></i>แก้ไขวันทำงาน";
        try {
            const { data } = await supabaseClient.from('day_of_week').select('*').eq('day_name', dayName).single();
            if (data) {
                document.getElementById("formWdOldName").value = data.day_name;
                document.getElementById("formWdName").value = data.day_name;
                document.getElementById("formWdNumber").value = data.day_number;
                document.getElementById("formWdIsWorking").checked = data.is_working;
            }
        } catch (err) { console.error(err); }
    } else {
        title.innerHTML = "<i class='bx bxs-calendar-check mr-2'></i>เพิ่มวันทำงาน";
    }
}

function closeWorkdayModal() { document.getElementById("workdayFormModal").classList.add("hidden"); }

async function saveWorkdayData() {
    const oldName = document.getElementById("formWdOldName").value;
    const newName = document.getElementById("formWdName").value.trim();
    const dayNum = document.getElementById("formWdNumber").value;
    const isWorking = document.getElementById("formWdIsWorking").checked;

    if (!newName || !dayNum) { Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลให้ครบนะคะ', 'warning'); return; }

    const payload = { 
        day_name: newName, 
        day_number: parseInt(dayNum),
        is_working: isWorking
    }; 

    try {
        if (oldName) {
            await supabaseClient.from('day_of_week').update(payload).eq('day_name', oldName);
        } else {
            await supabaseClient.from('day_of_week').insert([payload]);
        }
        
        closeWorkdayModal();
        loadWorkdaysData();
        Swal.fire('สำเร็จ!', 'บันทึกข้อมูลสำเร็จค่ะ ✨', 'success');
    } catch (err) { Swal.fire('ข้อผิดพลาด', 'บันทึกไม่สำเร็จค่ะ อาจมีชื่อซ้ำกัน!', 'error'); console.error(err); }
}

async function deleteWorkdayData(dayName) { // เปลี่ยนชื่อฟังก์ชันและพารามิเตอร์ตามของเดิม
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: `ต้องการลบข้อมูลวัน "${dayName}" ใช่หรือไม่?`, // แก้ไขข้อความตามความเหมาะสม
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ใช่, ลบเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    try {
        await supabaseClient.from('day_of_week').delete().eq('day_name', dayName); // แก้ชื่อ table ตามฟังก์ชันนั้นๆ
        loadWorkdaysData(); // เรียกใช้โหลดใหม่ให้ถูกฟังก์ชัน
        
        Swal.fire('สำเร็จ', 'ลบข้อมูลสำเร็จค๊าา', 'success');
    } catch (err) {
        Swal.fire('ลบไม่ได้', 'ลบไม่สำเร็จค่ะ อาจมีข้อมูลอื่นผูกอยู่', 'error');
    }
}

// ===================================================
// ระบบตั้งค่าระบบพื้นฐาน (Page 13)
// ===================================================
async function loadSystemSettings() {
    try {
        const { data, error } = await supabaseClient.from('system_settings').select('*').limit(1).single();
        
        if (data) {
            document.getElementById("settingRecordId").value = data.id;
            document.getElementById("setSystemName").value = data.system_name || '';
            document.getElementById("setCompanyName").value = data.company_name || '';
            document.getElementById("setLineToken").value = data.line_token || '';
        }
    } catch (err) {
        console.warn("ยังไม่มีตาราง system_settings หรือไม่มีข้อมูล", err);
    }
}

async function saveSystemSettings() {
    const id = document.getElementById("settingRecordId").value;
    const sysName = document.getElementById("setSystemName").value.trim();
    const compName = document.getElementById("setCompanyName").value.trim();
    const token = document.getElementById("setLineToken").value.trim();

    if (!sysName) {
        Swal.fire('ข้อมูลไม่ครบ', 'อย่าลืมใส่ชื่อระบบนะคะ 🥺', 'warning');
        return;
    }

    const payload = {
        system_name: sysName,
        company_name: compName,
        line_token: token
    };

    try {
        if (id) {
            await supabaseClient.from('system_settings').update(payload).eq('id', id);
        } else {
            await supabaseClient.from('system_settings').insert([payload]);
            loadSystemSettings();
        }
        
        Swal.fire('สำเร็จ!', '💾 บันทึกการตั้งค่าระบบเรียบร้อยแล้วค๊าา!', 'success');
        
        if (document.querySelector(".font-bold.text-lg.text-slate-800")) {
            document.querySelector(".font-bold.text-lg.text-slate-800").innerText = sysName;
        }

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกค่ะ กรุณาเช็คว่ามีตาราง system_settings หรือยังนะคะ', 'error');
        console.error("Save Settings Error:", err);
    }
}

// ===================================================
// ระบบรายงาน (Page 5) - Report & Export to XLSX 🌟
// ===================================================
let allReportData = []; 
let currentFilteredReportData = []; 
const REPORT_MAX_RANGE_DAYS = 90;
const REPORT_QUERY_TIMEOUT_MS = 20000;
let reportPageInitialized = false;
let reportIsLoading = false;
let reportSearchToken = 0;
let reportDepartments = [];

function formatReportDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function setReportSummary(total = 0, approved = 0, hours = 0) {
    document.getElementById("reportTotalReq").innerText = total;
    document.getElementById("reportTotalApproved").innerText = approved;
    document.getElementById("reportTotalHours").innerText = Number(hours || 0).toFixed(2);
}

function setReportTableMessage(message, colorClass = "text-slate-400") {
    const tbody = document.getElementById("reportsTableBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="12" class="p-10 text-center ${colorClass}">${message}</td></tr>`;
}

function setReportLoading(isLoading) {
    reportIsLoading = isLoading;
    const button = document.getElementById("reportSearchBtn");

    if (button) {
        button.innerHTML = isLoading
            ? "<i class='bx bx-loader-alt bx-spin text-lg mr-2'></i> กำลังค้นหา..."
            : "<i class='bx bx-search text-lg mr-2'></i> ค้นหา";
    }

    validateReportFilters();
}

function validateReportFilters(showMessage = false) {
    const startValue = document.getElementById("reportStartDate")?.value || "";
    const endValue = document.getElementById("reportEndDate")?.value || "";
    const messageElement = document.getElementById("reportValidationMessage");
    const searchButton = document.getElementById("reportSearchBtn");
    let message = "";

    if (!startValue || !endValue) {
        message = "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบค่ะ";
    } else {
        const startDate = new Date(`${startValue}T00:00:00Z`);
        const endDate = new Date(`${endValue}T00:00:00Z`);

        if (endDate < startDate) {
            message = "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้นค่ะ";
        } else {
            const rangeDays = Math.floor((endDate - startDate) / 86400000) + 1;
            if (rangeDays > REPORT_MAX_RANGE_DAYS) {
                message = `ช่วงวันที่ต้องไม่เกิน ${REPORT_MAX_RANGE_DAYS} วันค่ะ`;
            }
        }
    }

    if (messageElement) {
        messageElement.textContent = message;
        messageElement.classList.toggle("hidden", !message || !showMessage);
    }

    if (searchButton) searchButton.disabled = Boolean(message) || reportIsLoading;

    return {
        valid: !message,
        message,
        startDate: startValue,
        endDate: endValue
    };
}

function filterReports() {
    reportSearchToken++;
    allReportData = [];
    currentFilteredReportData = [];

    if (reportIsLoading) setReportLoading(false);
    setReportSummary();
    setReportTableMessage("ปรับเงื่อนไขแล้ว กรุณากดปุ่ม “ค้นหา” เพื่อแสดงรายงานค่ะ 🔎");
    validateReportFilters(true);
}

async function withReportTimeout(promise, timeoutMs = REPORT_QUERY_TIMEOUT_MS) {
    let timeoutId;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("Report query timeout")), timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function loadReportDepartments() {
    const deptSelect = document.getElementById("reportDept");
    if (!deptSelect) return;

    const selectedValue = deptSelect.value;

    try {
        const { data, error } = await supabaseClient
            .from('departments')
            .select('id, name')
            .order('id', { ascending: true });

        if (error) throw error;
        reportDepartments = data || [];
        deptSelect.innerHTML = '<option value="">ทั้งหมด (All)</option>';

        reportDepartments.forEach(dept => {
            const option = document.createElement("option");
            option.value = dept.id;
            option.textContent = dept.name || dept.id;
            deptSelect.appendChild(option);
        });

        if (selectedValue && reportDepartments.some(dept => dept.id === selectedValue)) {
            deptSelect.value = selectedValue;
        }
    } catch (err) {
        console.error("Load Report Departments Error:", err);
    }
}

function initializeReportsPage() {
    const today = new Date();
    const startInput = document.getElementById("reportStartDate");
    const endInput = document.getElementById("reportEndDate");

    if (!startInput || !endInput) return;

    if (!startInput.value) {
        startInput.value = formatReportDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }
    if (!endInput.value) {
        endInput.value = formatReportDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    }

    if (!reportPageInitialized) {
        reportPageInitialized = true;
        setReportSummary();
        setReportTableMessage("กรุณากำหนดเงื่อนไข แล้วกดปุ่ม “ค้นหา” เพื่อแสดงรายงานค่ะ 🔎");
    }

    validateReportFilters();
    loadReportDepartments();
}

async function loadReportsData() {
    if (reportIsLoading) return;

    const validation = validateReportFilters(true);
    if (!validation.valid) return;

    const filterDept = document.getElementById("reportDept").value;
    const filterStatus = document.getElementById("reportStatus").value;
    const filterSearch = document.getElementById("reportSearch").value.trim();
    const requestToken = ++reportSearchToken;

    setReportLoading(true);
    setReportSummary();
    setReportTableMessage("<i class='bx bx-loader-alt bx-spin text-3xl text-blue-500'></i><p class='mt-2'>กำลังค้นหาข้อมูลรายงาน...</p>");

    try {
        let requestQuery = supabaseClient
            .from('ot_requests')
            .select('id, user_id, ot_type_id, date_start, description, status')
            .gte('date_start', validation.startDate)
            .lte('date_start', validation.endDate)
            .order('date_start', { ascending: false });

        if (filterStatus) requestQuery = requestQuery.eq('status', filterStatus);

        let userQuery = supabaseClient
            .from('users')
            .select('id, fullname, employee_id, department, agency, avatar_url');

        if (filterDept) userQuery = userQuery.eq('department', filterDept);

        const departmentPromise = reportDepartments.length > 0
            ? Promise.resolve({ data: reportDepartments, error: null })
            : supabaseClient.from('departments').select('id, name');

        const [reqRes, userRes, typeRes, deptRes] = await withReportTimeout(Promise.all([
            requestQuery,
            userQuery,
            supabaseClient.from('ot_types').select('id, start_time, end_time, rate'),
            departmentPromise
        ]));

        if (requestToken !== reportSearchToken) return;
        if (reqRes.error) throw reqRes.error;
        if (userRes.error) throw userRes.error;
        if (typeRes.error) throw typeRes.error;
        if (deptRes.error) throw deptRes.error;

        const reqs = reqRes.data || [];
        const users = userRes.data || [];
        const otTypes = typeRes.data || [];
        const depts = deptRes.data || [];
        const userMap = new Map(users.map(user => [user.id, user]));
        const typeMap = new Map(otTypes.map(type => [type.id, type]));
        const deptMap = new Map(depts.map(dept => [dept.id, dept]));
        const restrictByDepartment = Boolean(filterDept);
        const normalizedSearch = filterSearch.toLocaleLowerCase('th-TH');

        allReportData = reqs
            .filter(req => !restrictByDepartment || userMap.has(req.user_id))
            .map(req => {
                const user = userMap.get(req.user_id) || {};
                const otType = typeMap.get(req.ot_type_id) || {};
                const department = deptMap.get(user.department) || {};
                const hours = otType.start_time && otType.end_time
                    ? parseFloat(calculateOTHours(otType.start_time, otType.end_time))
                    : 0;

                return {
                    ...req,
                    fullname: user.fullname || req.user_id || '-',
                    employee_id: user.employee_id ?? '-',
                    avatar_url: user.avatar_url || '',
                    agency_name: AGENCY_NAME_MAP[user.agency] || user.agency || '-',
                    department_id: user.department || '-',
                    department_name: department.name || user.department || '-',
                    time_range: otType.start_time ? `${otType.start_time} - ${otType.end_time}` : '-',
                    rate: otType.rate ? `${otType.rate} เท่า` : '-',
                    hours,
                    description: req.description || '-'
                };
            })
            .filter(reportRow => {
                if (!normalizedSearch) return true;

                const searchableFields = [
                    reportRow.fullname,
                    reportRow.employee_id,
                    reportRow.agency_name,
                    reportRow.department_name
                ];
                return searchableFields.some(value =>
                    String(value || '').toLocaleLowerCase('th-TH').includes(normalizedSearch)
                );
            });

        currentFilteredReportData = [...allReportData];
        renderReportsTable(currentFilteredReportData);
    } catch (err) {
        if (requestToken !== reportSearchToken) return;
        allReportData = [];
        currentFilteredReportData = [];
        setReportSummary();
        setReportTableMessage("โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วกดค้นหาอีกครั้งค่ะ", "text-red-500");
        console.error("Load Reports Error:", err);
    } finally {
        if (requestToken === reportSearchToken) setReportLoading(false);
    }
}

function renderReportsTable(data) {
    const tbody = document.getElementById("reportsTableBody");
    let totalApproved = 0;
    let totalHours = 0;

    if (data.length === 0) {
        setReportTableMessage("ไม่พบข้อมูลตามเงื่อนไขที่ค้นหาค่ะ 🍃");
    } else {
        const rowsHTML = data.map(req => {
            if (req.status === 'Approved') {
                totalApproved++;
                totalHours += req.hours;
            }

            let badgeHTML = '';
            if (req.status === 'Approved') badgeHTML = '<span class="dashboard-status-approved px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-600">อนุมัติแล้ว</span>';
            else if (req.status === 'Rejected') badgeHTML = '<span class="dashboard-status-rejected px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600">ไม่อนุมัติ</span>';
            else badgeHTML = '<span class="dashboard-status-pending px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600">รอพิจารณา</span>';

            let showDate = req.date_start;
            if(showDate && showDate.includes('-')) {
                const d = showDate.split('-');
                showDate = `${d[2]}/${d[1]}/${d[0]}`; 
            }
            
            return `
                <tr class="report-table-row hover:bg-slate-50 transition-colors">
                    <td class="p-3 text-center text-slate-600">${showDate}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${req.id}</td>
                    <td class="p-3">
                        <div class="flex items-center space-x-2">
                            <div class="w-10 h-10 lg:w-14 lg:h-14 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-300 shadow-sm">
                                <img src="${getAvatarUrl(req.fullname, req.avatar_url)}" loading="lazy" decoding="async" class="w-full h-full object-cover object-top">
                            </div>
                            <span class="font-semibold text-slate-800 whitespace-nowrap">${req.fullname}</span>
                        </div>
                    </td>
                    <td class="p-3 text-center font-bold text-slate-700 whitespace-nowrap">${req.employee_id}</td>
                    <td class="p-3 text-center text-slate-600 text-[11px] whitespace-nowrap">${req.agency_name}</td>
                    <td class="p-3 text-center text-slate-500 text-[11px] whitespace-nowrap">${req.department_name}</td>
                    <td class="p-3 text-center text-slate-600 text-xs truncate max-w-[120px]" title="${req.description}">${req.description}</td>
                    <td class="p-3 text-center text-slate-600 text-xs font-medium whitespace-nowrap">${req.time_range}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <span class="report-rate-badge bg-orange-100 text-orange-600 font-bold px-2.5 py-1 rounded-full text-[10px] border border-orange-200">${req.rate}</span>
                    </td>
                    <td class="p-3 text-center font-bold text-blue-600">${req.hours.toFixed(2)}</td>
                    <td class="p-3 text-center">${badgeHTML}</td>
                    <td class="p-3 text-center">
                        <button onclick="openOTDetailModal('${req.id}')" class="dashboard-action-btn dashboard-btn-blue w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm mx-auto" title="ดูรายละเอียด">
                            <i class='bx bx-show text-lg'></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

        tbody.innerHTML = rowsHTML;
    }

    setReportSummary(data.length, totalApproved, totalHours);
}

function exportToExcel() {
    if (currentFilteredReportData.length === 0) {
        Swal.fire('ไม่มีข้อมูล', 'ตอนนี้ไม่มีข้อมูลให้ Export ค่ะ ลองปรับการค้นหาดูนะคะ 😅', 'warning');
        return;
    }

    // ✨ เพิ่ม (req, index) เพื่อดึงลำดับแถวมาใช้ ✨
    const exportData = currentFilteredReportData.map((req, index) => {
        let statusThai = 'รอพิจารณา';
        if (req.status === 'Approved') statusThai = 'อนุมัติแล้ว';
        if (req.status === 'Rejected') statusThai = 'ไม่อนุมัติ';

        let showDate = req.date_start;
        if(showDate && showDate.includes('-')) {
            const d = showDate.split('-');
            showDate = `${d[2]}/${d[1]}/${d[0]}`; 
        }

        return {
            "ลำดับ": index + 1, // ✨ รันเลข 1, 2, 3...
            "วันที่ทำ OT": showDate,
            "รหัสคำขอ": req.id,
            "ชื่อพนักงาน": req.fullname,
            "รหัสพนักงาน": req.employee_id,
            "หน่วยงาน": req.agency_name, // ✨ เพิ่มคอลัมน์หน่วยงาน
            "ฝ่าย": req.department_name,
            "เหตุผล": req.description, 
            "ช่วงเวลา": req.time_range,
            "ประเภทโอที": req.rate, // ✨ เพิ่มคอลัมน์ประเภท
            "จำนวนชั่วโมง": req.hours,
            "สถานะ": statusThai
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "OT_Report");

    const start = document.getElementById("reportStartDate").value || "All";
    const end = document.getElementById("reportEndDate").value || "All";
    const fileName = `OT_Report_${start}_to_${end}.xlsx`;

    XLSX.writeFile(workbook, fileName);
}
// ===================================================
// ฟังก์ชัน Dark Mode และ เปิด-ปิดตา รหัสผ่าน 🌙✨
// ===================================================

// ฟังก์ชันสลับโหมด
function toggleDarkMode() {
    const htmlClasses = document.documentElement.classList;
    if (htmlClasses.contains('dark')) {
        htmlClasses.remove('dark');
        localStorage.setItem('theme', 'light');
        updateDarkModeKnob(false);
    } else {
        htmlClasses.add('dark');
        localStorage.setItem('theme', 'dark');
        updateDarkModeKnob(true);
    }
}

// อัปเดตหน้าตาปุ่มสวิตช์ (อัปเดตให้รองรับทั้ง 2 ปุ่ม)
function updateDarkModeKnob(isDark) {
    const knob1 = document.getElementById('darkModeKnob');
    const icon1 = document.getElementById('darkModeIcon');
    const knob2 = document.getElementById('darkModeKnob2');
    const icon2 = document.getElementById('darkModeIcon2');
    
    if (isDark) {
        if(knob1) { knob1.style.transform = 'translateX(24px)'; icon1.className = 'bx bx-moon text-[10px] text-blue-500'; }
        if(knob2) { knob2.style.transform = 'translateX(24px)'; icon2.className = 'bx bx-moon text-[10px] text-blue-500'; }
    } else {
        if(knob1) { knob1.style.transform = 'translateX(0)'; icon1.className = 'bx bx-sun text-[10px] text-amber-500'; }
        if(knob2) { knob2.style.transform = 'translateX(0)'; icon2.className = 'bx bx-sun text-[10px] text-amber-500'; }
    }
}

// ตรวจสอบโหมดตอนเปิดเว็บครั้งแรก
document.addEventListener('DOMContentLoaded', () => {
    // (โค้ดฟังก์ชัน Dark Mode เดิมของพี่ต้นปล่อยไว้เหมือนเดิมนะคะ) ...

    // ✨ โค้ดเพิ่มใหม่: เช็คว่ามีการจำล็อกอินไว้ไหม ถ้าระบบจำไว้ ให้พาเข้าสู่ระบบเลยแบบไม่ต้องกรอกรหัส!
    const savedSession = localStorage.getItem('oms_user_session');
    if (savedSession) {
        const data = JSON.parse(savedSession);
        currentUser = data;
        
        // จัดการแสดงผลข้อมูล User บน Header
        document.getElementById("headerFullname").innerText = data.fullname;
        document.getElementById("headerRole").innerText = getUserOrganizationLabel(data);
        
        // อัปเดตรูปโปรไฟล์มุมขวา
        const avatarCircle = document.getElementById("userAvatarCircle");
        avatarCircle.classList.add("overflow-hidden"); 
        if(data.avatar_url) {
            avatarCircle.innerHTML = `<img src="${data.avatar_url}" class="w-full h-full object-cover">`;
        } else {
            avatarCircle.innerHTML = data.fullname.charAt(0);
        }

        // จัดการเมนูต่างๆ ตามสิทธิ์
        const adminMenu = document.getElementById("adminMenuSection");
        const menuTab2 = document.getElementById("menuTab2"); 
        const menuTab5 = document.getElementById("menuTab5"); 

        if (adminMenu) adminMenu.style.display = (data.role === 'SuperAdmin') ? "block" : "none";
        if (data.role === 'User') {
            if (menuTab2) menuTab2.style.display = "none";
            if (menuTab5) menuTab5.style.display = "none";
        } else {
            if (menuTab2) menuTab2.style.display = "flex";
            if (menuTab5) menuTab5.style.display = "flex";
        }

        // ปิดหน้าล็อกอิน เปิดหน้า Dashboard
        document.getElementById("pageformLogin").style.display = "none";
        document.getElementById("dashboardPage").style.display = "block";
        changePage(1);
    }
});

// ฟังก์ชันเปิด-ปิดตารหัสผ่าน
function togglePasswordVisibility() {
    const pwdInput = document.getElementById('loginpassword');
    const eyeIcon = document.getElementById('eyeIcon');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeIcon.classList.remove('bx-show');
        eyeIcon.classList.add('bx-hide');
    } else {
        pwdInput.type = 'password';
        eyeIcon.classList.remove('bx-hide');
        eyeIcon.classList.add('bx-show');
    }
}
