/* Prevano — GSAP animations (ScrollTrigger + extras) */
(function () {
  'use strict';
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  /* ── Scroll progress bar ─────────────────────────────────────── */
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', top: '0', left: '0', width: '0%', height: '2px',
    background: 'linear-gradient(90deg,#E24B4A,#FF7B35)',
    zIndex: '9999', pointerEvents: 'none', willChange: 'width',
  });
  document.body.appendChild(bar);
  gsap.to(bar, {
    width: '100%',
    ease: 'none',
    scrollTrigger: { start: 'top top', end: 'bottom bottom', scrub: 0 },
  });

  /* ── Nav entrance ────────────────────────────────────────────── */
  const nav = document.querySelector('nav');
  if (nav) {
    gsap.from(nav, { y: -60, opacity: 0, duration: 0.5, ease: 'power3.out' });
  }

  /* ── Hero (index.html) ──────────────────────────────────────── */
  const hero = document.querySelector('section.hero');
  if (hero) {
    // Bypass the CSS reveal on the hero container so GSAP controls children
    gsap.set(hero, { opacity: 1, y: 0 });
    hero.classList.add('visible');

    const eyebrow = hero.querySelector('.hero-eyebrow');
    const counter = hero.querySelector('.hero-counter');
    const h1      = hero.querySelector('h1');
    const sub     = hero.querySelector('.hero-sub');
    const note    = hero.querySelector('.hero-note');
    const cta     = hero.querySelector('.hero-cta');
    const stats   = hero.querySelectorAll('.stat-item');

    const tl = gsap.timeline({ delay: 0.05 });
    if (eyebrow) tl.from(eyebrow, { opacity: 0, y: -20, scale: 0.85, duration: 0.5, ease: 'back.out(2.5)' });
    if (counter) tl.from(counter, { opacity: 0, y: 10, duration: 0.35, ease: 'power2.out' }, '-=0.15');
    if (h1)      tl.from(h1,      { opacity: 0, y: 52, duration: 0.65, ease: 'power3.out' }, '-=0.2');
    if (sub)     tl.from(sub,     { opacity: 0, y: 24, duration: 0.5,  ease: 'power2.out' }, '-=0.42');
    if (note)    tl.from(note,    { opacity: 0,         duration: 0.4,  ease: 'power2.out' }, '-=0.3');
    if (cta)     tl.from(cta,     { opacity: 0, scale: 0.88, duration: 0.5, ease: 'back.out(1.8)' }, '-=0.22');
    if (stats.length) {
      tl.from(stats, { opacity: 0, y: 18, stagger: 0.1, duration: 0.5, ease: 'power2.out' }, '-=0.2');
    }
  }

  /* ── Mockup parallax glows (index.html) ─────────────────────── */
  const glows = document.querySelectorAll('.mockup-glow');
  if (glows.length >= 2) {
    gsap.to(glows[0], {
      y: -70, ease: 'none',
      scrollTrigger: { trigger: '.mockup-showcase', start: 'top bottom', end: 'bottom top', scrub: 2 },
    });
    gsap.to(glows[1], {
      y: 55, ease: 'none',
      scrollTrigger: { trigger: '.mockup-showcase', start: 'top bottom', end: 'bottom top', scrub: 3 },
    });
  }

  /* ── Avis cards stagger (index.html — injected dynamically) ──── */
  // Observe #avis-list for when cards are injected
  const avisList = document.getElementById('avis-list');
  if (avisList) {
    const avisObs = new MutationObserver(() => {
      const cards = avisList.querySelectorAll('.avis-card');
      if (!cards.length) return;
      gsap.from(cards, {
        opacity: 0, y: 32, stagger: 0.09, duration: 0.58, ease: 'power3.out',
        scrollTrigger: { trigger: avisList, start: 'top 85%' },
      });
      avisObs.disconnect();
    });
    avisObs.observe(avisList, { childList: true });
  }

  /* ── Shock stats animation (index.html) ─────────────────────── */
  const shockSection = document.getElementById('shock-section');
  if (shockSection) {
    const shockObs = new MutationObserver(() => {
      if (getComputedStyle(shockSection).display === 'none') return;
      const els = shockSection.querySelectorAll('.shock-stat, .score-card, .bar-card, .plan-card, .email-cta');
      if (!els.length) return;
      gsap.from(els, {
        opacity: 0, y: 28, stagger: 0.08, duration: 0.6, ease: 'power3.out', delay: 0.25,
      });
      shockObs.disconnect();
    });
    shockObs.observe(shockSection, { attributes: true, attributeFilter: ['style'] });
  }

  /* ── Final CTA children (index.html) ────────────────────────── */
  const finalInner = document.querySelector('.final-cta-inner');
  if (finalInner) {
    const kids = finalInner.querySelectorAll(
      '.final-cta-logo, .final-cta-title, .final-cta-sub, .btn-final-cta-wrap, .final-cta-note'
    );
    if (kids.length) {
      gsap.set(kids, { opacity: 0, y: 28 });
      ScrollTrigger.create({
        trigger: finalInner,
        start: 'top 78%',
        onEnter: () => gsap.to(kids, {
          opacity: 1, y: 0, stagger: 0.12, duration: 0.65, ease: 'power3.out',
        }),
      });
    }
  }

  /* ── Pricing hero (tarifs.html) ──────────────────────────────── */
  const pricingHero = document.querySelector('.pricing-hero');
  if (pricingHero) {
    gsap.set(pricingHero, { opacity: 1, y: 0 });
    pricingHero.classList.add('visible');

    const h1    = pricingHero.querySelector('h1');
    const p     = pricingHero.querySelector('p');
    const badge = pricingHero.querySelector('.sim-badge');
    const tl = gsap.timeline({ delay: 0.05 });
    if (h1)    tl.from(h1,    { opacity: 0, y: 42, duration: 0.65, ease: 'power3.out' });
    if (p)     tl.from(p,     { opacity: 0, y: 22, duration: 0.5,  ease: 'power2.out' }, '-=0.38');
    if (badge) tl.from(badge, { opacity: 0, scale: 0.85, duration: 0.42, ease: 'back.out(2)' }, '-=0.22');
  }

  /* ── Plan cards stagger (tarifs.html — already has .reveal) ──── */
  // CSS already staggers via transition-delay. Enhance featured card:
  const featuredCard = document.querySelector('.plan-card.featured');
  if (featuredCard) {
    ScrollTrigger.create({
      trigger: featuredCard,
      start: 'top 82%',
      onEnter: () => {
        gsap.fromTo(featuredCard, { scale: 0.95 }, { scale: 1, duration: 0.55, ease: 'back.out(1.5)', delay: 0.13 });
      },
    });
  }

  /* ── Feature items stagger (tarifs.html) ────────────────────── */
  document.querySelectorAll('.plan-features').forEach(list => {
    const items = list.querySelectorAll('.feature');
    if (!items.length) return;
    gsap.set(items, { opacity: 0, x: -12 });
    ScrollTrigger.create({
      trigger: list,
      start: 'top 87%',
      onEnter: () => gsap.to(items, {
        opacity: 1, x: 0, stagger: 0.06, duration: 0.35, ease: 'power2.out',
      }),
    });
  });

  /* ── Profile cards (profil.html — dynamic render) ────────────── */
  const profileGrid = document.getElementById('profile-grid');
  if (profileGrid) {
    const pgObs = new MutationObserver(() => {
      const cards = profileGrid.querySelectorAll('.card');
      if (cards.length < 2) return;
      gsap.from(cards, {
        opacity: 0, y: 24, stagger: 0.09, duration: 0.55, ease: 'power3.out', clearProps: 'all',
      });
      pgObs.disconnect();
    });
    pgObs.observe(profileGrid, { childList: true });

    // Tool links stagger when injected
    const toolObs = new MutationObserver(() => {
      const links = profileGrid.querySelectorAll('.tool-link');
      if (!links.length) return;
      gsap.from(links, {
        opacity: 0, x: -16, stagger: 0.07, duration: 0.4, ease: 'power2.out', delay: 0.3, clearProps: 'all',
      });
      toolObs.disconnect();
    });
    toolObs.observe(profileGrid, { childList: true, subtree: true });
  }

  /* ── Budget / Daily / Coach: reveal sections ─────────────────── */
  const appSections = document.querySelectorAll('.budget-section, .daily-card, .lesson-card, .coach-header');
  if (appSections.length) {
    gsap.from(appSections, {
      opacity: 0, y: 24, stagger: 0.1, duration: 0.55, ease: 'power3.out', delay: 0.2,
    });
  }

  /* ── Static page main content (contact, cgv, mentions, etc.) ─── */
  const staticMain = document.querySelector('.legal-wrap, .contact-wrap, .error-wrap');
  if (staticMain) {
    gsap.from(staticMain, { opacity: 0, y: 32, duration: 0.6, ease: 'power3.out', delay: 0.15 });
  }

  /* ── Auth card (login, signup, forgot, reset) ────────────────── */
  // CSS already animates .auth-card — skip to avoid double animation

  /* ── Magnetic buttons ────────────────────────────────────────── */
  document.querySelectorAll('.hero-cta, .btn-final-cta, .btn-plan-primary').forEach(btn => {
    btn.addEventListener('mousemove', function (e) {
      const r = this.getBoundingClientRect();
      gsap.to(this, {
        x: (e.clientX - r.left - r.width  / 2) * 0.18,
        y: (e.clientY - r.top  - r.height / 2) * 0.18,
        duration: 0.3, ease: 'power2.out', overwrite: 'auto',
      });
    });
    btn.addEventListener('mouseleave', function () {
      gsap.to(this, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
    });
  });

  /* ── Plan card hover glow (tarifs.html) ─────────────────────── */
  document.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('mouseenter', function () {
      gsap.to(this, { y: -6, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    });
    card.addEventListener('mouseleave', function () {
      gsap.to(this, { y: 0, duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });
    });
  });

  /* ── Tool links hover (profil.html) ─────────────────────────── */
  document.querySelectorAll('.tool-link').forEach(link => {
    link.addEventListener('mouseenter', function () {
      gsap.to(this.querySelector('.tool-arrow'), { x: 4, duration: 0.2, ease: 'power2.out' });
    });
    link.addEventListener('mouseleave', function () {
      gsap.to(this.querySelector('.tool-arrow'), { x: 0, duration: 0.25, ease: 'power2.inOut' });
    });
  });

})();
