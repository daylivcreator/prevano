'use strict';
/**
 * Prevano Credits Widget
 * - Charge le solde depuis /api/features?t=credits
 * - Affiche un badge dans la nav (pages payantes)
 * - Affiche la card complète dans #credits-card-mount (profil)
 * - Expose window.PREVANO_CREDITS et window.showCreditDeduction(cost)
 */
(async function initCredits() {
  const PAGE = location.pathname;
  const IS_APP_PAGE = ['/budget.html','/coach.html','/daily.html'].some(p => PAGE.includes(p));
  const IS_PROFIL   = PAGE.includes('/profil.html');

  if (!IS_APP_PAGE && !IS_PROFIL) return;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const css = `
.crv-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;text-decoration:none;border:1px solid transparent;white-space:nowrap;}
.crv-badge.ok   {background:rgba(34,197,94,.12);  border-color:rgba(34,197,94,.25);  color:#22C55E;}
.crv-badge.warn {background:rgba(255,180,0,.12);   border-color:rgba(255,180,0,.25);  color:#FFB400;}
.crv-badge.empty{background:rgba(226,75,74,.12);   border-color:rgba(226,75,74,.25);  color:#E24B4A;}
.crv-badge i    {font-size:14px;}

/* Déduction animation */
.crv-deduct{position:fixed;top:70px;right:20px;z-index:9999;background:#1C1C1A;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;color:#E24B4A;pointer-events:none;opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s;}
.crv-deduct.show{opacity:1;transform:translateY(0);}

/* Card profil */
.crv-card{background:var(--bg-surface);border:1px solid var(--border-default);border-radius:16px;padding:28px;grid-column:1/-1;}
.crv-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
.crv-card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint);}
.crv-balance-row{display:flex;align-items:baseline;gap:8px;margin-bottom:12px;}
.crv-balance-num{font-size:38px;font-weight:900;letter-spacing:-.04em;}
.crv-balance-total{font-size:15px;color:var(--text-muted);font-weight:500;}
.crv-bar-track{height:8px;background:var(--bg-overlay);border-radius:100px;overflow:hidden;margin-bottom:10px;}
.crv-bar-fill{height:100%;border-radius:100px;transition:width .6s cubic-bezier(.25,.8,.25,1);}
.crv-reset-date{font-size:12px;color:var(--text-faint);margin-bottom:24px;}
.crv-costs-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint);margin-bottom:12px;}
.crv-costs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.crv-cost-item{background:var(--bg-raised);border-radius:10px;padding:12px 14px;text-align:center;}
.crv-cost-icon{font-size:20px;margin-bottom:6px;}
.crv-cost-val{font-size:16px;font-weight:800;color:var(--text-primary);}
.crv-cost-label{font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.3;}
.crv-empty-banner{background:rgba(226,75,74,.1);border:1px solid rgba(226,75,74,.25);border-radius:10px;padding:12px 16px;font-size:13px;color:#E24B4A;margin-top:16px;display:flex;align-items:center;gap:8px;}
@media(max-width:480px){.crv-costs{grid-template-columns:1fr;}}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let data = null;
  try {
    const r = await fetch('/api/features?t=credits', { credentials: 'include' });
    if (r.ok) data = await r.json();
  } catch {}

  if (!data || data.allowance === 0) return; // free → pas de widget

  window.PREVANO_CREDITS = data;

  const { balance, allowance, reset_at, costs } = data;
  const pct    = Math.round((balance / allowance) * 100);
  const status = balance === 0 ? 'empty' : pct < 20 ? 'warn' : 'ok';
  const barColor = status === 'empty' ? '#E24B4A' : status === 'warn' ? '#FFB400' : '#22C55E';

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'long' });
  }

  // ── Badge nav ──────────────────────────────────────────────────────────────
  if (IS_APP_PAGE) {
    const navLinks = document.querySelector('.nav-links, .chat-header-actions');
    if (navLinks) {
      const badge = document.createElement('a');
      badge.id        = 'crv-nav-badge';
      badge.href      = '/profil.html#credits';
      badge.className = `crv-badge ${status}`;
      badge.innerHTML = `<i class="ti ti-diamond"></i><span id="crv-badge-num">${balance}</span>`;
      badge.title     = `${balance} / ${allowance} crédits · Renouvellement le ${fmtDate(reset_at)}`;
      navLinks.prepend(badge);
    }
  }

  // ── Déduction animation ────────────────────────────────────────────────────
  const deductEl = document.createElement('div');
  deductEl.className = 'crv-deduct';
  document.body.appendChild(deductEl);

  window.showCreditDeduction = function(cost) {
    deductEl.textContent = `−${cost} crédit${cost > 1 ? 's' : ''}`;
    deductEl.classList.add('show');
    // Mettre à jour le badge
    if (window.PREVANO_CREDITS) {
      window.PREVANO_CREDITS.balance = Math.max(0, window.PREVANO_CREDITS.balance - cost);
      const badge = document.getElementById('crv-badge-num');
      if (badge) badge.textContent = window.PREVANO_CREDITS.balance;
    }
    setTimeout(() => deductEl.classList.remove('show'), 1800);
  };

  // ── Card profil ────────────────────────────────────────────────────────────
  if (IS_PROFIL) {
    const mount = document.getElementById('credits-card-mount');
    if (mount) {
      mount.innerHTML = `
        <div class="crv-card">
          <div class="crv-card-header">
            <span class="crv-card-title">💎 Crédits Prevano</span>
            <span class="crv-badge ${status}" style="cursor:default"><i class="ti ti-diamond"></i>${balance} / ${allowance}</span>
          </div>
          <div class="crv-balance-row">
            <span class="crv-balance-num" style="color:${barColor}">${balance}</span>
            <span class="crv-balance-total">/ ${allowance} crédits</span>
          </div>
          <div class="crv-bar-track">
            <div class="crv-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="crv-reset-date">
            ${reset_at ? `<i class="ti ti-refresh" style="font-size:13px;margin-right:4px"></i>Renouvellement le ${fmtDate(reset_at)}` : 'Renouvellement le 1er du mois'}
          </div>
          <div class="crv-costs-title">Tarif des actions IA</div>
          <div class="crv-costs">
            <div class="crv-cost-item">
              <div class="crv-cost-icon">🎯</div>
              <div class="crv-cost-val">${costs.plan_retraite}</div>
              <div class="crv-cost-label">Plan retraite</div>
            </div>
            <div class="crv-cost-item">
              <div class="crv-cost-icon">💬</div>
              <div class="crv-cost-val">${costs.coach_message}</div>
              <div class="crv-cost-label">Message Coach IA</div>
            </div>
            <div class="crv-cost-item">
              <div class="crv-cost-icon">📊</div>
              <div class="crv-cost-val">${costs.budget_plan}</div>
              <div class="crv-cost-label">Plan budget</div>
            </div>
          </div>
          ${balance === 0 ? `
            <div class="crv-empty-banner">
              <i class="ti ti-alert-circle"></i>
              Crédits épuisés — ils se renouvellent automatiquement le 1er du mois.
            </div>` : ''}
        </div>`;
    }
  }
})();
