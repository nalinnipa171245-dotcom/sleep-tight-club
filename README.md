Sleep Tight — Complete Demo Project

Run on Windows:
1. Unzip sleep-tight-complete.zip
2. Open CMD and cd into extracted folder, e.g.:
   cd %HOMEPATH%\Downloads\sleep-tight
3. Install dependencies:
   npm install
4. Start server:
   npm start
5. Open http://localhost:3000

Notes:
- Auth is demo via header x-user-id after login/signup (API returns user.id).
- Admin endpoints require header x-admin-token (default 'admintoken' or set env ADMIN_TOKEN).
- Time gating enforced server-side (Asia/Bangkok 00:00-04:00). VIP users bypass time gate.
- Data persisted as JSON in data/ folder.
