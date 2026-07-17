/* ============================================================
   grush-auth.js — one identity module for every Grush site.
   Drop in beside lfg-theme.css; load before app/admin/manual JS.

   Two tiers, deliberately separate:
     CREW      tap a name. no password. identifies, never authorizes.
     OPERATOR  magic link + allowlist. authorizes approve/delete/config.

   Replaces: Godisgood+MMDD, lfg_config.admin_password, the dead
   verifyStaffPassword(), and the hardcoded 'staff' attribution string.
   ============================================================ */

const GRUSH = (() => {
  const SITE = document.documentElement.dataset.grushSite || 'lfg'; // <html data-grush-site="fgf">
  const URL_ = 'https://gblizuknnvguxyxfequh.supabase.co';
  const ANON = window.SUPABASE_ANON_KEY; // already public by design; keep as-is

  const sb = window.supabase.createClient(URL_, ANON);

  /* ---------- CREW: attribution, no credentials ---------- */

  const CREW_KEY = `grush_${SITE}_who`;

  async function crew() {
    const { data, error } = await sb.from('grush_people')
      .select('id,display_name')
      .eq('site', SITE).eq('active', true)
      .order('sort_order').order('display_name');
    if (error) { console.error('[grush] crew load failed', error); return []; }
    return data;
  }

  // Returns {id, display_name} or null. Survives reload; cleared by signOutCrew().
  function who() {
    try { return JSON.parse(localStorage.getItem(CREW_KEY)); } catch { return null; }
  }
  function setWho(person) { localStorage.setItem(CREW_KEY, JSON.stringify(person)); }
  function signOutCrew() { localStorage.removeItem(CREW_KEY); }

  // Stamp every write. Replaces  completed_by:'staff'  etc.
  // Usage:  sb.from('lfg_log').insert(GRUSH.stamp({ note }))
  function stamp(row, opts = {}) {
    const p = who();
    const name = p?.display_name || 'Unattributed';
    const out = { ...row };
    for (const f of (opts.fields || ['logged_by', 'submitted_by'])) out[f] = name;
    if (opts.actorId !== false && p?.id) out.actor_id = p.id;
    return out;
  }

  /* ---------- OPERATOR: magic link + allowlist ---------- */

  // Sending a link is NOT granting access. The allowlist decides; see is_operator().
  async function sendLink(email) {
    const { error } = await sb.auth.signInWithOtp({
      email: String(email || '').trim().toLowerCase(),
      options: { emailRedirectTo: window.location.href, shouldCreateUser: true }
    });
    if (error) {
      // Built-in SMTP is rate-limited and best-effort — surface it honestly.
      if (/rate|limit|429/i.test(error.message))
        return { ok: false, msg: 'Too many emails just now — wait a few minutes, or set up custom SMTP.' };
      return { ok: false, msg: error.message };
    }
    return { ok: true, msg: 'Check your email for a sign-in link.' };
  }

  async function session() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  // The real gate. A valid session proves an inbox, nothing more.
  // is_operator() is SECURITY DEFINER: it reads the allowlist without
  // exposing it, and returns false for any signed-in stranger.
  async function isOperator() {
    if (!(await session())) return false;
    const { data, error } = await sb.rpc('is_operator');
    if (error) { console.error('[grush] is_operator failed', error); return false; }
    return data === true;
  }

  async function signOut() { await sb.auth.signOut(); }

  /* ---------- REST layer for the raw-fetch pages ----------
     admin.html and manual.html don't use supabase-js — they hand-rolled
     fetch() against /rest/v1 with a CONSTANT header object:

       Authorization: `Bearer ${ANON}`     <-- always anon, even "signed in"

     That's why their logins were cosmetic: no token ever left the browser,
     so RLS had nothing to check. These helpers make the header dynamic.

     apikey stays the anon key — that's routing, not identity.
     Authorization carries the operator's JWT once signed in. That is the
     bit is_operator() actually reads. */

  async function headers(extra = {}) {
    const s = await session();
    return {
      apikey: ANON,
      Authorization: `Bearer ${s?.access_token || ANON}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  // Drop-in for the existing sbGet/sbPost/sbPatch/sbDelete bodies.
  async function rest(path, opts = {}) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      ...opts,
      headers: await headers(opts.headers || {})
    });
    if (res.status === 401 || res.status === 403) {
      // After lockdown this means: not signed in, or signed in but not an operator.
      throw new Error('Not authorized — sign in as an operator.');
    }
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} failed: ${res.status}`);
    return res.status === 204 ? true : res.json();
  }

  /* Gate a privileged view. Returns true if the UI may render.
     Note this is convenience only — RLS is what actually enforces.
     Never treat a client-side check as the boundary again. */
  async function requireOperator({ onDenied } = {}) {
    if (await isOperator()) return true;
    if (await session()) {
      await signOut();
      onDenied?.('That address is signed in but is not an operator on this farm.');
    } else {
      onDenied?.(null);
    }
    return false;
  }

  sb.auth.onAuthStateChange((evt) => {
    if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT')
      document.dispatchEvent(new CustomEvent('grush:auth', { detail: evt }));
  });

  return { sb, SITE, crew, who, setWho, signOutCrew, stamp,
           sendLink, session, isOperator, requireOperator, signOut,
           headers, rest };
})();
