/* ═══════════════════════════════════════════════════════════════════
   PSMS ERP BRIDGE
   ─────────────────────────────────────────────────────────────────
   Loaded by both accounts.html and pos.html. Provides:
     1. Session check — bounces to / if not logged in
     2. Persistent state — auto-save module state to Neon (or localStorage)
     3. Cross-module event bus — POS sales auto-post to Accounts journal
     4. Top-of-page module switcher pill
     5. Health/heartbeat indicator
   ─────────────────────────────────────────────────────────────────
   This script is loaded BEFORE the module's own code runs. It exposes:
     window.ERP = {
       session, isDemo, api, state, bus, switcher, ready
     }
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const ME_KEY  = 'psms_session';
  const API     = ''; // same-origin
  const MODULE  = (location.pathname.split('/').pop() || '').replace('.html','') || 'unknown';

  // ── Session check ────────────────────────────────────────────────
  let session = null;
  try { session = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) {}
  if (!session) {
    // Not signed in — bounce to launcher
    const back = encodeURIComponent(location.pathname + location.hash);
    location.replace('/?next=' + back);
    return;
  }

  // ── Access guard ─────────────────────────────────────────────────
  const access = session.access || ['accounts','pos'];
  if (MODULE && !access.includes(MODULE) && MODULE !== 'index') {
    alert(`Your account (${session.role}) does not have access to ${MODULE}. Returning to launcher.`);
    location.replace('/');
    return;
  }

  // ── API client ───────────────────────────────────────────────────
  let DEMO_MODE = !!session.demo;
  async function call(path, opts = {}) {
    if (DEMO_MODE) return null; // skip
    try {
      const r = await fetch(API + path, {
        ...opts,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) }
      });
      if (r.status === 401) {
        localStorage.removeItem(ME_KEY);
        location.replace('/');
        return null;
      }
      if (r.status === 503) { DEMO_MODE = true; return null; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[ERP] API call failed:', path, e.message);
      DEMO_MODE = true;
      return null;
    }
  }

  // ── State persistence ────────────────────────────────────────────
  // The full module state is saved to:
  //   • Backend: PUT /api/state/<module>   (Neon JSONB column)
  //   • Fallback: localStorage key `psms_state_<module>`
  //
  // Modules call: ERP.state.save(stateObj)  – debounced
  //               ERP.state.load()          – returns latest snapshot
  // ─────────────────────────────────────────────────────────────────
  const STATE_KEY = 'psms_state_' + MODULE;
  let saveTimer = null;
  const state = {
    async load () {
      // Try backend
      const remote = await call('/api/state/' + MODULE);
      if (remote && remote.state) return remote.state;
      // Fallback localStorage
      try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; }
    },
    save (obj, immediate = false) {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(obj)); } catch (e) {}
      clearTimeout(saveTimer);
      const push = () => call('/api/state/' + MODULE, { method:'PUT', body: JSON.stringify({ state: obj }) });
      if (immediate) push(); else saveTimer = setTimeout(push, 1200);
    }
  };

  // ── Cross-module event bus (server-mediated for real cross-tab) ─
  // POS calls:  ERP.bus.emit('pos.sale.completed', saleObj)
  // Accounts polls every 8 s for new bus events (or via websocket if added later).
  // ─────────────────────────────────────────────────────────────────
  const bus = {
    listeners: {},
    on (event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); },
    async emit (event, payload) {
      const evt = { event, payload, ts: new Date().toISOString(), module: MODULE };
      // Also dispatch locally (same tab)
      (this.listeners[event] || []).forEach(cb => { try { cb(payload); } catch(e){ console.error(e); } });
      // Push to backend
      await call('/api/bus', { method:'POST', body: JSON.stringify(evt) });
      // Mirror in localStorage so other tabs can pick up (storage event)
      try { localStorage.setItem('psms_bus_last', JSON.stringify(evt)); } catch(e) {}
    },
    async poll () {
      const since = sessionStorage.getItem('busLastTs') || new Date(Date.now() - 60000).toISOString();
      const r = await call('/api/bus?since=' + encodeURIComponent(since));
      if (!r || !r.events) return;
      r.events.forEach(evt => {
        if (evt.module === MODULE) return; // ignore own emissions
        (this.listeners[evt.event] || []).forEach(cb => { try { cb(evt.payload); } catch(e){} });
        sessionStorage.setItem('busLastTs', evt.ts);
      });
    }
  };
  // Listen to cross-tab via localStorage
  window.addEventListener('storage', e => {
    if (e.key === 'psms_bus_last' && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue);
        if (evt.module === MODULE) return;
        (bus.listeners[evt.event] || []).forEach(cb => { try { cb(evt.payload); } catch(_){} });
      } catch(_){}
    }
  });

  // ── Heartbeat / poll ─────────────────────────────────────────────
  setInterval(() => bus.poll(), 8000);

  // ── Top-bar switcher pill ────────────────────────────────────────
  // Injected after DOMContentLoaded — non-intrusive, sits top-right fixed.
  function injectSwitcher () {
    const wrap = document.createElement('div');
    wrap.id = 'erpSwitcher';
    wrap.innerHTML = `
      <style id="erpSwitcherStyles">
        #erpSwitcher{position:fixed;top:8px;right:14px;z-index:9999;display:flex;align-items:center;gap:8px;
          font-family:'Segoe UI',system-ui,sans-serif;font-size:11.5px}
        #erpSwitcher .es-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.96);
          border:1px solid rgba(13,45,110,.15);border-radius:18px;padding:4px 11px 4px 4px;cursor:pointer;
          box-shadow:0 4px 12px rgba(13,45,110,.12);color:#0d2d6e;font-weight:600;transition:all .15s}
        #erpSwitcher .es-pill:hover{transform:translateY(-1px);box-shadow:0 6px 14px rgba(13,45,110,.18)}
        #erpSwitcher .es-av{width:22px;height:22px;border-radius:50%;color:#fff;font-size:9.5px;font-weight:800;
          display:flex;align-items:center;justify-content:center}
        #erpSwitcher .es-mod{background:linear-gradient(135deg,#1849a9,#0d2d6e);color:#fff;border:none;
          border-radius:18px;padding:5px 12px;cursor:pointer;font-weight:700;font-family:inherit;font-size:11px;
          box-shadow:0 4px 12px rgba(13,45,110,.2);transition:all .15s;display:inline-flex;align-items:center;gap:5px}
        #erpSwitcher .es-mod:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(13,45,110,.3)}
        #erpSwitcher .es-menu{position:absolute;top:36px;right:0;background:#fff;border:1px solid #dde1e8;
          border-radius:10px;box-shadow:0 12px 30px rgba(13,45,110,.18);padding:6px;min-width:200px;display:none}
        #erpSwitcher .es-menu.on{display:block}
        #erpSwitcher .es-mi{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:6px;cursor:pointer;
          color:#1c2030;font-weight:600;font-size:11.5px}
        #erpSwitcher .es-mi:hover{background:#eef2fc;color:#1849a9}
        #erpSwitcher .es-mi.cur{background:#eef2fc;color:#1849a9}
        #erpSwitcher .es-mi.sep{border-top:1px solid #dde1e8;margin-top:4px;padding-top:8px;color:#991b1b}
        #erpSwitcher .es-mi.sep:hover{background:#fef2f2;color:#991b1b}
        #erpSwitcher .es-ic{font-size:14px;width:18px;text-align:center}
        #erpSwitcher .es-demo{background:#fffbeb;color:#92400e;border:1px solid #fed7aa;border-radius:14px;
          padding:2px 8px;font-size:9.5px;font-weight:800;letter-spacing:.04em}
      </style>
      <button class="es-pill" onclick="document.getElementById('erpMenu').classList.toggle('on')">
        <span class="es-av" style="background:${session.color||'#1849a9'}">${session.short||'U'}</span>
        <span>${esc(session.name||'')}</span>
        <span style="color:#9ba3b5">▾</span>
      </button>
      <button class="es-mod" onclick="location.href='/'">⊞ Modules</button>
      ${DEMO_MODE ? '<span class="es-demo">DEMO</span>' : ''}
      <div class="es-menu" id="erpMenu" style="position:absolute;right:14px;top:42px"></div>
    `;
    document.body.appendChild(wrap);
    buildMenu();
  }
  function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  function buildMenu(){
    const menu = document.getElementById('erpMenu');
    if(!menu) return;
    const mods = [
      { id:'accounts', label:'AccountsCore', ic:'📒', file:'accounts.html' },
      { id:'pos',      label:'RetailFlow POS', ic:'🛒', file:'pos.html' }
    ];
    menu.innerHTML = mods.filter(m => access.includes(m.id)).map(m => `
      <div class="es-mi ${m.id===MODULE?'cur':''}" onclick="location.href='/${m.file}'">
        <span class="es-ic">${m.ic}</span>${m.label}${m.id===MODULE?' <span style="margin-left:auto;font-size:9px;color:#166534">●</span>':''}
      </div>`).join('')
      + `<div class="es-mi sep" onclick="if(confirm('Sign out?')){localStorage.removeItem('${ME_KEY}');location.href='/'}">
           <span class="es-ic">⎋</span>Sign out
         </div>`;
    // Outside click close
    document.addEventListener('click', (e)=>{
      if(!e.target.closest('#erpSwitcher')) menu.classList.remove('on');
    });
  }

  // ── Public API ───────────────────────────────────────────────────
  window.ERP = {
    session,
    isDemo: () => DEMO_MODE,
    module: MODULE,
    api: { call },
    state,
    bus,
    ready: false
  };

  // ── Init ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { injectSwitcher(); window.ERP.ready = true; document.dispatchEvent(new CustomEvent('erp:ready')); });
  } else {
    injectSwitcher(); window.ERP.ready = true; document.dispatchEvent(new CustomEvent('erp:ready'));
  }

  // ─────────────────────────────────────────────────────────────────
  // CROSS-MODULE WIRING: POS → AccountsCore journal
  // ─────────────────────────────────────────────────────────────────
  // When the POS module completes a sale, it should emit:
  //   ERP.bus.emit('pos.sale.completed', { id, date, store, total, lines, payments })
  // The Accounts module listens here and posts a JE automatically.

  if (MODULE === 'accounts') {
    bus.on('pos.sale.completed', (sale) => {
      console.log('[ERP] POS sale received in Accounts:', sale.id);
      // Build journal entry: Dr Cash/Bank | Cr Sales Revenue | Cr GST Payable, then Dr COGS | Cr Inventory
      const lines = [];
      const total = +(sale.total || 0);
      const tax   = +(sale.tax   || 0);
      const net   = total - tax;
      const cashAcc = sale.paymentMethod === 'cash' ? '1000' : '1100';
      lines.push({ acc: cashAcc, dr: total, cr: 0, dim: { store: sale.store, ref: sale.id } });
      lines.push({ acc: '4005',  dr: 0, cr: net,  dim: { store: sale.store } });
      if (tax > 0) lines.push({ acc: '2200', dr: 0, cr: tax, dim: { store: sale.store } });
      const cogs = +(sale.cogs || net * 0.7);
      if (cogs > 0) {
        lines.push({ acc: '5005', dr: cogs, cr: 0, dim: { store: sale.store } });
        lines.push({ acc: '1302', dr: 0, cr: cogs, dim: { store: sale.store } });
      }
      const je = {
        source: 'RetailFlow',
        sourceRef: sale.id,
        date: sale.date || new Date().toISOString().slice(0,10),
        entity: 'PSMS',
        memo: `POS sale ${sale.id} (${sale.store||'POS'})`,
        lines
      };
      // Persist to backend
      call('/api/journals', { method:'POST', body: JSON.stringify(je) });
      // Also inject directly into in-memory store if Accounts exposes a hook
      if (window.AccountsHooks?.addJournal) window.AccountsHooks.addJournal(je);
    });
  }

  // POS module: when a sale finalizes, look for a hook
  if (MODULE === 'pos') {
    // Provide a helper POS code can call:
    //   ERP.postSale(sale)
    window.ERP.postSale = (sale) => bus.emit('pos.sale.completed', sale);
  }

})();
