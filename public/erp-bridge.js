/* ═══════════════════════════════════════════════════════════════════
   YENUERP BRIDGE — Multi-tenant, tenant-scoped storage
   Loaded by accounts.html and pos.html.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const ME_KEY  = 'psms_session';
  const TENANTS_KEY = 'yenuerp_tenants';
  const MODULE  = (location.pathname.split('/').pop() || '').replace('.html','') || 'unknown';

  let session = null;
  try { session = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) {}
  if (!session) { location.replace('/'); return; }

  const tenant = session.tenant || 'default';
  let tenantData = null;
  try {
    const tenants = JSON.parse(localStorage.getItem(TENANTS_KEY) || '{}');
    tenantData = tenants[tenant];
  } catch(e){}

  let trialDaysLeft = null;
  let trialExpired = false;
  if (session.trialEnd) {
    trialDaysLeft = Math.ceil((new Date(session.trialEnd) - new Date()) / 86400000);
    trialExpired = trialDaysLeft < 0 && session.plan_status !== 'active';
  }

  const access = session.access || ['accounts','pos'];
  if (MODULE && !access.includes(MODULE) && MODULE !== 'index') {
    alert('Your account does not have access to ' + MODULE + '. Returning to workspace.');
    location.replace('/app');
    return;
  }

  const T_PREFIX = 'tenant:' + tenant + ':';
  const state = {
    get(key, fallback) {
      try { const v = localStorage.getItem(T_PREFIX + key); return v ? JSON.parse(v) : (fallback||null); }
      catch(e) { return fallback||null; }
    },
    set(key, value) { try { localStorage.setItem(T_PREFIX + key, JSON.stringify(value)); } catch(e){} },
    async load() { try { return JSON.parse(localStorage.getItem('psms_state_' + MODULE) || 'null'); } catch(e){ return null; } },
    save(obj) { try { localStorage.setItem('psms_state_' + MODULE, JSON.stringify(obj)); } catch(e){} }
  };

  const bus = {
    listeners: {},
    on(event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); },
    emit(event, payload) {
      const evt = { event, payload, ts: Date.now(), module: MODULE, tenant };
      (this.listeners[event] || []).forEach(cb => { try { cb(payload); } catch(e){} });
      try { localStorage.setItem('psms_bus_last', JSON.stringify(evt)); } catch(e) {}
    }
  };
  window.addEventListener('storage', e => {
    if (e.key === 'psms_bus_last' && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue);
        if (evt.module === MODULE) return;
        if (evt.tenant !== tenant) return;
        (bus.listeners[evt.event] || []).forEach(cb => { try { cb(evt.payload); } catch(_){} });
      } catch(_){}
    }
  });

  function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

  function injectSwitcher () {
    const isExpired = trialExpired;
    const wrap = document.createElement('div');
    wrap.id = 'erpSwitcher';
    wrap.innerHTML =
      '<style>' +
      '#erpSwitcher{position:fixed;top:8px;right:14px;z-index:9999;display:flex;align-items:center;gap:8px;font-family:"Segoe UI",system-ui,sans-serif;font-size:11.5px}' +
      '#erpSwitcher .es-co{display:inline-flex;align-items:center;gap:7px;background:rgba(13,45,110,.95);color:#fff;border-radius:18px;padding:5px 12px;font-weight:700;box-shadow:0 4px 12px rgba(13,45,110,.18)}' +
      '#erpSwitcher .es-co .es-cobr{width:18px;height:18px;border-radius:5px;background:#fff;color:#0d2d6e;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900}' +
      '#erpSwitcher .es-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.96);border:1px solid rgba(13,45,110,.15);border-radius:18px;padding:4px 11px 4px 4px;cursor:pointer;box-shadow:0 4px 12px rgba(13,45,110,.12);color:#0d2d6e;font-weight:600}' +
      '#erpSwitcher .es-pill:hover{transform:translateY(-1px)}' +
      '#erpSwitcher .es-av{width:22px;height:22px;border-radius:50%;color:#fff;font-size:9.5px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
      '#erpSwitcher .es-mod{background:linear-gradient(135deg,#1849a9,#0d2d6e);color:#fff;border:none;border-radius:18px;padding:5px 12px;cursor:pointer;font-weight:700;font-family:inherit;font-size:11px;box-shadow:0 4px 12px rgba(13,45,110,.2)}' +
      '#erpSwitcher .es-mod:hover{transform:translateY(-1px)}' +
      '#erpSwitcher .es-menu{position:absolute;top:36px;right:0;background:#fff;border:1px solid #dde1e8;border-radius:10px;box-shadow:0 12px 30px rgba(13,45,110,.18);padding:6px;min-width:200px;display:none}' +
      '#erpSwitcher .es-menu.on{display:block}' +
      '#erpSwitcher .es-mi{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:6px;cursor:pointer;color:#1c2030;font-weight:600;font-size:11.5px}' +
      '#erpSwitcher .es-mi:hover{background:#eef2fc;color:#1849a9}' +
      '#erpSwitcher .es-mi.cur{background:#eef2fc;color:#1849a9}' +
      '#erpSwitcher .es-mi.sep{border-top:1px solid #dde1e8;margin-top:4px;padding-top:8px;color:#991b1b}' +
      '#erpSwitcher .es-mi.sep:hover{background:#fef2f2;color:#991b1b}' +
      '#erpSwitcher .es-ic{font-size:14px;width:18px;text-align:center}' +
      '#erpSwitcher .es-trial{background:' + (isExpired?'#fef2f2':trialDaysLeft<=3?'#fffbeb':'#f0f9ff') + ';color:' + (isExpired?'#991b1b':trialDaysLeft<=3?'#92400e':'#0c4a6e') + ';border:1px solid ' + (isExpired?'#fecaca':trialDaysLeft<=3?'#fde68a':'#bae6fd') + ';border-radius:14px;padding:2px 9px;font-size:10px;font-weight:800;letter-spacing:.03em}' +
      '#erpExpiredBanner{position:fixed;top:0;left:0;right:0;background:#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca;padding:8px 18px;text-align:center;font-size:12px;font-weight:600;z-index:9998;font-family:"Segoe UI",system-ui,sans-serif}' +
      '#erpExpiredBanner a{color:#991b1b;font-weight:800;text-decoration:underline;margin-left:8px}' +
      '</style>' +
      '<div class="es-co" title="Your company"><div class="es-cobr">Y</div><span>' + esc(session.coName || tenant) + '</span></div>' +
      '<button class="es-pill" onclick="document.getElementById(\'erpMenu\').classList.toggle(\'on\')">' +
        '<span class="es-av" style="background:' + (session.color||'#1849a9') + '">' + (session.short||'U') + '</span>' +
        '<span>' + esc(session.name||'') + '</span>' +
        '<span style="color:#9ba3b5">▾</span>' +
      '</button>' +
      '<button class="es-mod" onclick="location.href=\'/app\'">⊞ Modules</button>' +
      (trialDaysLeft != null && !isExpired ? '<span class="es-trial">⏳ ' + trialDaysLeft + 'd trial</span>' : '') +
      (isExpired ? '<span class="es-trial">⚠ TRIAL ENDED</span>' : '') +
      '<div class="es-menu" id="erpMenu"></div>';
    document.body.appendChild(wrap);

    const menu = document.getElementById('erpMenu');
    const mods = [
      { id:'setup',    label:'⚙ Company Setup',  file:'setup.html' },
      { id:'accounts', label:'📒 AccountsCore',  file:'accounts.html' },
      { id:'pos',      label:'🛒 RetailFlow POS', file:'pos.html' }
    ];
    menu.innerHTML = mods.filter(function(m){ return access.includes(m.id) || m.id === 'setup'; }).map(function(m){
      return '<div class="es-mi ' + (m.id===MODULE?'cur':'') + '" onclick="location.href=\'/' + m.file + '\'">' +
        '<span class="es-ic">' + m.label.split(' ')[0] + '</span>' + m.label.split(' ').slice(1).join(' ') +
        (m.id===MODULE?' <span style="margin-left:auto;font-size:9px;color:#166534">●</span>':'') +
        '</div>';
    }).join('') +
    '<div class="es-mi sep" onclick="if(confirm(\'Sign out of ' + esc(session.coName||'workspace') + '?\')){localStorage.removeItem(\'' + ME_KEY + '\');location.href=\'/\'}">' +
      '<span class="es-ic">⎋</span>Sign out</div>';

    document.addEventListener('click', function(e){
      if(!e.target.closest('#erpSwitcher')) menu.classList.remove('on');
    });

    if (isExpired) {
      const b = document.createElement('div');
      b.id = 'erpExpiredBanner';
      b.innerHTML = '⚠ Your free trial has ended — this workspace is read-only. <a href="/app">Upgrade your plan to continue</a>';
      document.body.insertBefore(b, document.body.firstChild);
      document.body.style.paddingTop = '36px';
    }
  }

  window.ERP = {
    session, tenant, tenantData,
    isDemo: function(){ return true; },
    module: MODULE,
    state, bus, ready: false,
    postSale: function(sale){ bus.emit('pos.sale.completed', sale); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      injectSwitcher();
      window.ERP.ready = true;
      document.dispatchEvent(new CustomEvent('erp:ready'));
    });
  } else {
    injectSwitcher();
    window.ERP.ready = true;
    document.dispatchEvent(new CustomEvent('erp:ready'));
  }

  if (MODULE === 'accounts') {
    bus.on('pos.sale.completed', function(sale){
      console.log('[YenuERP] POS sale received:', sale && sale.id);
      if (window.AccountsHooks && window.AccountsHooks.addJournal) {
        const total = +(sale.total || 0);
        const tax   = +(sale.tax   || 0);
        const net   = total - tax;
        const lines = [
          { acc: sale.paymentMethod === 'cash' ? '1000' : '1100', dr: total, cr: 0 },
          { acc: '4000', dr: 0, cr: net }
        ];
        if (tax > 0) lines.push({ acc: '2200', dr: 0, cr: tax });
        window.AccountsHooks.addJournal({
          source: 'RetailFlow',
          sourceRef: sale.id,
          date: sale.date || new Date().toISOString().slice(0,10),
          memo: 'POS sale ' + sale.id,
          lines: lines
        });
      }
    });
  }
})();
