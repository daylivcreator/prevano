'use strict';
(function initMobileNav() {
  // Ne s'active que sur mobile
  if (window.innerWidth > 768 && !('ontouchstart' in window)) return;

  const nav      = document.querySelector('nav');
  const navInner = document.querySelector('.nav-inner');
  if (!nav || !navInner) return;

  const PAGE = location.pathname.replace('.html','').replace('/','') || 'index';

  // ── Contenu du drawer selon la page ────────────────────────────────────────
  const NAV_ITEMS = [
    { href:'/',            icon:'ti-home-2',           label:'Simulateur',    key:'index'  },
    { href:'/tarifs.html', icon:'ti-bolt',              label:'Tarifs',        key:'tarifs' },
    { href:'/profil.html', icon:'ti-user-circle',       label:'Mon profil',    key:'profil', authOnly: true },
    { href:'/budget.html', icon:'ti-chart-pie-2',       label:'Budget',        key:'budget', authOnly: true },
    { href:'/coach.html',  icon:'ti-message-chatbot',   label:'Coach IA',      key:'coach',  authOnly: true },
    { href:'/daily.html',  icon:'ti-flame',             label:'Daily Finance', key:'daily',  authOnly: true },
  ];

  // ── Hamburger button ────────────────────────────────────────────────────────
  const hamburger = document.createElement('button');
  hamburger.className = 'prv-hamburger';
  hamburger.setAttribute('aria-label', 'Menu navigation');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '<span></span><span></span><span></span>';
  navInner.appendChild(hamburger);

  // ── Drawer ──────────────────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'prv-drawer-backdrop';

  const drawer = document.createElement('div');
  drawer.className = 'prv-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'Menu principal');

  // Logo dans le drawer
  drawer.innerHTML = `
    <div class="prv-drawer-header">
      <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
        <div style="width:30px;height:30px;background:linear-gradient(135deg,#E24B4A,#FF7B35);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M2 20 C7 20 9 7 14 9 C17 11 17 4 21 4 L21 21 L2 21Z" fill="rgba(255,255,255,0.18)"/>
            <path d="M2 20 C7 20 9 7 14 9 C17 11 17 4 21 4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
            <circle cx="21" cy="4" r="2.4" fill="#fff"/>
          </svg>
        </div>
        <span style="font-size:17px;font-weight:900;letter-spacing:-0.05em;background:linear-gradient(135deg,#E24B4A,#FF7B35);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Pre<em style="font-style:normal">vano</em></span>
      </a>
      <button class="prv-drawer-close" aria-label="Fermer le menu">×</button>
    </div>
    <nav class="prv-drawer-nav" id="prv-drawer-nav"></nav>
    <div class="prv-drawer-footer" id="prv-drawer-footer"></div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  // ── Remplir le drawer selon l'auth ─────────────────────────────────────────
  async function populateDrawer() {
    let user = null;
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); user = d.user; }
    } catch {}

    const drawerNav    = document.getElementById('prv-drawer-nav');
    const drawerFooter = document.getElementById('prv-drawer-footer');

    NAV_ITEMS.forEach(item => {
      if (item.authOnly && !user) return;
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'prv-drawer-link' + (PAGE === item.key ? ' active' : '');
      a.innerHTML = `<i class="ti ${item.icon}"></i>${item.label}`;
      drawerNav.appendChild(a);
    });

    drawerNav.appendChild(Object.assign(document.createElement('div'), { className: 'prv-drawer-divider' }));

    if (user) {
      const info = document.createElement('div');
      info.style.cssText = 'padding:12px 20px;font-size:13px;color:#A8A79F;';
      info.innerHTML = `<strong style="color:#F5F4F0">${escStr(user.firstName)}</strong> · Plan ${escStr(user.plan)}`;
      drawerNav.appendChild(info);

      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'prv-drawer-link';
      logoutBtn.style.cssText = 'width:100%;border:none;background:none;cursor:pointer;';
      logoutBtn.innerHTML = '<i class="ti ti-logout"></i>Déconnexion';
      logoutBtn.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
        location.replace('/');
      });
      drawerNav.appendChild(logoutBtn);
    } else {
      drawerFooter.innerHTML = `
        <a href="/login.html"  class="prv-drawer-link" style="margin-bottom:4px"><i class="ti ti-login"></i>Connexion</a>
        <a href="/signup.html" class="prv-drawer-cta">Commencer gratuitement →</a>`;
    }
  }
  populateDrawer();

  // ── Bottom navigation ───────────────────────────────────────────────────────
  const BOTTOM_PAGES = ['index','tarifs','profil','budget','coach','daily'];
  if (BOTTOM_PAGES.includes(PAGE)) {
    const bnav = document.createElement('div');
    bnav.className = 'prv-bottom-nav';
    const BNAV_ITEMS = [
      { href:'/',            icon:'ti-home-2',         label:'Accueil',  key:'index'  },
      { href:'/tarifs.html', icon:'ti-bolt',            label:'Tarifs',   key:'tarifs' },
      { href:'/profil.html', icon:'ti-user-circle',     label:'Profil',   key:'profil' },
      { href:'/coach.html',  icon:'ti-message-chatbot', label:'Coach',    key:'coach'  },
    ];
    bnav.innerHTML = `<div class="prv-bottom-nav-inner">${
      BNAV_ITEMS.map(it => `<a href="${it.href}" class="prv-bnav-item${PAGE===it.key?' active':''}">
        <i class="ti ${it.icon}"></i><span>${it.label}</span>
      </a>`).join('')
    }</div>`;
    document.body.appendChild(bnav);
    document.body.classList.add('has-bottom-nav');
  }

  // ── Contrôles ───────────────────────────────────────────────────────────────
  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => drawer.classList.contains('open') ? closeDrawer() : openDrawer());
  backdrop.addEventListener('click', closeDrawer);
  drawer.querySelector('.prv-drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  // ── Helper ──────────────────────────────────────────────────────────────────
  function escStr(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Resize : désactiver sur desktop ────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeDrawer();
  });
})();
