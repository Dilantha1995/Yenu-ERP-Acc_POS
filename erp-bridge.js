/* ═══════════════════════════════════════════════════════════════════
   PSMS ERP BRIDGE — Standalone version
   No backend required. Just a session guard + module switcher.
   Loaded by accounts.html and pos.html.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const ME_KEY = 'psms_session';
  const MODULE = (location.pathname.split('/').pop() || '').replace('.html','') || 'unknown';

  // ── Session check ──
  let session = null;
  try { session = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) {}
  if (!session) {
    location.replace('/');
    return;
  }

  // ── Access guard ──
  const access = session.access || ['accounts','pos'];
  if (MODULE && !access.includes(MODULE) && MODULE !== 'index') {
    alert(`Your account (${session.role}) does not have access to ${MODULE}.`);
    location.replace('/');
    return;
  }

  // ── Local-only state persistence ──
  const STATE_KEY = 'psms_state_' + MODULE;
  let saveTimer = null;
  const state = {
    async load () {
      try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; }
    },
    save (obj) {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(obj)); } catch (e) {}
    }
  };

  // ── Cross-tab event bus (localStorage based) ──
  const bus = {
    listeners: {},
    on (event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); },
    emit (event, payload) {
      const evt = { event, payload, ts: Date.now(), module: MODULE };
      // Local listeners
      (this.listeners[event] || []).forEach(cb => { try { cb(payload); } catch(e){} });
      // Cross-tab via storage event
      try { localStorage.setItem('psms_bus_last', JSON.stringify(evt)); } catch(e) {}
    }
  };
  window.addEventListener('storage', e => {
    if (e.key === 'psms_bus_last' && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue);
        if (evt.module === MODULE) return;
        (bus.listeners[evt.event] || []).forEach(cb => { try { cb(evt.payload); } catch(_){} });
      } catch(_){}
    }
  });

  // ── Module switcher pill (top-right) ──
  function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

  function injectSwitcher () {
    const wrap = document.createElement('div');
    wrap.id = 'erpSwitcher';
    wrap.innerHTML = `
      <style>
        #erpSwitcher{position:fixed;top:8px;right:14px;z-index:9999;display:flex;align-items:center;gap:8px;
          font-family:'Segoe UI',system-ui,sans-serif;font-size:11.5px}
        #erpSwitcher .es-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.96);
          border:1px solid rgba(13,45,110,.15);border-radius:18px;padding:4px 11px 4px 4px;cursor:pointer;
          box-shadow:0 4px 12px rgba(13,45,110,.12);color:#0d2d6e;font-weight:600}
        #erpSwitcher .es-pill:hover{transform:translateY(-1px)}
        #erpSwitcher .es-av{width:22px;height:22px;border-radius:50%;color:#fff;font-size:9.5px;font-weight:800;
          display:flex;align-items:center;justify-content:center}
        #erpSwitcher .es-mod{background:linear-gradient(135deg,#1849a9,#0d2d6e);color:#fff;border:none;
          border-radius:18px;padding:5px 12px;cursor:pointer;font-weight:700;font-family:inherit;font-size:11px;
          box-shadow:0 4px 12px rgba(13,45,110,.2)}
        #erpSwitcher .es-mod:hover{transform:translateY(-1px)}
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
      <span class="es-demo">DEMO</span>
      <div class="es-menu" id="erpMenu"></div>
    `;
    document.body.appendChild(wrap);

    const menu = document.getElementById('erpMenu');
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

    document.addEventListener('click', (e)=>{
      if(!e.target.closest('#erpSwitcher')) menu.classList.remove('on');
    });
  }

  // ── Public API ──
  window.ERP = {
    session,
    isDemo: () => true,
    module: MODULE,
    state,
    bus,
    ready: false,
    postSale: (sale) => bus.emit('pos.sale.completed', sale)
  };

  // ── Init ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectSwitcher();
      window.ERP.ready = true;
      document.dispatchEvent(new CustomEvent('erp:ready'));
    });
  } else {
    injectSwitcher();
    window.ERP.ready = true;
    document.dispatchEvent(new CustomEvent('erp:ready'));
  }

  // ── POS → Accounts wiring ──
  if (MODULE === 'accounts') {
    bus.on('pos.sale.completed', (sale) => {
      console.log('[ERP] POS sale received in Accounts:', sale?.id);
      if (window.AccountsHooks?.addJournal) {
        const total = +(sale.total || 0);
        const tax   = +(sale.tax   || 0);
        const net   = total - tax;
        const lines = [
          { acc: sale.paymentMethod === 'cash' ? '1000' : '1100', dr: total, cr: 0 },
          { acc: '4005', dr: 0, cr: net }
        ];
        if (tax > 0) lines.push({ acc: '2200', dr: 0, cr: tax });
        window.AccountsHooks.addJournal({
          source: 'RetailFlow',
          sourceRef: sale.id,
          date: sale.date || new Date().toISOString().slice(0,10),
          memo: `POS sale ${sale.id}`,
          lines
        });
      }
    });
  }

})();
