SWAT MODEL SCHOOL - PHASE 26
AUTOMATIC CLOUD SAVE + REALTIME UPDATE NOTIFICATIONS

WHAT THIS PHASE ADDS
- Changes saved by existing app modules are automatically queued for Supabase upload after sign-in.
- Automatic save applies to student attendance, gate logs, staff, fees, exams, payroll, expenses, inventory, timetable, notices, teacher reviews and school settings (Director only), as well as the existing Phase 25 student auto-save.
- Supabase Realtime listens for module-row updates made by another signed-in account. When a remote update arrives, this browser automatically reloads so the existing app modules read the updated cloud-backed records.
- Existing localStorage-first behavior, UI, module forms, manual backup and manual cloud sync controls are preserved.

IMPORTANT LIMITATIONS — PLEASE READ
- This is an initial automatic-sync phase, not yet conflict-safe collaborative editing.
- The current database stores each module as one JSON document in record_key='primary'. If two users edit the same module at nearly the same time, one full document can overwrite the other. Avoid simultaneous editing of the same module until per-record sync and conflict resolution are implemented.
- Remote changes currently trigger an automatic page reload after a short delay. This is not yet a seamless in-place screen update; do not leave unsaved form text open when another user edits the same module.
- Existing local records are NOT automatically bulk-uploaded at sign-in, because doing so could overwrite newer cloud records. Use the existing manual upload once after taking a JSON backup, if you need to publish data that has not yet been uploaded.
- Supabase Realtime must be enabled by running PHASE26_ENABLE_REALTIME.sql once. Existing RLS policies remain enabled; do not disable RLS.
- This package does not change the existing student merge logic or database schema.
- Test with dummy data and two browser sessions before using real student information.

INSTALLATION
1. Close the school website and make a backup copy of the complete current project folder.
2. Extract this ZIP and copy index.html, app.js, style.css and README.txt into your existing project folder, replacing matching files.
3. Open Supabase Dashboard > SQL Editor, paste PHASE26_ENABLE_REALTIME.sql and run it once.
4. Open the website with internet available and sign in as Admin or Director.
5. Add a harmless test record (or make a harmless edit) in a module. Wait 2–3 seconds and check Settings > Cloud Data Sync status.
6. Sign in as the other account in a second browser session. Make a change there and check whether the first browser automatically reloads and displays the update.
7. Keep using JSON backups. Do not test simultaneous edits to the same module.

SECURITY
- Browser uses only the existing Supabase publishable key.
- No service_role key or database password is included.
- RLS is not disabled and no broad access policies are added.
- Director-only school settings remain director-only through the existing RLS policy and client role check.
