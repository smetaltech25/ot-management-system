// ===================================================
// app.js - ไฟล์ควบคุมระบบ OverTime Management System (Supabase)
// ฉบับเต็มเวอร์ชันสมบูรณ์ (อัปเดตล่าสุด) จัดทำโดย ไนท์ เพื่อพี่ต้นค่ะ 💖
// ===================================================

let currentUser = null;
let myOtBarChartInstance = null;
let myOtDoughnutChartInstance = null;
let finalSelectedApprovers = []; 
let tempSelectedApprovers = [];  

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
        alert("กรอกข้อมูลให้ครบถ้วน 😤");
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
            alert("⚠️ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีอาจจะยังไม่เปิดใช้งานค่ะ");
            return;
        }

        currentUser = data;
        
        document.getElementById("headerFullname").innerText = data.fullname;
        document.getElementById("headerRole").innerText = data.role;
        
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
        alert("อุ๊ย! เกิดข้อผิดพลาดของระบบล็อกอินนิดหน่อยค่ะ ลองใหม่อีกครั้งนะคะ");
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
    if (pageNumber === 5) loadReportsData();
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

    try {
        const { data: requests, error } = await supabaseClient
            .from('ot_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('submit_date', { ascending: false });

        if (error) throw error;

        const { data: otTypes } = await supabaseClient.from('ot_types').select('*');

        // ✨ 1. ดึงข้อมูลสถานะการอนุมัติแต่ละขั้นตอนมาเตรียมไว้เช็ค
        let allSteps = [];
        if (requests && requests.length > 0) {
            const reqIds = requests.map(r => r.id);
            const { data: stepsData } = await supabaseClient.from('approval_steps').select('request_id, status').in('request_id', reqIds);
            if (stepsData) allSteps = stepsData;
        }

        const agencyMap = { 'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending', 'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding', 'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR', 'AGC-015': 'Planning', 'AGC-016': 'Accounting' };
        const deptMap = { 'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี', 'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM' };
        
        const agencyName = agencyMap[currentUser.agency] || currentUser.agency || '-';
        const deptName = deptMap[currentUser.department] || currentUser.department || '-';

        const pendingCount = requests.filter(r => r.status === 'Pending').length;
        const approvedCount = requests.filter(r => r.status === 'Approved').length;
        
        if(document.getElementById("statPendingCount")) document.getElementById("statPendingCount").innerText = pendingCount + " รายการ";
        if(document.getElementById("statApprovedCount")) document.getElementById("statApprovedCount").innerText = approvedCount + " รายการ";
        
        let totalApprovedHours = 0;
        requests.filter(r => r.status === 'Approved').forEach(r => {
            const ot = (otTypes || []).find(t => t.id === r.ot_type_id);
            if(ot) totalApprovedHours += parseFloat(calculateOTHours(ot.start_time, ot.end_time));
        });
        if(document.getElementById("statTotalHours")) document.getElementById("statTotalHours").innerText = totalApprovedHours.toFixed(2) + " ชม."; 

        const tbody = document.getElementById("myOTRequestsTableBody");
        if (!tbody) return; 

        tbody.innerHTML = "";
        const pageInfo = document.getElementById("paginationInfoText");
        const chartSection = document.getElementById("myOTChartsSection"); 

        if (!requests || requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">ยังไม่มีการยื่นคำขอโอทีในระบบในขณะนี้ค่ะ 🍃</td></tr>`;
            if(pageInfo) pageInfo.innerText = `แสดง 0 ถึง 0 จาก 0 แถว`;
            if(chartSection) chartSection.classList.add("hidden"); 
            return;
        }

        const otStats = {};
        const approvedRequests = requests.filter(r => r.status === 'Approved');

        if (approvedRequests.length > 0 && chartSection) {
            chartSection.classList.remove("hidden"); 

            approvedRequests.forEach(row => {
                const otInfo = (otTypes || []).find(t => t.id === row.ot_type_id) || {};
                const labelStr = otInfo.start_time ? `${otInfo.start_time}-${otInfo.end_time} (${otInfo.rate}x)` : row.ot_type_id;
                
                if (!otStats[labelStr]) otStats[labelStr] = 0;
                otStats[labelStr] += 1; 
            });

            const chartLabels = Object.keys(otStats);
            const chartCounts = chartLabels.map(l => otStats[l]);
            
            drawMyOTCharts(chartLabels, chartCounts);
        } else {
            if(chartSection) chartSection.classList.add("hidden");
        }

        if(pageInfo) pageInfo.innerText = `แสดง 1 ถึง ${requests.length} จาก ${requests.length} แถว`;

        requests.forEach(row => {
            const otInfo = (otTypes || []).find(t => t.id === row.ot_type_id) || {};
            const timeStr = otInfo.start_time ? `${otInfo.start_time} - ${otInfo.end_time}` : row.ot_type_id;
            const hrsStr = otInfo.start_time ? `${calculateOTHours(otInfo.start_time, otInfo.end_time)} ชม.` : '-';

            let badgeHTML = '';
            if (row.status === 'Approved') badgeHTML = '<span class="px-3 py-1.5 rounded-full text-[11px] font-bold bg-green-100 text-green-600"><i class="bx bx-check-circle mr-1"></i>อนุมัติ</span>';
            else if (row.status === 'Rejected') badgeHTML = '<span class="px-3 py-1.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600"><i class="bx bx-x-circle mr-1"></i>ไม่อนุมัติ</span>';
            else badgeHTML = '<span class="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-600"><i class="bx bx-time-five mr-1"></i>รออนุมัติ</span>';

            let showDate = row.date_start;
            if(showDate && showDate.includes('-')) {
                const d = showDate.split('-');
                showDate = `${d[2]}/${d[1]}/${d[0]}`; 
            }

            // ✨ 2. เช็คว่ามีขั้นตอนไหนถูกพิจารณาไปแล้วหรือยัง (ไม่เป็น Pending)
        const rowSteps = allSteps.filter(s => s.request_id === row.id);
        const hasAction = rowSteps.some(s => s.status !== 'Pending');
        
        // ถ้าระบบหลักปิดไปแล้ว หรือมีคนเริ่มพิจารณาแล้ว ให้ล็อกปุ่มทันที
        const isDisable = (row.status === 'Approved' || row.status === 'Rejected' || hasAction);
            
            const btnView = `<button onclick="openOTDetailModal('${row.id}')" class="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm" title="ดูรายละเอียด"><i class='bx bx-show text-lg'></i></button>`;
            
            const btnEdit = isDisable 
                ? `<button onclick="alert('รายการนี้ได้รับการพิจารณาไปแล้ว ไม่สามารถแก้ไขได้ค่ะ 😅')" class="w-8 h-8 rounded-lg bg-slate-300 text-white flex items-center justify-center cursor-not-allowed shadow-sm" title="แก้ไขไม่ได้"><i class='bx bx-edit text-lg'></i></button>`
                : `<button onclick="editMyOTRequest('${row.id}')" class="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm" title="แก้ไข"><i class='bx bx-edit text-lg'></i></button>`;
                
            const btnDelete = isDisable
                ? `<button onclick="alert('รายการนี้ได้รับการพิจารณาไปแล้ว ไม่สามารถลบได้ค่ะ 😅')" class="w-8 h-8 rounded-lg bg-slate-300 text-white flex items-center justify-center cursor-not-allowed shadow-sm" title="ลบไม่ได้"><i class='bx bx-trash text-lg'></i></button>`
                : `<button onclick="deleteMyOTRequest('${row.id}')" class="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm" title="ลบ"><i class='bx bx-trash text-lg'></i></button>`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition-colors duration-200";
            tr.innerHTML = `
                <td class="p-4 font-medium text-slate-700 text-center">${row.id}</td>
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-slate-100 text-slate-400 overflow-hidden flex-shrink-0 border border-slate-200 flex items-center justify-center">
                            <!-- ✨ ใช้ getAvatarUrl ตรงนี้ ✨ -->
                            <img src="${getAvatarUrl(currentUser.fullname, currentUser.avatar_url)}" class="w-full h-full object-cover">
                        </div>
                        <div>
                            <p class="font-bold text-sm text-slate-800">${currentUser.fullname}</p>
                            <p class="text-xs text-slate-500 mt-0.5">${agencyName} | ${deptName}</p>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-slate-600 text-center">${timeStr}</td>
                <td class="p-4 text-slate-600 text-center">${showDate}</td>
                <td class="p-4 text-slate-600 text-center">${hrsStr}</td>
                <td class="p-4 text-slate-600 truncate max-w-[150px]" title="${row.description}">${row.description || '-'}</td>
                <td class="p-4 text-center">${badgeHTML}</td>
                <td class="p-4 text-center">
                    <div class="flex items-center justify-center space-x-1.5">
                        ${btnView}
                        ${btnEdit}
                        ${btnDelete}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Load Personal Dashboard Data Error:", err);
    }
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
                label: 'จำนวนครั้งที่ขอ OT',
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

    try {
        const { data: myPendingSteps, error: stepErr } = await supabaseClient
            .from('approval_steps')
            .select('*')
            .eq('approver_id', currentUser.id)
            .eq('status', 'Pending');

        if (stepErr) throw stepErr;

        const tbody = document.getElementById("approvalQueueTableBody");
        tbody.innerHTML = "";

        if (!myPendingSteps || myPendingSteps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">ตอนนี้ไม่มีคำขอโอทีค้างรอให้คุณอนุมัติแล้วค่ะ ✨</td></tr>`;
            return;
        }

        for (const step of myPendingSteps) {
            const { data: allSteps, error: allErr } = await supabaseClient
                .from('approval_steps')
                .select('*')
                .eq('request_id', step.request_id);

            if (allErr) continue;

            const previousStepsApproved = allSteps
                .filter(s => s.step_order < step.step_order)
                .every(s => s.status === 'Approved');

            if (previousStepsApproved) {
                // 1. ดึงข้อมูลคำขอ OT
                const { data: request, error: reqErr } = await supabaseClient
                    .from('ot_requests')
                    .select('*')
                    .eq('id', step.request_id)
                    .single();

                if (reqErr) continue;

                // 2. ดึงข้อมูลพนักงาน (เพื่อเอารูป ชื่อ และตำแหน่ง/ฝ่าย)
                const { data: userData } = await supabaseClient
                    .from('users')
                    .select('fullname, avatar_url, role, department')
                    .eq('id', request.user_id)
                    .single();

                // 3. ดึงข้อมูลประเภท OT (เพื่อเอาเรตตัวคูณและเวลาทำงาน)
                const { data: otTypeData } = await supabaseClient
                    .from('ot_types')
                    .select('rate, start_time, end_time')
                    .eq('id', request.ot_type_id)
                    .single();

                // แมปชื่อฝ่ายให้แสดงผลเป็นภาษาไทยสวยๆ ค่ะ
                const deptMap = { 'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี', 'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM' };
                
                // เตรียมตัวแปรสำหรับแสดงผลในตาราง
                const empName = userData ? userData.fullname : request.user_id;
                const empAvatar = getAvatarUrl(empName, userData?.avatar_url);
                const empRole = userData ? userData.role : '-';
                const empDept = userData ? (deptMap[userData.department] || userData.department) : '-';
                
                const otRate = otTypeData ? `โอที (${otTypeData.rate}) เท่า` : '-';
                const otTime = otTypeData ? `${otTypeData.start_time} - ${otTypeData.end_time}` : '-';

                // แปลงรูปแบบวันที่จาก YYYY-MM-DD เป็น DD/MM/YYYY ตามที่พี่ต้นต้องการค่ะ
                let showDate = request.date_start;
                if(showDate && showDate.includes('-')) {
                    const d = showDate.split('-');
                    showDate = `${d[2]}/${d[1]}/${d[0]}`; 
                }

                // ป้าย Badge สถานะรออนุมัติ
                const statusBadge = '<span class="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-600"><i class="bx bx-hourglass mr-1"></i>รออนุมัติ</span>';

                // สร้างโครงสร้างแถวตาราง (Row)
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
                            <div class="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm">
                                <img src="${empAvatar}" class="w-full h-full object-cover">
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
                tbody.appendChild(tr);
            }
        }

    } catch (err) {
        console.error("Load Approval Queue Error:", err);
    }
}

async function actionApproveStep(stepId, action, requestId, currentOrder, totalSteps) {
    const actionText = action === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ';
    // ✨ เปลี่ยนข้อความ prompt ให้บอกว่าจำเป็นต้องระบุ
    const reasonInput = prompt(`ต้องการยืนยัน " ${actionText} " รายการ ${requestId}\n⚠️ กรุณาระบุเหตุผล/หมายเหตุ (จำเป็นต้องระบุ):`);
    
    if (reasonInput === null) return; // กรณีผู้ใช้กดยกเลิก

    // ✨ เพิ่มการตรวจสอบว่าห้ามเป็นค่าว่าง
    if (reasonInput.trim() === "") {
        alert(`ไม่สามารถดำเนินการได้ค่ะ ❌\nกรุณาระบุเหตุผลในการ "${actionText}" ด้วยค่ะ`);
        return; // หยุดการทำงานทันที
    }

    try {
        await supabaseClient
            .from('approval_steps')
            .update({ 
                status: action, 
                approved_at: new Date().toLocaleDateString('th-TH'),
                comment: reasonInput.trim() // ✨ บันทึกค่าที่ตัดช่องว่างซ้ายขวาออกแล้ว
            })
            .eq('id', stepId);

        if (action === 'Rejected') {
            await supabaseClient.from('ot_requests').update({ status: 'Rejected' }).eq('id', requestId);
        } else if (action === 'Approved' && currentOrder === totalSteps) {
            await supabaseClient.from('ot_requests').update({ status: 'Approved' }).eq('id', requestId);
        }

        alert("ดำเนินการพิจารณาคำขอเรียบร้อยแล้วค่ะ! 🎉");
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
                <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl mb-2">
                    <i class='bx bx-briefcase-alt-2'></i>
                </div>
                <span class="font-bold text-slate-700 text-sm">${ot.start_time} - ${ot.end_time}</span>
                <span class="text-xs text-slate-500 mt-1">โอที (${ot.rate}) เท่า</span>
                <span class="text-[11px] font-semibold text-slate-400 mt-1 bg-slate-100 px-2 py-0.5 rounded-full">รวม ${actualHours} ชม.</span>
                
                <div class="check-icon absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full text-white flex items-center justify-center opacity-0 scale-50 transition-all duration-200">
                    <i class='bx bx-check text-sm'></i>
                </div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.ot-card').forEach(c => {
                    c.classList.remove('border-blue-500', 'bg-blue-50');
                    c.classList.add('border-slate-100', 'bg-white');
                    c.querySelector('.check-icon').classList.remove('opacity-100', 'scale-100');
                    c.querySelector('.check-icon').classList.add('opacity-0', 'scale-50');
                });
                
                card.classList.remove('border-slate-100', 'bg-white');
                card.classList.add('border-blue-500', 'bg-blue-50');
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
        
        const activeClasses = isSelected ? 'border-green-500 bg-green-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm';
        const iconOpacity = isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50';
        const badgeStr = isSelected ? `<div class="absolute -top-2 -left-2 w-6 h-6 bg-amber-500 text-white rounded-full text-xs font-bold flex items-center justify-center border-2 border-white z-10 shadow-sm">${isSelectedIdx + 1}</div>` : '';
        
        const agencyName = agencyMap[u.agency] || u.agency || '-';
        const deptName = deptMap[u.department] || u.department || '-';

        let subText = u.role;
        if (u.role !== 'SuperUser') {
            subText = `${u.role} - ${agencyName} / ${deptName}`;
        }

        const card = document.createElement('div');
        card.className = `relative flex items-center p-3 rounded-xl border-2 cubic-bezier(0.4, 0, 0.2, 1) duration-200 cursor-pointer transition-all ${activeClasses}`;
        card.innerHTML = `
            ${badgeStr}
            <div class="w-11 h-11 rounded-full bg-slate-50 text-slate-400 overflow-hidden flex-shrink-0 mr-3 border border-slate-200 flex items-center justify-center text-xl shadow-inner">
                <!-- ✨ ใช้ getAvatarUrl ตรงนี้ ✨ -->
                <img src="${getAvatarUrl(u.fullname, u.avatar_url)}" class="w-full h-full object-cover">
            </div>
            <div class="flex-grow min-w-0 pr-2">
                <p class="font-bold text-sm text-slate-800 truncate">${u.fullname}</p>
                <p class="text-[12px] text-slate-500 truncate mt-0.5">${subText}</p>
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
                    alert("เลือกผู้อนุมัติครบ 3 ท่านแล้ว ถ้าต้องการเปลี่ยนตัวบุคคล ให้กดเอาคนเดิมออกก่อน💕");
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
            <div class="flex items-center bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
                <span class="w-5 h-5 bg-amber-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center mr-2">${idx + 1}</span>
                <span class="text-sm font-semibold text-slate-700 mr-1">${u.fullname}</span>
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
        alert("กรอกข้อมูลและเลือกเวลาการ์ดโอทีให้ครบก่อนนะคะ 😊");
        return;
    }

    if (finalSelectedApprovers.length !== 3) {
        alert(`⚠️ กรุณาเลือกผู้อนุมัติพิจารณาให้ครบ 3 ลำดับนะคะ (ตอนนี้เลือกไว้เพียง ${finalSelectedApprovers.length} ท่าน)`);
        return;
    }

    try {
        const todayStr = new Date().toLocaleDateString('th-TH');
        
        let reqId = editId; 
        if (!editId) {
            // ✨ ให้ระบบวิ่งไปหารหัส OTR ล่าสุดในฐานข้อมูลก่อน
            const { data: lastReq } = await supabaseClient
                .from('ot_requests')
                .select('id')
                .order('id', { ascending: false })
                .limit(1);

            let nextNum = 1; // เริ่มต้นที่ 1
            if (lastReq && lastReq.length > 0) {
                const lastIdStr = lastReq[0].id; // เช่น OTR-0001
                if (lastIdStr.includes('-')) {
                    const lastNum = parseInt(lastIdStr.split('-')[1], 10);
                    if (!isNaN(lastNum)) {
                        nextNum = lastNum + 1; // นำเลขล่าสุดมา + 1
                    }
                }
            }
            // ✨ ประกอบร่างใหม่ และเติมเลข 0 ด้านหน้าให้ครบ 4 หลัก
            reqId = "OTR-" + String(nextNum).padStart(4, '0'); 
        }

        const requestPayload = {
            id: reqId,
            description: description,
            date_start: dateStart,
            user_id: currentUser.id,
            ot_type_id: otType,
            status: 'Pending',
            submit_date: todayStr
        };

        if (editId) {
            await supabaseClient.from('ot_requests').update(requestPayload).eq('id', editId);
            await supabaseClient.from('approval_steps').delete().eq('request_id', editId);
        } else {
            await supabaseClient.from('ot_requests').insert([requestPayload]);
        }

        const stepsData = [
            { id: reqId + "-STEP1", request_id: reqId, step_order: 1, approver_id: finalSelectedApprovers[0].id, status: 'Pending', assigned_date: todayStr },
            { id: reqId + "-STEP2", request_id: reqId, step_order: 2, approver_id: finalSelectedApprovers[1].id, status: 'Pending', assigned_date: todayStr },
            { id: reqId + "-STEP3", request_id: reqId, step_order: 3, approver_id: finalSelectedApprovers[2].id, status: 'Pending', assigned_date: todayStr }
        ];

        await supabaseClient.from('approval_steps').insert(stepsData);

        alert(editId ? "📝 บันทึกการแก้ไขคำขอเรียบร้อยแล้วค๊าา!" : "🚀 ส่งใบคำขอและจัดตั้งสายงานพิจารณาอนุมัติเรียบร้อยแล้วค๊าา!");
        closeRequestFormModal();
        loadMyOTDashboardData(); 

    } catch (err) {
        console.error("Submit Request Error:", err);
        alert("เกิดข้อผิดพลาดในการบันทึกคำขอค่ะ");
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
        document.getElementById("dashboardPage").style.display = "none";
        document.getElementById("pageformLogin").style.display = "flex"; 
        
        document.getElementById("loginusername").value = "";
        document.getElementById("loginpassword").value = "";
    });
}

async function openOTDetailModal(reqId) {
    const modal = document.getElementById('otDetailModal');
    const loading = document.getElementById('modalLoading');
    
    modal.classList.remove('hidden');
    loading.classList.remove('hidden'); 

    try {
        const { data: reqData, error: reqErr } = await supabaseClient
            .from('ot_requests').select('*').eq('id', reqId).single();
        if (reqErr) throw reqErr;

        const { data: userData } = await supabaseClient
            .from('users').select('*').eq('id', reqData.user_id).single();

        const { data: otType } = await supabaseClient
            .from('ot_types').select('*').eq('id', reqData.ot_type_id).single();

        const { data: stepsData } = await supabaseClient
            .from('approval_steps').select('*').eq('request_id', reqId).order('step_order', { ascending: true });

        // ✨ ใช้ getAvatarUrl ตรงนี้ ✨
        const avatarUrl = getAvatarUrl(userData?.fullname, userData?.avatar_url);
        document.getElementById('modalEmpImage').src = avatarUrl;
        document.getElementById('modalEmpName').innerText = userData?.fullname || reqData.user_id;
        // แมปชื่อหน่วยงานและฝ่ายให้เป็นชื่อเต็ม
        const agencyMap = { 'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending', 'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding', 'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR', 'AGC-015': 'Planning', 'AGC-016': 'Accounting' };
        const deptMap = { 'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี', 'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM' };

        const agencyName = agencyMap[userData?.agency] || userData?.agency || '-';
        const deptName = deptMap[userData?.department] || userData?.department || '-';

        // ✨ แก้ไขที่ 1: เปลี่ยนมาใช้ innerHTML และใส่ <br> เพื่อดันฝ่ายลงบรรทัดใหม่
        document.getElementById('modalEmpDept').innerHTML = `หน่วยงาน: ${agencyName} <br> ฝ่าย: ${deptName}`;

        document.getElementById('modalReqId').innerText = reqData.id;
        
        // ✨ แก้ไขที่ 2: แปลงรูปแบบวันที่จาก YYYY-MM-DD เป็น DD/MM/YYYY
        let showDate = reqData.date_start;
        if(showDate && showDate.includes('-')) {
            const d = showDate.split('-');
            showDate = `${d[2]}/${d[1]}/${d[0]}`; 
        }
        document.getElementById('modalDate').innerText = showDate;
        document.getElementById('modalDesc').innerText = reqData.description || '-';
        
        if (otType) {
            document.getElementById('modalTime').innerText = `${otType.start_time} - ${otType.end_time}`;
            document.getElementById('modalRate').innerText = `${otType.rate} เท่า`;
            document.getElementById('modalTotalHours').innerText = `${calculateOTHours(otType.start_time, otType.end_time)} ชม.`;
        }

        let mainBadge = '';
        if (reqData.status === 'Approved') mainBadge = '<span class="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-bold">อนุมัติเรียบร้อย</span>';
        else if (reqData.status === 'Rejected') mainBadge = '<span class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">ไม่อนุมัติ</span>';
        else mainBadge = '<span class="px-3 py-1 bg-amber-100 text-amber-600 rounded-full text-xs font-bold">รออนุมัติ</span>';
        document.getElementById('modalStatusBadge').innerHTML = mainBadge;

        const timelineContainer = document.getElementById('modalTimeline');
        timelineContainer.innerHTML = '';
        
        if (stepsData && stepsData.length > 0) {
            const approverIds = stepsData.map(s => s.approver_id);
            const { data: approvers } = await supabaseClient.from('users').select('id, fullname').in('id', approverIds);
            
            stepsData.forEach((step) => {
                const approverName = approvers?.find(a => a.id === step.approver_id)?.fullname || step.approver_id;
                
                let iconColor = 'bg-slate-200 text-slate-400';
                let statusText = '<span class="text-slate-500 text-xs">รอคิวพิจารณา</span>';
                
                if (step.status === 'Approved') {
                    iconColor = 'bg-green-500 text-white';
                    statusText = `<span class="text-green-600 text-xs font-bold">อนุมัติแล้ว (${step.approved_at || '-'})</span>`;
                } else if (step.status === 'Rejected') {
                    iconColor = 'bg-red-500 text-white';
                    statusText = `<span class="text-red-600 text-xs font-bold">ไม่อนุมัติ (${step.approved_at || '-'})</span>`;
                } else if (step.status === 'Pending') {
                    iconColor = 'bg-amber-400 text-white border-2 border-amber-200';
                    statusText = '<span class="text-amber-500 text-xs font-bold">กำลังรอพิจารณา</span>';
                }

                const commentHtml = step.comment && step.comment !== '-' 
                    ? `<p class="text-xs text-slate-600 mt-1.5 bg-slate-100 p-2 rounded-lg border border-slate-200"><i class='bx bx-message-rounded-dots mr-1 text-slate-400'></i>หมายเหตุ: ${step.comment}</p>` 
                    : '';

                const stepHtml = `
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
                timelineContainer.innerHTML += stepHtml;
            });
        }

    } catch (err) {
        console.error("Error loading OT details:", err);
        alert("ไม่สามารถดึงข้อมูลได้ค่ะ ลองใหม่อีกครั้งนะคะ");
        modal.classList.add('hidden');
    } finally {
        loading.classList.add('hidden'); 
    }
}

function closeOTDetailModal() {
    document.getElementById('otDetailModal').classList.add('hidden');
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
        for (let cb of checkboxes) {
            const stepId = cb.value;
            const requestId = cb.dataset.requestId;
            const currentOrder = parseInt(cb.dataset.stepOrder);
            const totalSteps = parseInt(cb.dataset.totalSteps);

            await supabaseClient
                .from('approval_steps')
                .update({ 
                    status: action, 
                    approved_at: new Date().toLocaleDateString('th-TH'),
                    comment: reasonInput.trim()
                })
                .eq('id', stepId);

            if (action === 'Rejected') {
                await supabaseClient.from('ot_requests').update({ status: 'Rejected' }).eq('id', requestId);
            } else if (action === 'Approved' && currentOrder === totalSteps) {
                await supabaseClient.from('ot_requests').update({ status: 'Approved' }).eq('id', requestId);
            }
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
        alert("ดึงข้อมูลไม่สำเร็จค่ะ ลองใหม่อีกครั้งนะคะ");
    }
}

function searchOTRequests() {
    const input = document.getElementById("searchInput").value.toLowerCase();
    const tableBody = document.getElementById("myOTRequestsTableBody");
    const rows = tableBody.getElementsByTagName("tr");

    let visibleCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].innerText.toLowerCase();
        
        if (rowText.includes(input)) {
            rows[i].style.display = ""; 
            visibleCount++;
        } else {
            rows[i].style.display = "none"; 
        }
    }

    const pageInfo = document.getElementById("paginationInfoText");
    if (pageInfo) pageInfo.innerText = `ค้นพบ ${visibleCount} รายการ จากการค้นหา`;
}

// ===================================================
// ระบบปฏิทินภาพรวม OT (OT Calendar)
// ===================================================
let currentCalDate = new Date(); 
let calendarOTData = []; 
let calendarHolidaysData = [];
let calendarWorkdaysData = []; 

async function initCalendar() {
    calendarOTData = [];
    calendarHolidaysData = [];
    calendarWorkdaysData = [];
    await fetchOTForCalendar();
    renderCalendar();
}

async function fetchOTForCalendar() {
    try {
        const [reqRes, userRes, holRes, typeRes, workRes] = await Promise.all([
            supabaseClient.from('ot_requests').select('*'),
            // ✨ เรียกข้อมูล avatar_url มาด้วย ✨
            supabaseClient.from('users').select('id, fullname, department, agency, avatar_url'),
            supabaseClient.from('holidays').select('*'),
            supabaseClient.from('ot_types').select('*'),
            supabaseClient.from('day_of_week').select('*') 
        ]);

        const reqs = reqRes.data || [];
        const users = userRes.data || [];
        
        calendarHolidaysData = holRes.data || [];
        calendarWorkdaysData = workRes.data || []; 
        const otTypes = typeRes.data || [];

        calendarOTData = reqs.map(req => {
            const user = users.find(u => u.id === req.user_id) || {};
            const otType = otTypes.find(t => t.id === req.ot_type_id) || {};
            
            return {
                ...req,
                fullname: user.fullname || req.user_id || 'ไม่ทราบชื่อ',
                department: user.department || 'ไม่ระบุฝ่าย',
                agency: user.agency || '-',
                avatar_url: user.avatar_url || '', // ส่งค่ารูปต่อไปให้ระบบปฏิทิน
                time_range: otType.start_time ? `${otType.start_time} - ${otType.end_time}` : '-'
            };
        });

    } catch (err) {
        console.error("Fetch Calendar Error:", err);
    }
}

function renderCalendar() {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth(); 
    
    const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById("calendarMonthYear").innerText = `${monthNames[month]} ${year + 543}`;

    const grid = document.getElementById("calendarGrid");
    if (!grid) return; 
    grid.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // ✨ เพิ่มตัวย่อวันสำหรับแสดงมุมขวาของการ์ด ✨
    const dayAbbr = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
    const deptMap = { 'DPM-001': 'ฝ่ายผลิต MA', 'DPM-002': 'ฝ่ายบุคคล', 'DPM-003': 'ฝ่ายบัญชี', 'DPM-004': 'ฝ่ายวิศวกรรม', 'DPM-005': 'ฝ่ายวางแผน', 'DPM-006': 'ฝ่ายผลิต SM' };

    // สร้างกล่องล่องหนสำหรับวันว่างก่อนเริ่มเดือน
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="bg-slate-50/40 rounded-2xl border-2 border-transparent"></div>`;
    }

    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateDash = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; 
        const dateSlash = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`; 

        const companyHoliday = calendarHolidaysData.find(h => h.holiday_date === dateSlash || h.holiday_date === dateDash);

        let currentDateObj = new Date(year, month, day);
        let jsDayIndex = currentDateObj.getDay(); 
        let dbDayNum = jsDayIndex === 0 ? 7 : jsDayIndex; 
        
        let currentDayName = dayAbbr[jsDayIndex]; // ดึงตัวย่อของวัน
        
        let dayConfig = calendarWorkdaysData.find(d => d.day_number === dbDayNum);
        let isWeeklyHoliday = dayConfig ? (dayConfig.is_working === false) : false;

        let isHoliday = companyHoliday || isWeeklyHoliday;
        let holidayDesc = "";
        
        if (companyHoliday) {
            holidayDesc = companyHoliday.description; 
        } else if (isWeeklyHoliday) {
            holidayDesc = "วันหยุดประจำสัปดาห์"; 
        }

        const otToday = calendarOTData.filter(ot => ot.date_start === dateDash || ot.date_start === dateSlash);
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
                <div onclick="openDeptOTListModal('${dateDash}', '${dateSlash}', '${dept}')" class="text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-semibold flex items-center cursor-pointer hover:bg-slate-200 transition-colors shadow-sm mb-1.5 group border border-slate-200/60">
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
            cellClasses += " border-green-500 ring-2 ring-green-100"; // ขอบเขียวสำหรับวันนี้
        } else {
            cellClasses += " border-slate-100 hover:border-blue-300"; // ขอบปกติ
        }

        grid.innerHTML += `
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
        `;
    }

    // สร้างกล่องล่องหนเติมให้เต็มตาราง
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells > 35 ? 42 - totalCells : 35 - totalCells; 
    for (let i = 0; i < remainingCells; i++) {
        grid.innerHTML += `<div class="bg-slate-50/40 rounded-2xl border-2 border-transparent"></div>`;
    }
}

function changeCalendarMonth(offset) {
    currentCalDate.setMonth(currentCalDate.getMonth() + offset);
    renderCalendar();
}

function openDeptOTListModal(dateDash, dateSlash, deptName) {
    const modal = document.getElementById("deptOTListModal");
    const container = document.getElementById("deptOTListContainer");
    
    const deptMapReverse = { 'ฝ่ายผลิต MA': 'DPM-001', 'ฝ่ายบุคคล': 'DPM-002', 'ฝ่ายบัญชี': 'DPM-003', 'ฝ่ายวิศวกรรม': 'DPM-004', 'ฝ่ายวางแผน': 'DPM-005', 'ฝ่ายผลิต SM': 'DPM-006' };
    const deptCode = deptMapReverse[deptName] || deptName;

    const filteredReqs = calendarOTData.filter(ot => 
        (ot.date_start === dateDash || ot.date_start === dateSlash) && 
        (ot.department === deptCode || ot.department === deptName)
    );

    document.getElementById("modalDeptTitle").innerText = deptName;
    document.getElementById("modalDeptCount").innerText = `${filteredReqs.length} คำขอ`;

    container.innerHTML = "";

    if (filteredReqs.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">ไม่พบข้อมูลคำขอ</div>`;
    } else {
        filteredReqs.forEach(req => {
            let statusHtml = '';
            if (req.status === 'Approved') statusHtml = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-600 border border-green-200"><i class="bx bx-check-circle mr-0.5"></i>อนุมัติ</span>';
            else if (req.status === 'Rejected') statusHtml = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600 border border-red-200"><i class="bx bx-x-circle mr-0.5"></i>ไม่อนุมัติ</span>';
            else statusHtml = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200"><i class="bx bx-time-five mr-0.5"></i>รออนุมัติ</span>';

            // ✨ สร้างตัวแปลงชื่อหน่วยงาน เพื่อโชว์ชื่อแทนรหัส ✨
            const agencyMapList = { 'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending', 'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding', 'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR', 'AGC-015': 'Planning', 'AGC-016': 'Accounting' };
            const mappedAgencyName = agencyMapList[req.agency] || req.agency || '-';

            const row = document.createElement("div");
            row.className = "grid grid-cols-12 gap-2 items-center p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 rounded-lg transition-colors";
            
            row.innerHTML = `
                <div class="col-span-5 flex items-center space-x-2 pl-1 overflow-hidden">
                    <div class="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden border border-slate-300">
                        <img src="${getAvatarUrl(req.fullname, req.avatar_url)}" class="w-full h-full object-cover">
                    </div>
                    <div class="min-w-0">
                        <p class="text-xs font-bold text-slate-700 truncate">${req.fullname}</p>
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
                    <button onclick="openOTDetailModal('${req.id}')" class="w-7 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-110" title="ดูรายละเอียด">
                        <i class='bx bx-show text-sm'></i>
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
        const { data: users, error } = await supabaseClient.from('users').select('*').order('id', { ascending: true });
        if (error) throw error;

        const tbody = document.getElementById("usersTableBody");
        tbody.innerHTML = "";

        users.forEach(u => {
            const statusBadge = u.status 
                ? '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-600 border border-green-200">เปิดใช้งาน</span>'
                : '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">ปิดใช้งาน</span>';

            let roleBadge = '';
            if(u.role === 'SuperAdmin') roleBadge = '<span class="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">SuperAdmin</span>';
            else if(u.role === 'Admin') roleBadge = '<span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Admin</span>';
            else if(u.role === 'SuperUser') roleBadge = '<span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">SuperUser</span>';
            else roleBadge = '<span class="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">User</span>';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 text-center font-bold text-slate-700">${u.id}</td>
                    
                    <td class="p-3">
                        <div class="flex items-center space-x-3">
                            <div class="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm">
                                <img src="${getAvatarUrl(u.fullname, u.avatar_url)}" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <p class="text-sm font-bold text-slate-700">${u.fullname}</p>
                                <p class="text-[11px] text-slate-400">@${u.username}</p>
                            </div>
                        </div>
                    </td>
                    <td class="p-3 text-center">${roleBadge}</td>
                    <td class="p-3 text-center text-xs text-slate-600">${u.agency || '-'} <br> <span class="text-[10px] text-slate-400">${u.department || '-'}</span></td>
                    <td class="p-3 text-center">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <button onclick="openUserModal('${u.id}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteUserData('${u.id}', '${u.fullname}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
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
    document.getElementById("formFullname").value = "";
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
                document.getElementById("formFullname").value = data.fullname;
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
    const fullname = document.getElementById("formFullname").value.trim();
    const agency = document.getElementById("formAgency").value;
    const department = document.getElementById("formDept").value;
    const role = document.getElementById("formRole").value;
    const status = document.getElementById("formStatus").checked;
    
    let finalAvatarUrl = document.getElementById("formAvatarUrl").value;

    if (!username || !password || !fullname) {
        alert("อย่าลืมกรอก Username, Password และชื่อ-นามสกุลให้ครบถ้วนนะคะ 🥺"); 
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
            fullname: fullname,
            avatar_url: finalAvatarUrl, 
            agency: agency,
            department: department,
            role: role,
            status: status
        };

        // ✨ ขั้นตอนที่ 3: ตรวจสอบว่าเป็นการแก้ไขหรือเพิ่มใหม่
        if (id) {
            await supabaseClient.from('users').update(payload).eq('id', id);
        } else {
            // ถ้ารหัสพนักงานใหม่ ให้ไปหารหัสล่าสุดมาก่อน
            const { data: lastUser, error: lastUserErr } = await supabaseClient
                .from('users')
                .select('id')
                .order('id', { ascending: false })
                .limit(1);

            let newId = "USER-001"; // ค่าเริ่มต้น

            if (lastUser && lastUser.length > 0) {
                const lastIdStr = lastUser[0].id;
                const lastNum = parseInt(lastIdStr.split('-')[1], 10); 
                const nextNum = lastNum + 1; 
                newId = "USER-" + String(nextNum).padStart(3, '0'); 
            }

            payload.id = newId; // ใส่รหัสใหม่เข้าไปใน payload
            
            await supabaseClient.from('users').insert([payload]);
        }
        
        closeUserModal();
        loadUsersData(); 
        
        alert(id ? "อัปเดตข้อมูลสำเร็จเรียบร้อยค่ะ ✨" : "เพิ่มผู้ใช้งานและอัปโหลดรูปสำเร็จค๊าา ✨");

    } catch (err) { 
        alert(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลค่ะ ลองใหม่อีกครั้งนะคะ"); 
        console.error("Save User Error:", err); 
    } finally {
        btnSave.innerHTML = originalBtnText;
        btnSave.disabled = false;
    }
}

async function deleteUserData(id, name) {
    if(!confirm(`ต้องการลบผู้ใช้งาน "${name}" ใช่หรือไม่?\n⚠️ การลบอาจทำให้ข้อมูลประวัติ OT ของคนนี้หายไปด้วยนะคะ ไนท์แนะนำให้ใช้วิธี 'ปิดสถานะการใช้งาน' แทนค่ะ`)) return;
    try {
        await supabaseClient.from('users').delete().eq('id', id);
        loadUsersData();
        alert("ลบข้อมูลสำเร็จค๊าา");
    } catch (err) { alert("ลบไม่สำเร็จค่ะ ติดข้อมูลที่ผูกไว้"); }
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
                        <button onclick="openAgencyModal('${a.id}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteAgencyData('${a.id}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
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
        alert("กรุณากรอกรหัสและชื่อหน่วยงานให้ครบนะคะ"); return;
    }

    const payload = { id: newId, name: newName }; 

    try {
        if (oldId) await supabaseClient.from('agency').update(payload).eq('id', oldId);
        else await supabaseClient.from('agency').insert([payload]);
        
        closeAgencyModal();
        loadAgenciesData();
        alert("บันทึกข้อมูลหน่วยงานเรียบร้อยค่ะ ✨");
    } catch (err) { alert("บันทึกไม่สำเร็จ รหัสอาจจะซ้ำกันค่ะ!"); console.error(err); }
}

async function deleteAgencyData(id) {
    if(!confirm(`ต้องการลบหน่วยงานรหัส ${id} ใช่หรือไม่?`)) return;
    try {
        await supabaseClient.from('agency').delete().eq('id', id);
        loadAgenciesData();
        alert("ลบหน่วยงานสำเร็จค๊าา");
    } catch (err) { alert("ลบไม่สำเร็จค่ะ"); }
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

    if (!newId || !newName) { alert("กรุณากรอกข้อมูลให้ครบนะคะ"); return; }

    const payload = { id: newId, name: newName }; 

    try {
        if (oldId) await supabaseClient.from('departments').update(payload).eq('id', oldId);
        else await supabaseClient.from('departments').insert([payload]);
        
        closeDeptModal();
        loadDepartmentsData();
        alert("บันทึกข้อมูลฝ่ายเรียบร้อยค่ะ ✨");
    } catch (err) { alert("บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!"); console.error(err); }
}

async function deleteDeptData(id) {
    if(!confirm(`ต้องการลบฝ่ายรหัส ${id} ใช่หรือไม่?`)) return;
    try {
        await supabaseClient.from('departments').delete().eq('id', id);
        loadDepartmentsData();
    } catch (err) { alert("ลบไม่สำเร็จค่ะ"); }
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
                    <td class="p-4 text-center text-rose-600 font-semibold">${h.holiday_date}</td>
                    <td class="p-4 text-slate-600 font-medium">${h.description || '-'}</td>
                    <td class="p-4 text-center">
                        <button onclick="openHolidayModal('${h.id}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteHolidayData('${h.id}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
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

    if (!newId || !newDate || !newDesc) { alert("กรุณากรอกข้อมูลให้ครบถ้วนนะคะ"); return; }

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
        alert("บันทึกข้อมูลวันหยุดเรียบร้อยค่ะ ✨");
    } catch (err) { alert("บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!"); console.error(err); }
}

async function deleteHolidayData(id) {
    if(!confirm(`ต้องการลบวันหยุดรหัส ${id} ใช่หรือไม่?`)) return;
    try {
        await supabaseClient.from('holidays').delete().eq('id', id);
        loadHolidaysData();
    } catch (err) { alert("ลบไม่สำเร็จค่ะ"); }
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
                        <span class="bg-orange-100 text-orange-600 font-bold px-3 py-1 rounded-full text-xs">${ot.rate} เท่า</span>
                    </td>
                    <td class="p-4 text-center">
                        <button onclick="openOTTypeModal('${ot.id}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteOTTypeData('${ot.id}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
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

    if (!newId || !start || !end || !rate) { alert("กรุณากรอกข้อมูลให้ครบถ้วนนะคะ"); return; }

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
        alert("บันทึกข้อมูลเวลาโอทีเรียบร้อยค่ะ ✨");
    } catch (err) { alert("บันทึกไม่สำเร็จ รหัสอาจซ้ำกันค่ะ!"); console.error(err); }
}

async function deleteOTTypeData(id) {
    if(!confirm(`ต้องการลบเวลาโอทีรหัส ${id} ใช่หรือไม่?\n⚠️ ระวัง: หากลบ อาจส่งผลกระทบต่อรายการคำขอโอทีเก่าที่เคยเลือกเวลานี้ไว้นะคะ`)) return;
    try {
        await supabaseClient.from('ot_types').delete().eq('id', id);
        loadOTTypesData();
    } catch (err) { alert("ลบไม่สำเร็จค่ะ อาจมีข้อมูลผูกอยู่"); }
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
                ? '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-600"><i class="bx bx-check-circle mr-1"></i>วันทำงาน</span>'
                : '<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-600"><i class="bx bx-x-circle mr-1"></i>วันหยุด</span>';

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-center font-bold text-slate-400">${wd.day_number}</td>
                    <td class="p-4 text-slate-700 font-bold">${wd.day_name}</td>
                    <td class="p-4 text-center">${workingBadge}</td>
                    <td class="p-4 text-center">
                        <button onclick="openWorkdayModal('${wd.day_name}')" class="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors mr-1"><i class='bx bx-edit text-sm'></i></button>
                        <button onclick="deleteWorkdayData('${wd.day_name}')" class="w-8 h-8 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><i class='bx bx-trash text-sm'></i></button>
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

    if (!newName || !dayNum) { alert("กรุณากรอกข้อมูลให้ครบนะคะ"); return; }

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
        alert("บันทึกข้อมูลสำเร็จค่ะ ✨");
    } catch (err) { alert("บันทึกไม่สำเร็จค่ะ อาจมีชื่อซ้ำกัน!"); console.error(err); }
}

async function deleteWorkdayData(dayName) {
    if(!confirm(`ต้องการลบวัน "${dayName}" ใช่หรือไม่?`)) return;
    try {
        await supabaseClient.from('day_of_week').delete().eq('day_name', dayName);
        loadWorkdaysData();
    } catch (err) { alert("ลบไม่สำเร็จค่ะ"); }
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
        alert("อย่าลืมใส่ชื่อระบบนะคะ 🥺");
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
        
        alert("💾 บันทึกการตั้งค่าระบบเรียบร้อยแล้วค๊าา!");
        
        if (document.querySelector(".font-bold.text-lg.text-slate-800")) {
            document.querySelector(".font-bold.text-lg.text-slate-800").innerText = sysName;
        }

    } catch (err) {
        alert("เกิดข้อผิดพลาดในการบันทึกค่ะ กรุณาเช็คว่ามีตาราง system_settings หรือยังนะคะ");
        console.error("Save Settings Error:", err);
    }
}

// ===================================================
// ระบบรายงาน (Page 5) - Report & Export to XLSX 🌟
// ===================================================
let allReportData = []; 
let currentFilteredReportData = []; 

async function loadReportsData() {
    try {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const startInput = document.getElementById("reportStartDate");
        const endInput = document.getElementById("reportEndDate");
        if (!startInput.value) startInput.value = formatDate(firstDay);
        if (!endInput.value) endInput.value = formatDate(lastDay);

        const [reqRes, userRes, typeRes, deptRes] = await Promise.all([
            supabaseClient.from('ot_requests').select('*').order('date_start', { ascending: false }),
            supabaseClient.from('users').select('id, fullname, department, agency, avatar_url'),
            supabaseClient.from('ot_types').select('*'),
            supabaseClient.from('departments').select('*') 
        ]);

        const reqs = reqRes.data || [];
        const users = userRes.data || [];
        const otTypes = typeRes.data || [];
        const depts = deptRes.data || [];

        const deptSelect = document.getElementById("reportDept");
        if (deptSelect.options.length <= 1) { 
            depts.forEach(d => {
                const dName = d.name || d.department_name || d.id;
                deptSelect.innerHTML += `<option value="${d.id}">${dName}</option>`;
            });
        }

        const agencyMapList = { 'AGC-001': 'Machine', 'AGC-002': 'Sheet Metal', 'AGC-003': 'Bending', 'AGC-007': 'Laser&Punching', 'AGC-009': 'Welding', 'AGC-010': 'Grinding', 'AGC-011': 'QC/Delivery', 'AGC-013': 'Engineering', 'AGC-014': 'HR', 'AGC-015': 'Planning', 'AGC-016': 'Accounting' };

        allReportData = reqs.map(req => {
            const user = users.find(u => u.id === req.user_id) || {};
            const otType = otTypes.find(t => t.id === req.ot_type_id) || {};
            
            let hrs = "0.00";
            if (otType.start_time && otType.end_time) {
                hrs = calculateOTHours(otType.start_time, otType.end_time);
            }

            return {
                ...req,
                fullname: user.fullname || req.user_id || '-',
                avatar_url: user.avatar_url || '', // ✨ เพิ่มรูป
                agency_name: agencyMapList[user.agency] || user.agency || '-', // ✨ เพิ่มชื่อหน่วยงาน
                department_id: user.department || '-',
                department_name: depts.find(d => d.id === user.department)?.name || user.department || '-',
                time_range: otType.start_time ? `${otType.start_time} - ${otType.end_time}` : '-',
                rate: otType.rate ? `${otType.rate} เท่า` : '-', // ✨ เพิ่มประเภท/เรตโอที
                hours: parseFloat(hrs),
                description: req.description || '-' 
            };
        });

        filterReports();

    } catch (err) {
        console.error("Load Reports Error:", err);
    }
}

function filterReports() {
    const filterStart = document.getElementById("reportStartDate").value; 
    const filterEnd = document.getElementById("reportEndDate").value;
    const filterDept = document.getElementById("reportDept").value;
    const filterStatus = document.getElementById("reportStatus").value;
    const filterSearch = document.getElementById("reportSearch").value.toLowerCase();

    currentFilteredReportData = allReportData.filter(item => {
        let match = true;
        
        if (filterStart && item.date_start < filterStart) match = false;
        if (filterEnd && item.date_start > filterEnd) match = false;
        
        if (filterDept && item.department_id !== filterDept) match = false;
        
        if (filterStatus && item.status !== filterStatus) match = false;
        
        if (filterSearch && !item.fullname.toLowerCase().includes(filterSearch)) match = false;

        return match;
    });

    renderReportsTable(currentFilteredReportData);
}

function renderReportsTable(data) {
    const tbody = document.getElementById("reportsTableBody");
    tbody.innerHTML = "";

    let totalApproved = 0;
    let totalHours = 0;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400">ไม่พบข้อมูลตามเงื่อนไขที่ค้นหาค่ะ 🍃</td></tr>`;
    } else {
        data.forEach(req => {
            if (req.status === 'Approved') {
                totalApproved++;
                totalHours += req.hours;
            }

            let badgeHTML = '';
            if (req.status === 'Approved') badgeHTML = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-600">อนุมัติแล้ว</span>';
            else if (req.status === 'Rejected') badgeHTML = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600">ไม่อนุมัติ</span>';
            else badgeHTML = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600">รอพิจารณา</span>';

            let showDate = req.date_start;
            if(showDate && showDate.includes('-')) {
                const d = showDate.split('-');
                showDate = `${d[2]}/${d[1]}/${d[0]}`; 
            }
            
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-3 text-center text-slate-600">${showDate}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${req.id}</td>
                    <td class="p-3">
                        <div class="flex items-center space-x-2">
                            <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-300 shadow-sm">
                                <img src="${getAvatarUrl(req.fullname, req.avatar_url)}" class="w-full h-full object-cover">
                            </div>
                            <span class="font-semibold text-slate-800 whitespace-nowrap">${req.fullname}</span>
                        </div>
                    </td>
                    <td class="p-3 text-center text-slate-600 text-[11px] whitespace-nowrap">${req.agency_name}</td>
                    <td class="p-3 text-center text-slate-500 text-[11px] whitespace-nowrap">${req.department_name}</td>
                    <td class="p-3 text-center text-slate-600 text-xs truncate max-w-[120px]" title="${req.description}">${req.description}</td>
                    <td class="p-3 text-center text-slate-600 text-xs font-medium whitespace-nowrap">${req.time_range}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <span class="bg-orange-100 text-orange-600 font-bold px-2.5 py-1 rounded-full text-[10px] border border-orange-200">${req.rate}</span>
                    </td>
                    <td class="p-3 text-center font-bold text-blue-600">${req.hours.toFixed(2)}</td>
                    <td class="p-3 text-center">${badgeHTML}</td>
                    <td class="p-3 text-center">
                        <button onclick="openOTDetailModal('${req.id}')" class="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm mx-auto" title="ดูรายละเอียด">
                            <i class='bx bx-show text-lg'></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    document.getElementById("reportTotalReq").innerText = data.length;
    document.getElementById("reportTotalApproved").innerText = totalApproved;
    document.getElementById("reportTotalHours").innerText = totalHours.toFixed(2);
}

function exportToExcel() {
    if (currentFilteredReportData.length === 0) {
        alert("ตอนนี้ไม่มีข้อมูลให้ Export ค่ะ ลองปรับการค้นหาดูนะคะ 😅");
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
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        updateDarkModeKnob(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateDarkModeKnob(false);
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
