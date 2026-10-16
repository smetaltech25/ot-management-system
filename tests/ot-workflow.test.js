const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'security', '011_atomic_ot_workflow.sql'), 'utf8');
const repairSource = fs.readFileSync(path.join(root, 'security', '012_repair_otr_2390.sql'), 'utf8');

test('Supabase Auth submit and edit use the atomic request RPC', () => {
    assert.match(appSource, /rpc\('oms_save_pending_ot_request'/);
    assert.match(appSource, /target_approver_ids:\s*finalSelectedApprovers\.map/);
    assert.match(appSource, /finalSelectedApprovers\.length !== 3/);
});

test('individual and bulk approvals both use the transactional review RPC', () => {
    const matches = appSource.match(/rpc\('oms_review_steps'/g) || [];
    assert.equal(matches.length, 2);
});

test('database migration locks requests and enforces complete workflows', () => {
    assert.match(migrationSource, /for update;/i);
    assert.match(migrationSource, /The approval workflow has already started/);
    assert.match(migrationSource, /approval_steps_block_partial_delete/);
    assert.match(migrationSource, /approval_steps_require_complete_insert/);
    assert.match(migrationSource, /ot_requests_require_complete_workflow/);
    assert.match(migrationSource, /Exactly three distinct approvers are required/);
});

test('OTR-2390 repair is guarded and restores only Step 2 and Step 3', () => {
    assert.match(repairSource, /count\(\*\)[\s\S]*<> 1/);
    assert.match(repairSource, /OTR-2390-STEP2/);
    assert.match(repairSource, /OTR-2390-STEP3/);
    assert.doesNotMatch(repairSource, /delete\s+from/i);
});

test('date normalization converts Buddhist Era to Christian Era ISO format', () => {
    const vm = require('node:vm');
    const sandbox = {};
    vm.createContext(sandbox);
    const dateFns = appSource.slice(
        appSource.indexOf('function parseOTRequestDate'),
        appSource.indexOf('function formatThaiLongDate')
    );
    vm.runInContext(dateFns, sandbox);

    assert.equal(sandbox.normalizeDateToISO('2569-09-07'), '2026-09-07');
    assert.equal(sandbox.normalizeDateToISO('2026-09-07'), '2026-09-07');
    assert.equal(sandbox.normalizeDateToISO('07/09/2569'), '2026-09-07');
    assert.equal(sandbox.normalizeDateToISO('07/09/2026'), '2026-09-07');

    const parsedBE = sandbox.parseOTRequestDate('2569-09-07');
    assert.equal(parsedBE.getFullYear(), 2026);
    assert.equal(parsedBE.getMonth(), 8);
    assert.equal(parsedBE.getDate(), 7);

    assert.match(appSource, /const dateStart = normalizeDateToISO\(rawDateStart\);/);
});

test('SuperAdmin report bulk and single delete features are properly implemented', () => {
    const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sql013Source = fs.readFileSync(path.join(root, 'security', '013_superadmin_delete_any_ot.sql'), 'utf8');

    // UI elements in HTML
    assert.match(htmlSource, /id="reportDeleteSelectedBtn"/);
    assert.match(htmlSource, /id="reportSelectAllTh"/);
    assert.match(htmlSource, /id="reportSelectAllCheckbox"/);

    // SuperAdmin security check in app.js
    assert.match(appSource, /function toggleAllReportCheckboxes/);
    assert.match(appSource, /function onReportCheckboxChange/);
    assert.match(appSource, /function updateReportDeleteBtnState/);
    assert.match(appSource, /function deleteSingleReportRequest/);
    assert.match(appSource, /function deleteSelectedReportRequests/);
    assert.match(appSource, /function executeDeleteReportRequests/);
    assert.match(appSource, /currentUser\?\.role !== 'SuperAdmin'/);

    // SQL 013 policy
    assert.match(sql013Source, /create policy ot_requests_superadmin_delete_any/);
    assert.match(sql013Source, /public\.oms_role\(\) = 'SuperAdmin'/);
});

test('SuperAdmin processed queue includes Step 1 and Step 2 approved requests with edit capability', () => {
    const sql014Source = fs.readFileSync(path.join(root, 'security', '014_superadmin_support_step_processed_ot.sql'), 'utf8');

    // Logic in app.js
    assert.match(appSource, /async function fetchStepApprovedPendingRequests/);
    assert.match(appSource, /processed_step:\s*1/);
    assert.match(appSource, /processed_step:\s*2/);
    assert.match(appSource, /อนุมัติขั้นที่ 1/);
    assert.match(appSource, /อนุมัติขั้นที่ 2/);
    assert.match(appSource, /const stepRequests = await fetchStepApprovedPendingRequests/);

    // Direct update fallback in superAdminSaveEditedOT
    assert.match(appSource, /from\('ot_requests'\)\s*\.update\(\{[\s\S]*ot_type_id: newOtTypeId/);

    // Reset and delete support
    assert.match(appSource, /from\('approval_steps'\)\s*\.update\(\{[\s\S]*status: 'Pending'/);

    // SQL 014 migration
    assert.match(sql014Source, /create or replace function public\.oms_superadmin_update_processed_ot/);
    assert.match(sql014Source, /create or replace function public\.oms_superadmin_reset_processed_ot/);
    assert.match(sql014Source, /public\.oms_role\(\) <> 'SuperAdmin'/);
});

test('Approval queue supports date picker filtering and text search by date', () => {
    const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    // HTML elements
    assert.match(htmlSource, /id="approvalDateFilter"/);
    assert.match(htmlSource, /id="approvalDateClearBtn"/);
    assert.match(htmlSource, /onchange="handleApprovalDateFilterChange\(\)"/);

    // app.js functions
    assert.match(appSource, /let approvalDateFilter = '';/);
    assert.match(appSource, /function handleApprovalDateFilterChange/);
    assert.match(appSource, /function clearApprovalDateFilter/);
    assert.match(appSource, /function formatApprovalFilterDate/);
    assert.match(appSource, /function getApprovalDateSearchableValues/);

    // Test matching logic in sandbox
    const vm = require('node:vm');
    const sandbox = {
        AGENCY_NAME_MAP: { 'MA': 'ฝ่ายผลิต MA' },
        DEPARTMENT_NAME_MAP: { 'Machine': 'แผนก Machine' },
        getUserOrganizationLabel: () => 'Machine / MA',
        approvalSearchTerm: '',
        approvalDateFilter: ''
    };
    vm.createContext(sandbox);

    const matchCode = appSource.slice(
        appSource.indexOf('const THAI_MONTH_NAMES_FULL ='),
        appSource.indexOf('function setApprovalSearchFeedback')
    );
    vm.runInContext(matchCode, sandbox);

    const req1 = { id: 'OTR-3732', date_start: '2026-10-17', status: 'Pending' };
    const req2 = { id: 'OTR-3643', date_start: '2026-10-16', status: 'Pending' };
    const user1 = { fullname: 'สมชาย สงครามศักดิ์', agency: 'MA', department: 'Machine' };

    // Test 1: Date filter picker alone
    assert.equal(sandbox.doesApprovalItemMatchSearch(req1, user1, '', '2026-10-17'), true);
    assert.equal(sandbox.doesApprovalItemMatchSearch(req2, user1, '', '2026-10-17'), false);

    // Test 2: Search by date text (DD/MM/YYYY)
    assert.equal(sandbox.doesApprovalItemMatchSearch(req1, user1, '17/10/2026', ''), true);
    assert.equal(sandbox.doesApprovalItemMatchSearch(req2, user1, '17/10/2026', ''), false);

    // Test 3: Search by date text (DD/MM)
    assert.equal(sandbox.doesApprovalItemMatchSearch(req1, user1, '17/10', ''), true);
    assert.equal(sandbox.doesApprovalItemMatchSearch(req2, user1, '17/10', ''), false);

    // Test 4: Combined search by name AND date picker
    assert.equal(sandbox.doesApprovalItemMatchSearch(req1, user1, 'สมชาย', '2026-10-17'), true);
    assert.equal(sandbox.doesApprovalItemMatchSearch(req2, user1, 'สมชาย', '2026-10-17'), false);
});
