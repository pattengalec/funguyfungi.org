# admin.html rewire — exact diffs

Against `lancerfarms-v2/admin.html` @ 2026-07-16. Line numbers pre-edit —
work **bottom-up** (1543 first, line 2 last).

**The point of this file.** The old login was cosmetic. `doAuth()` compared a
password fetched into the browser, then set a JavaScript variable. The four
REST functions never knew about it — they always sent
`Authorization: Bearer ${SUPABASE_ANON_KEY}`. So the "signed in" admin was,
to Postgres, an anonymous stranger. It worked only because RLS said
`using (true)`.

That's the bug. The header is the fix; the login screen is scenery.

---

## 1 — line 1543-1554: boot

```js
// before
document.addEventListener('DOMContentLoaded', () => {
  updateModeIcon();
  const saved = sessionStorage.getItem(ADMIN_PW_KEY);
  if (saved) {
    adminPw = saved;
    window._lfgAdminPw = saved;
    showMain();
  }
  document.getElementById('auth-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') doAuth();
  });
});
```

```js
// after
document.addEventListener('DOMContentLoaded', async () => {
  updateModeIcon();

  // Supabase parses the magic-link token out of the URL hash on load,
  // so this must run after grush-auth.js has initialised.
  if (await GRUSH.isOperator()) {
    const s = await GRUSH.session();
    operatorName = s?.user?.email || 'Operator';
    history.replaceState(null, '', location.pathname);   // strip #access_token
    showMain();
  } else if (await GRUSH.session()) {
    // Signed in, but not on the allowlist. This is the case that matters:
    // a valid inbox is not authorisation.
    await GRUSH.signOut();
    showToast('That address is not an operator on this farm.');
  }

  document.getElementById('auth-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') doAuth();
  });
});
```

---

## 2 — line 753-777: doAuth / signOut

```js
// before
window.doAuth = async function() {
  const pw = document.getElementById('auth-pw').value.trim();
  if (!pw) { showToast('Enter a password'); return; }
  try {
    const cfg = await getConfig();
    const correct = cfg.admin_password;          // <-- the leak
    if (!correct) { showToast('Admin password not set in config...'); return; }
    if (pw !== correct) { showToast('Incorrect password'); return; }
    adminPw = pw;
    sessionStorage.setItem(ADMIN_PW_KEY, pw);
    sessionStorage.setItem('lfg_admin_token', pw);
    window._lfgAdminPw = pw;
    showMain();
  } catch(e) { showToast('Could not verify — check connection'); }
};

window.signOut = function() {
  sessionStorage.removeItem(ADMIN_PW_KEY);
  location.reload();
};
```

```js
// after
window.doAuth = async function() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showToast('Enter your email'); return; }
  const btn = document.getElementById('auth-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  const r = await GRUSH.sendLink(email);
  btn.disabled = false; btn.textContent = 'Send sign-in link';
  showToast(r.msg, 5000);
  // Deliberately identical response whether or not the address is an
  // operator. Otherwise this form becomes a way to enumerate who is.
};

window.signOut = async function() {
  await GRUSH.signOut();
  location.reload();
};
```

---

## 3 — line 735-736: kill the password state

```js
// before
const ADMIN_PW_KEY = 'lfg_admin_token';
let adminPw = '';
// after
let operatorName = '';    // set at boot from the verified session
```

Then the two attribution sites:

```js
// 1340 — before
await resolveReport(id, note, adminPw ? 'Admin' : 'Staff');
// 1340 — after
await resolveReport(id, note, operatorName || 'Admin');

// 1468 — before
await addLog(areaId, areaId ? null : 'General Farm', note, adminPw ? 'Admin' : 'Staff');
// 1468 — after
await addLog(areaId, areaId ? null : 'General Farm', note, operatorName || 'Admin');
```

---

## 4 — line 630-632: delete the dead function

```js
// before — defined, never called, in both repos
function verifyStaffPassword(pw) {
  if (!pw || !pw.startsWith('Godisgood')) return false;
  return /^\d{4}$/.test(pw.slice('Godisgood'.length));
}
// after — deleted.
```

Any 4 digits passed it. It never identified anyone, and nothing ever asked.

---

## 5 — line 596-620: **the actual fix**

```js
// before
const SUPABASE_URL = 'https://gblizuknnvguxyxfequh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
const DB_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
```

```js
// after — the key moves to window BEFORE grush-auth.js loads (see §7).
// DB_HEADERS is deleted outright: a const header object cannot carry a
// session that doesn't exist until after sign-in.
const SUPABASE_URL = 'https://gblizuknnvguxyxfequh.supabase.co';
```

Then all four call sites. Each function is already `async`, so `await` is free:

```js
// 601 — sbGet
const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`,
  { headers: await GRUSH.headers() });

// 606 — sbPost
const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`,
  { method:'POST', headers: await GRUSH.headers({ Prefer:'return=representation' }), body: JSON.stringify(body) });

// 612 — sbPatch
const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`,
  { method:'PATCH', headers: await GRUSH.headers({ Prefer:'return=representation' }), body: JSON.stringify(body) });

// 619 — sbDelete
const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`,
  { method:'DELETE', headers: await GRUSH.headers() });
```

Also **line 900 and 904** — two raw fetches to `lfg_config` that build headers
inline. Same treatment, or they'll 403 on config writes after lockdown:

```js
// before
{ method:'PATCH', headers: {...DB_HEADERS, Prefer:'return=minimal'}, body: ... }
// after
{ method:'PATCH', headers: await GRUSH.headers({ Prefer:'return=minimal' }), body: ... }
```

Grep before you commit — `DB_HEADERS` must return **zero** hits:

```
grep -n "DB_HEADERS" admin.html
```

One survivor and that path silently reverts to anon. It won't error today
(RLS is still `true`); it'll 403 the moment you run the lockdown, and it'll
look like the lockdown broke it.

---

## 6 — line 168-174: the auth wall

```html
<!-- before -->
<h2>LFG Admin</h2>
<p>Enter your admin credentials</p>
<div class="form-group" style="margin-bottom:12px;text-align:left;">
  <label>Admin Password</label>
  <input type="password" id="auth-pw" placeholder="Admin password" autocomplete="off">
</div>
<button class="btn btn-primary" style="width:100%;" onclick="doAuth()">Sign In</button>
```

```html
<!-- after -->
<h2>LFG Admin</h2>
<p>Sign in with a link sent to your email</p>
<div class="form-group" style="margin-bottom:12px;text-align:left;">
  <label>Email</label>
  <input type="email" id="auth-email" placeholder="you@example.com"
         autocomplete="email" inputmode="email">
</div>
<button class="btn btn-primary" style="width:100%;" id="auth-btn" onclick="doAuth()">Send sign-in link</button>
```

---

## 7 — line 2 and 594: load the module

```html
<!-- line 2 -->
<html lang="en" data-grush-site="lfg">
```

Immediately **before** line 594's `<script>`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  window.SUPABASE_ANON_KEY='eyJhbGci...';   // paste the key from old line 597, unchanged
</script>
<script src="grush-auth.js"></script>
<script>
// ...existing line 594 block continues, minus SUPABASE_ANON_KEY and DB_HEADERS
```

Order is load-bearing: `grush-auth.js` reads `window.SUPABASE_ANON_KEY` at
parse time. A top-level `const` in a classic script is not on `window`, which
is why the key gets an explicit `window.` assignment.

---

## Test before you touch the SQL

RLS is still `using (true)`, so **everything below should pass while the old
permissions are live.** That's the point — verify the plumbing before the
lockdown makes failures ambiguous.

1. Load admin.html → auth wall, email field, no password field.
2. `grep -c DB_HEADERS admin.html` → **0**.
3. Send yourself a link → arrives → click → lands signed in, URL hash stripped.
4. DevTools → Network → any request → `Authorization: Bearer eyJ...` and it is
   **not** the anon key. Compare the two: the session JWT is longer and carries
   your email in the payload. **This is the only test that actually matters.**
5. Approve something. Should work (RLS still permissive).
6. Sign out → reload → back to the wall.
7. Sign in with a **non-operator** address → bounced with "not an operator."
   If this one lets you in, `is_operator()` isn't wired — stop, don't run the
   lockdown.

Only when 1-7 pass do you run `002_grush_lockdown.sql`. Then re-run 5: it must
still work. If it 403s, a `DB_HEADERS` survived somewhere.

---

## manual.html

Same disease, smaller. `SUPA_KEY` at 1317-1318, `BASE_PW` at 1330,
`doAdminLogin()` at 1432 setting `isAdmin = true` and asking the server
nothing. Same three moves: dynamic headers, magic link, delete the constant.
Its writes go to `manual_entries` — currently `ALL / true`, i.e. full anon
CRUD — so it's the loosest surface you have and should not be left behind.
