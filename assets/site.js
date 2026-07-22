/* Launch Rocket — shared site behaviours (progressive enhancement) */
(function () {
  // Sticky nav shadow
  var nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Mobile menu toggle
  var hbg = document.getElementById('hbg');
  var nl = document.getElementById('navLinks');
  if (hbg && nl) {
    hbg.addEventListener('click', function () {
      var o = nl.classList.toggle('open');
      hbg.setAttribute('aria-expanded', o);
    });
    nl.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nl.classList.remove('open');
        hbg.setAttribute('aria-expanded', false);
      });
    });
  }

  // Reveal-on-scroll
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); }
      });
    }, { threshold: 0.09, rootMargin: '0px 0px -36px 0px' });
    reveals.forEach(function (el) { obs.observe(el); });
    window.addEventListener('load', function () {
      reveals.forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('visible'); });
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  // FAQ accordion — one open at a time
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (o) {
        o.classList.remove('open');
        o.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  // Compliance category filter (India Certification page + homepage)
  window.filterC = function (cat, btn) {
    document.querySelectorAll('.comp-tab').forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    document.querySelectorAll('#regGrid .reg-card').forEach(function (c) {
      c.style.display = (cat === 'all' || c.dataset.cat === cat) ? '' : 'none';
    });
  };

  // Insights filter (Insights index page)
  window.filterInsights = function (cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(function (t) { t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    document.querySelectorAll('[data-tags]').forEach(function (c) {
      var tags = (c.getAttribute('data-tags') || '').split(' ');
      c.style.display = (cat === 'all' || tags.indexOf(cat) !== -1) ? '' : 'none';
    });
  };

  // Newsletter form (mailto fallback / endpoint POST)
  var f = document.getElementById('subForm');
  if (f) {
    var NEWSLETTER_ENDPOINT = "";
    var email = document.getElementById('subEmail'),
        btn = document.getElementById('subBtn'),
        msg = document.getElementById('subMsg'),
        hp = f.querySelector('[name=website]');
    function show(t, ok) { if (msg) { msg.textContent = t; msg.className = 'sub-msg show ' + (ok ? 'ok' : 'err'); } }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (hp && hp.value) { return; }
      var v = (email.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { email.classList.add('invalid'); show('Please enter a valid email address.', false); return; }
      email.classList.remove('invalid');
      var orig = btn.textContent; btn.disabled = true; btn.textContent = 'Subscribing…';
      function ok() { show("You're subscribed! We'll email you whenever we publish something new.", true); f.reset(); btn.disabled = false; btn.textContent = orig; }
      function fail() { show("Couldn't reach the server — email care@launchrocket.in and we'll add you.", false); btn.disabled = false; btn.textContent = orig; }
      if (NEWSLETTER_ENDPOINT) {
        var body = new FormData(); body.append('email', v); body.append('fields[email]', v); body.append('EMAIL', v);
        fetch(NEWSLETTER_ENDPOINT, { method: 'POST', body: body, mode: 'no-cors' }).then(ok).catch(fail);
      } else {
        window.location.href = 'mailto:care@launchrocket.in?subject=' + encodeURIComponent('Newsletter subscription') + '&body=' + encodeURIComponent('Please subscribe this email to Launch Rocket updates: ' + v);
        ok();
      }
    });
  }

  // Share buttons (copy link)
  document.querySelectorAll('[data-share-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var uu = b.getAttribute('data-share-copy');
      var ig = b.classList.contains('ig');
      var m = ig ? 'Link copied — paste it into your Instagram story or bio' : 'Link copied to clipboard';
      function toast(t) {
        var el = document.createElement('div'); el.className = 'share-toast'; el.textContent = t;
        document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add('show'); });
        setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 350); }, 2400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(uu).then(function () { toast(m); }).catch(function () { window.prompt('Copy this link:', uu); });
      } else { window.prompt('Copy this link:', uu); }
    });
  });
})();
