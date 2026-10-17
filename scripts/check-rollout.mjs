import { readFileSync, writeFileSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const readiness = read('../docs/verification/stage6-readiness.json');
const verification = read('../VERIFICATION.json');
const blockers = Object.entries(readiness.gates).filter(([, value]) => value !== true).map(([gate, result]) => ({gate, result}));
const prerequisites = {
  verified_initial_roster: 'pending_school_data',
  browser_acceptance_record: 'pending',
  restored_production_backup_and_storage: 'pending',
  pilot_teacher_and_schedule: 'pending_school_assignment',
};
const report = {
  stage: 7,
  checked_at: new Date().toISOString(),
  status: 'preparation_complete_rollout_not_started',
  stage6_status: readiness.status,
  blockers,
  prerequisites,
  synthetic_fixture_cleanup_verified: verification.fixture_cleanup?.school_remaining === 0 && verification.fixture_cleanup?.users_remaining === 0,
  live_accounts_imported_in_stage7: 0,
  students_activated_in_stage7: 0,
  actual_pilot_session: 'not_started',
  note: 'Document check only; this command does not inspect or modify hosted accounts, send mail, or approve rollout.',
};
writeFileSync(new URL('../docs/verification/stage7-rollout.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = 2; // Preparation cannot establish operational approval.
