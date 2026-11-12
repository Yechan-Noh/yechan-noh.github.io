(() => {
  'use strict';
  const script = document.currentScript;
  const base = script.dataset.base ?? '';
  const mode = document.body.dataset.ownerMode;
  const storageKey = 'mtsg-owner-session-v2';
  const legacyKey = 'mtsg-owner-session-v1';
  const rememberedKey = 'mtsg-owner-remembered-v1';
  const scope = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/bigquery.readonly';
  const status = document.querySelector('[data-owner-status]');
  const signIn = document.querySelector('[data-owner-signin]');
  const panel = document.querySelector('[data-owner-panel]');
  let overview, config, expiryTimer, generation = 0, authorized = false, lastCheck = 0;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mtsg-owner-access') : null;
  const message = text => { if (status) status.textContent = text; };
  const forget = document.querySelector('[data-owner-forget]');
  const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const remembered = () => stored(rememberedKey) === 'yes';
  function showOwnerLink() {
    document.querySelectorAll('[data-owner-link]').forEach(e => e.hidden = !remembered());
    if (forget) forget.hidden = !remembered();
  }
  function clearToken() {
    try { localStorage.removeItem(storageKey); sessionStorage.removeItem(legacyKey); } catch {}
  }
  function readSession() {
    try {
      const value = JSON.parse(stored(storageKey) || sessionStorage.getItem(legacyKey));
      return value && typeof value.token === 'string' && value.expiresAt > Date.now() + 5000 ? value : null;
    } catch { return null; }
  }
  function lock(text = 'Sign in with the authorized Google account.') {
    generation++;
    authorized = false;
    overview?.dispose(); overview = null;
    clearTimeout(expiryTimer);
    showOwnerLink();
    document.querySelectorAll('[data-private-view], [data-private-style]').forEach(e => e.remove());
    if (panel) panel.hidden = false;
    if (mode) document.title = 'Owner sign-in · CMBL';
    message(text);
  }
  function signOut(broadcast = true) {
    clearToken();
    try { localStorage.removeItem(rememberedKey); } catch {}
    lock('You have signed out and this browser is no longer remembered.');
    if (broadcast && channel) channel.postMessage('sign-out');
  }
  if (forget) forget.addEventListener('click', () => signOut());
  function expire() {
    clearToken();
    lock('This browser is remembered. Continue with Google to renew access.');
  }
  if (channel) channel.onmessage = e => { if (e.data === 'sign-out') signOut(false); };
  async function loadConfig() {
    if (!config) {
      const response = await fetch(base + '/assets/js/owner/config.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('not-ready');
      config = await response.json();
    }
    if (!config.clientId || !/^[A-Za-z0-9_-]+$/.test(config.fileId || '') || !/^[a-f0-9]{64}$/.test(config.sha256 || '')) throw new Error('not-ready');
    return config;
  }
  async function protectedContent(session) {
    const cfg = await loadConfig();
    const response = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(cfg.fileId) + '?alt=media', {
      headers: {Authorization: 'Bearer ' + session.token}, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 || response.status === 404 ? 'denied' : 'unavailable');
    const text = await response.text();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== cfg.sha256) throw new Error('integrity');
    return text;
  }
  function mountReport() {
    if (!window.MTSGOverview) throw new Error('not-ready');
    if (overview) { overview.reload(); return; }
    const view = document.createElement('div'); view.dataset.privateView = '';
    document.body.append(view);
    if (panel) panel.hidden = true;
    document.title = 'Site Overview · CMBL';
    overview = window.MTSGOverview.mount({root: view, propertyId: config.propertyId, clientId: config.clientId,
      getSession: readSession, onRenew: () => signIn?.click(), onSignOut: signOut});
  }
  async function check(session = readSession(), persist = false) {
    const current = ++generation;
    if (!session) { lock(remembered() ? 'This browser is remembered. Continue with Google to open your overview.' : undefined); return false; }
    try {
      message('Checking access…');
      const html = await protectedContent(session);
      if (current !== generation || session.expiresAt <= Date.now() + 5000) return false;
      // Remember only after Google has verified access to the private file.
      // The marker controls navigation visibility; it never authorizes report access.
      try {
        localStorage.setItem(rememberedKey, 'yes');
        localStorage.setItem(storageKey, JSON.stringify(session));
        sessionStorage.removeItem(legacyKey);
      } catch {
        sessionStorage.setItem(legacyKey, JSON.stringify(session));
      }
      window.MTSGAnalytics?.excludeOwner();
      authorized = true; lastCheck = Date.now();
      document.querySelectorAll('[data-owner-link]').forEach(e => e.hidden = false);
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => expire(), Math.max(0, session.expiresAt - Date.now() - 5000));
      if (mode === 'dashboard') mountReport();
      if (mode === 'login') location.replace(base + '/dashboard/');
      return true;
    } catch (error) {
      if (current !== generation) return false;
      if (error.message === 'denied') clearToken();
      lock(error.message === 'not-ready' ? 'Sign-in setup is not complete yet.' : error.message === 'denied' ? 'This account cannot access this page. Use the authorized account.' : 'Access could not be verified. Please try again.');
      return false;
    }
  }
  async function googleLibrary() {
    if (window.google?.accounts?.oauth2) return;
    await new Promise((resolve, reject) => {
      const tag = document.createElement('script'); tag.src = 'https://accounts.google.com/gsi/client'; tag.onload = resolve; tag.onerror = reject; document.head.append(tag);
    });
  }
  if (signIn) {
    signIn.disabled = true;
    (async () => {
      try {
        const cfg = await loadConfig(); await googleLibrary();
        const client = google.accounts.oauth2.initTokenClient({client_id: cfg.clientId, scope, include_granted_scopes: false,
          callback: async result => {
            if (result.error || !result.access_token) { message('Sign-in was not completed.'); signIn.disabled = false; return; }
            const session = {token: result.access_token, expiresAt: Date.now() + Math.min(Number(result.expires_in) || 0, 3600) * 1000};
            message('Checking access…'); await check(session, true); signIn.disabled = false;
          },
          error_callback: () => { message('Sign-in was not completed. Please try again.'); signIn.disabled = false; }
        });
        signIn.addEventListener('click', () => {
          signIn.disabled = true; message('Connecting to Google…');
          client.requestAccessToken({prompt: remembered() ? '' : 'select_account'});
        });
        signIn.disabled = false;
      } catch { message('Unable to start sign-in. Please reload to try again.'); }
    })();
  }
  window.addEventListener('storage', e => {
    if (e.key === rememberedKey && !remembered()) { clearToken(); lock('You have signed out.'); }
    else if (e.key === storageKey || e.key === rememberedKey || e.key === null) { lock(); check(); }
  });
  window.addEventListener('pagehide', () => lock());
  window.addEventListener('pageshow', e => { if (e.persisted) check(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (!readSession() || Date.now() - lastCheck > 60000)) { lock(); check(); }
  });
  setInterval(() => { if (authorized && !readSession()) expire(); }, 15000);
  check();
})();
