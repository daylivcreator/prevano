'use strict';
(function initFeedbackWidget() {
  // ── Styles ─────────────────────────────────────────────────────────────────
  const css = `
.fb-btn{position:fixed;bottom:24px;right:24px;z-index:8900;height:44px;padding:0 18px 0 14px;border-radius:100px;background:linear-gradient(135deg,#E24B4A,#FF7B35);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(226,75,74,0.45);display:flex;align-items:center;gap:8px;transition:transform .2s,box-shadow .2s;color:#fff;font-size:13px;font-weight:700;white-space:nowrap;}
.fb-btn i{font-size:18px;flex-shrink:0;}
.fb-btn:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(226,75,74,0.6);}
.fb-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9900;display:none;align-items:flex-end;justify-content:center;padding:0 0 88px;backdrop-filter:blur(4px);}
@media(min-width:480px){.fb-overlay{align-items:center;padding:20px;}}
.fb-overlay.active{display:flex;}
.fb-modal{background:#141413;border:1px solid rgba(255,255,255,0.12);border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:28px 24px 24px;position:relative;}
@media(min-width:480px){.fb-modal{border-radius:20px;}}
.fb-close{position:absolute;top:14px;right:14px;background:none;border:none;color:#5F5E5A;font-size:22px;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s;}
.fb-close:hover{background:rgba(255,255,255,0.08);color:#F5F4F0;}
.fb-title{font-size:17px;font-weight:800;color:#F5F4F0;margin-bottom:16px;letter-spacing:-0.02em;}
.fb-tabs{display:flex;gap:8px;margin-bottom:18px;}
.fb-tab{flex:1;padding:9px;border-radius:9px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#A8A79F;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;}
.fb-tab.active{background:rgba(226,75,74,0.12);border-color:rgba(226,75,74,0.35);color:#E24B4A;}
.fb-label{font-size:12px;font-weight:600;color:#5F5E5A;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
.fb-textarea{width:100%;background:#1C1C1A;border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#F5F4F0;font-size:14px;line-height:1.6;padding:12px 14px;resize:none;min-height:110px;font-family:inherit;transition:border-color .2s;margin-bottom:12px;}
.fb-textarea:focus{outline:none;border-color:rgba(226,75,74,0.4);}
.fb-input{width:100%;background:#1C1C1A;border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#F5F4F0;font-size:14px;padding:11px 14px;font-family:inherit;transition:border-color .2s;margin-bottom:14px;}
.fb-input:focus{outline:none;border-color:rgba(226,75,74,0.4);}
.fb-send{width:100%;background:#E24B4A;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s;font-family:inherit;}
.fb-send:hover{background:#A32D2D;}
.fb-send:disabled{opacity:.6;cursor:not-allowed;}
.fb-success{text-align:center;padding:20px 0;}
.fb-success-icon{font-size:40px;margin-bottom:12px;}
.fb-success-title{font-size:16px;font-weight:700;color:#F5F4F0;margin-bottom:6px;}
.fb-success-sub{font-size:13px;color:#A8A79F;}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── HTML ───────────────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.className = 'fb-btn';
  btn.setAttribute('aria-label', 'Feedback & support');
  btn.innerHTML = '<i class="ti ti-alert-circle"></i> Signaler un problème';

  const overlay = document.createElement('div');
  overlay.className = 'fb-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Signaler un problème');
  overlay.innerHTML = `
    <div class="fb-modal">
      <button class="fb-close" aria-label="Fermer">×</button>
      <div class="fb-title">Signaler un problème</div>
      <div id="fb-form-wrap">
        <div class="fb-label">Décrivez le problème</div>
        <textarea class="fb-textarea" id="fb-msg" placeholder="Sur quelle page ? Que s'est-il passé ?" maxlength="1000"></textarea>
        <div class="fb-label">Votre email (optionnel)</div>
        <input type="email" class="fb-input" id="fb-email" placeholder="pour qu'on vous réponde" autocomplete="email">
        <button class="fb-send" id="fb-send">Envoyer <i class="ti ti-send"></i></button>
      </div>
      <div id="fb-success" class="fb-success" style="display:none">
        <div class="fb-success-icon">✅</div>
        <div class="fb-success-title">Problème signalé !</div>
        <p class="fb-success-sub">Notre équipe va analyser votre signalement et le corriger au plus vite.</p>
      </div>
    </div>`;

  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  // ── Logique ────────────────────────────────────────────────────────────────
  function openWidget() {
    overlay.classList.add('active');
    document.getElementById('fb-msg').focus();
  }
  function closeWidget() {
    overlay.classList.remove('active');
    setTimeout(() => {
      document.getElementById('fb-form-wrap').style.display = '';
      document.getElementById('fb-success').style.display = 'none';
      document.getElementById('fb-msg').value = '';
      document.getElementById('fb-email').value = '';
    }, 300);
  }

  btn.addEventListener('click', openWidget);
  overlay.querySelector('.fb-close').addEventListener('click', closeWidget);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeWidget(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('active')) closeWidget(); });

  document.getElementById('fb-send').addEventListener('click', async () => {
    const message = document.getElementById('fb-msg').value.trim();
    const email   = document.getElementById('fb-email').value.trim();
    const sendBtn = document.getElementById('fb-send');

    if (!message || message.length < 5) { document.getElementById('fb-msg').focus(); return; }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Envoi…';

    try {
      await fetch('/api/features', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'feedback', kind: 'probleme', message, email: email || undefined, page: location.pathname }),
      });
    } catch { /* succès affiché même en cas d'erreur réseau */ }

    document.getElementById('fb-form-wrap').style.display = 'none';
    document.getElementById('fb-success').style.display = 'block';
    setTimeout(closeWidget, 3000);
  });

  // Ajouter spin keyframe si pas encore défini
  if (!document.getElementById('fb-spin-style')) {
    const s = document.createElement('style');
    s.id = 'fb-spin-style';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
})();
