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
