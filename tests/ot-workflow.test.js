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
