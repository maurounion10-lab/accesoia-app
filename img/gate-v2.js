/* Hard-gate Mundial 2026 - Gambeta v3 (scroll-cap + X libera)
 * - Aparece al 75% del scroll y DETIENE el scroll
 * - Cruz X visible para cerrar → libera el scroll para seguir leyendo
 * - 🆕 (10-jul-2026 v3) Al cerrar con X: hideGate + libera scroll cap + no reopen.
 *   El user puede llegar al final después de cerrar. No se reabre en 24h.
 */
(function(){
  'use strict';

  // 🆕 (23-jun) FIX: exponer la API ANTES del early return.
  // Antes, si el usuario ya tenía gambeta_lead_ok='1' el IIFE retornaba
  // y window.gambetaOpenGate quedaba undefined → los 7 botones "Obtener
  // Acceso IA" no hacían nada.
  var _alreadyUnlocked = false;
  try { _alreadyUnlocked = (localStorage.getItem('gambeta_lead_ok') === '1'); } catch(e){}

  // 🆕 (10-jul-2026) Si el usuario dismisseó el gate hace <24h, respetarlo:
  // NO abrirlo automáticamente por scroll. Los botones manuales siguen activos.
  var _dismissedRecently = false;
  try {
    var dismissedAt = parseInt(localStorage.getItem('gambeta_gate_dismissed_at_v3') || '0', 10);
    if (dismissedAt && (Date.now() - dismissedAt) < 24 * 3600 * 1000) _dismissedRecently = true;
  } catch(e){}

  if (_alreadyUnlocked) {
    // Usuario ya tiene acceso → los botones "Obtener Acceso IA" abren un
    // diálogo simple agradeciendo + opción de reset
    window.gambetaOpenGate = function(){
      var ok = confirm('Ya tenés acceso a las 2 IAs ✓\n\n¿Querés volver a registrarte con otro email?');
      if (ok) {
        try { localStorage.removeItem('gambeta_lead_ok'); } catch(e){}
        location.reload();
      }
    };
    return;
  }

  var path = location.pathname.replace(/\/$/, '');
  var landing = path.split('/').pop() || 'landing';
  var sourceMap = {
    'predicciones-ia': 'mundial-predicciones',
    'calendario-ia':   'mundial-calendario',
    'estadisticas-ia': 'mundial-estadisticas'
  };
  var source = sourceMap[landing] || 'mundial-otro';

  var gateInjected = false;
  var gateVisible = false;
  var capActive = true;
  var THRESHOLD_PCT = 0.75;

  var css = '\
.gate-backdrop{position:fixed;inset:0;z-index:99998;background:rgba(8,8,14,0.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .35s ease}\
.gate-backdrop.show{display:flex;opacity:1}\
.gate-card{background:linear-gradient(135deg,#161620 0%,#1a1a28 100%);border:1px solid rgba(212,175,55,.4);border-radius:24px;max-width:520px;width:100%;padding:36px 32px 30px;box-shadow:0 30px 80px rgba(0,0,0,.6);position:relative;overflow:hidden;transform:translateY(20px);opacity:0;transition:transform .4s ease,opacity .4s ease}\
.gate-backdrop.show .gate-card{transform:translateY(0);opacity:1}\
.gate-card::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at top right,rgba(212,175,55,.18) 0%,transparent 60%);pointer-events:none}\
.gate-content{position:relative;z-index:1}\
.gate-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;font-weight:300;z-index:99999;transition:background .15s,color .15s,transform .15s}\
.gate-close:hover{background:rgba(255,255,255,.20);color:#fff;transform:scale(1.08)}\
.gate-badge{display:inline-block;background:rgba(212,175,55,.18);color:#f5cd47;border:1px solid rgba(212,175,55,.4);padding:6px 14px;border-radius:100px;font:600 11px/1 "Poppins",system-ui,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:16px}\
.gate-title{font-family:"Anton",sans-serif;font-size:clamp(28px,5vw,40px);line-height:1.05;color:#fff;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}\
.gate-title .g{background:linear-gradient(135deg,#f5cd47 0%,#d4af37 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}\
.gate-desc{font:500 15px/1.5 "Poppins",system-ui,sans-serif;color:rgba(255,255,255,.7);margin-bottom:22px}\
.gate-form{display:flex;flex-direction:column;gap:12px}\
.gate-input{background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.15);color:#fff;padding:16px 18px;border-radius:12px;font:600 16px/1 "Poppins",system-ui,sans-serif;width:100%;outline:none;transition:border-color .2s}\
.gate-input:focus{border-color:#f5cd47}\
.gate-input::placeholder{color:rgba(255,255,255,.4)}\
.gate-btn{background:linear-gradient(135deg,#f5cd47 0%,#d4af37 100%);color:#0a0a0f;border:none;padding:18px 24px;border-radius:12px;font:900 17px/1 "Anton",sans-serif;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;transition:transform .15s;width:100%}\
.gate-btn:hover{transform:translateY(-1px)}\
.gate-btn:disabled{opacity:.6;cursor:wait}\
.gate-features{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 22px}\
.gate-features span{font:600 11px/1 "Poppins",system-ui,sans-serif;color:rgba(255,255,255,.55);background:rgba(255,255,255,.04);padding:6px 12px;border-radius:100px;border:1px solid rgba(255,255,255,.08)}\
.gate-error{background:rgba(200,16,46,.15);border:1px solid rgba(200,16,46,.4);color:#ff8a99;padding:12px 14px;border-radius:10px;font:600 13px/1.4 "Poppins",system-ui,sans-serif;margin-top:10px;display:none}\
.gate-error.show{display:block}\
.gate-fineprint{font:500 11px/1.4 "Poppins",system-ui,sans-serif;color:rgba(255,255,255,.4);text-align:center;margin-top:14px}\
.gate-locked{overflow:hidden!important}\
@media (max-width:480px){\
  .gate-card{padding:30px 22px 26px;border-radius:20px}\
  .gate-features{gap:6px}\
  .gate-features span{padding:5px 10px;font-size:10px}\
  .gate-close{top:10px;right:10px;width:34px;height:34px;font-size:18px}\
}\
';

  function getMaxScrollAllowed(){
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var winH = window.innerHeight;
    var scrollable = docH - winH;
    return Math.floor(scrollable * THRESHOLD_PCT);
  }

  function buildGate(){
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var bd = document.createElement('div');
    bd.id = 'gambeta-gate';
    bd.className = 'gate-backdrop';
    bd.innerHTML = '\
      <div class="gate-card">\
        <button type="button" class="gate-close" id="gate-close" aria-label="Cerrar">×</button>\
        <div class="gate-content">\
          <span class="gate-badge">⚡ ACCESO GRATIS · 2 IAS</span>\
          <h2 class="gate-title">DESBLOQUEÁ <span class="g">2 IAs GRATIS</span> DEL MUNDIAL</h2>\
          <p class="gate-desc">Dejá tu mail y desbloqueá <strong>2 herramientas IA distintas</strong>: predicciones partido a partido + combinadas premium. 100% gratis.</p>\
          <div class="gate-features">\
            <span>🏆 IA #1: Predicciones</span>\
            <span>💰 IA #2: Combinadas</span>\
            <span>⚡ Sin spam</span>\
          </div>\
          <form class="gate-form" id="gate-form" novalidate>\
            <input type="email" class="gate-input" id="gate-email" placeholder="tu@email.com" autocomplete="email" required>\
            <button type="submit" class="gate-btn" id="gate-btn">DESBLOQUEAR LAS 2 IAs →</button>\
            <div class="gate-error" id="gate-error"></div>\
          </form>\
          <p class="gate-fineprint">Sin spam. Podés darte de baja cuando quieras.</p>\
        </div>\
      </div>\
    ';
    document.body.appendChild(bd);
    document.getElementById('gate-close').addEventListener('click', closeGate);
    document.getElementById('gate-form').addEventListener('submit', submitGate);

    // 🆕 (23-jun) cierre por click en backdrop (fuera del card)
    bd.addEventListener('click', function(ev){
      if (ev.target === bd) closeGate();
    });

    // 🆕 (23-jun) cierre con tecla Escape
    document.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape' && gateVisible) closeGate();
    });

    gateInjected = true;
  }

  function showGate(){
    if (!gateInjected) buildGate();
    var bd = document.getElementById('gambeta-gate');
    bd.style.display = 'flex';
    requestAnimationFrame(function(){ bd.classList.add('show'); });
    document.body.classList.add('gate-locked');
    gateVisible = true;
    setTimeout(function(){ try{ document.getElementById('gate-email').focus(); }catch(e){} }, 400);
  }

  function hideGate(){
    var bd = document.getElementById('gambeta-gate');
    if (!bd) return;
    bd.classList.remove('show');
    setTimeout(function(){
      bd.style.display = 'none';
      document.body.classList.remove('gate-locked');
    }, 350);
    gateVisible = false;
  }

  function closeGate(){
    hideGate();
    // 🆕 (10-jul-2026 v3) X funcional: hide popup + LIBERAR scroll cap.
    // El user puede continuar leyendo hasta el final. No reabre por 24h.
    capActive = false;
    _dismissedRecently = true;
    try { localStorage.setItem('gambeta_gate_dismissed_at_v3', String(Date.now())); } catch(e){}
    if (window.gtag) gtag('event','gate_close',{event_category:'mundial-gate', event_label: source});
  }

  function onScroll(){
    // 🆕 (10-jul-2026 v3) Si dismissed, no hacer NADA (ni cap ni show).
    if (_dismissedRecently) return;
    // Si capActive = true (default), aplicar hard-gate: detener scroll al 75%.
    if (!capActive) return;
    var cap = getMaxScrollAllowed();
    var currentY = window.scrollY;
    if (currentY >= cap){
      // Forzar scroll de vuelta al cap y mostrar popup si no está visible
      if (currentY > cap + 5) {
        window.scrollTo({top: cap, behavior: 'auto'});
      }
      if (!gateVisible){
        showGate();
        if (window.gtag) gtag('event','gate_show',{event_category:'mundial-gate', event_label: source});
      }
    }
  }

  var scrollPending = false;
  function onScrollThrottled(){
    if (!scrollPending){
      scrollPending = true;
      requestAnimationFrame(function(){
        onScroll();
        scrollPending = false;
      });
    }
  }

  async function submitGate(e){
    e.preventDefault();
    var err = document.getElementById('gate-error');
    var input = document.getElementById('gate-email');
    var btn = document.getElementById('gate-btn');
    err.classList.remove('show');
    var email = (input.value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      err.textContent = 'Email invalido — revisalo y volve a intentar.';
      err.classList.add('show');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'ENVIANDO…';
    try {
      var res = await fetch('https://api.accesoia.app/api/lead-signup', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email: email, source: source, landing: landing })
      });
      var data = await res.json();
      if (data && data.ok){
        try { localStorage.setItem('gambeta_lead_ok', '1'); if (window.__gambetaUnlockReal) window.__gambetaUnlockReal(); else document.body.classList.add('unlocked'); } catch(e){}
        if (window.gtag) gtag('event','lead_capture',{event_category:'mundial-gate', event_label: source});
        location.href = (data.redirect || '/mundial/eleccion');
      } else {
        err.textContent = (data && data.error) ? 'Error: ' + data.error : 'No pudimos suscribirte. Probá de nuevo.';
        err.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'DESBLOQUEAR LAS 2 IAs →';
      }
    } catch (ex) {
      var detail = ex && (ex.name + ': ' + ex.message) || 'unknown';
      err.textContent = 'Error temporal (' + detail + '). Probá de nuevo en unos segundos, o usá Telegram mientras tanto.';
      err.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'DESBLOQUEAR LAS 2 IAs →';
      if (window.gtag) gtag('event','gate_fetch_error',{event_category:'mundial-gate', event_label: detail.slice(0,80)});
    }
  }

  function init(){
    window.addEventListener('scroll', onScrollThrottled, { passive: true });
    onScroll();

    // === Inyectar CSS premium para blurs ===
    var style = document.createElement('style');
    style.textContent = [
      '.has-blur-content{position:relative;cursor:pointer;transition:transform .2s ease}',
      '.has-blur-content:hover{transform:translateY(-2px)}',
      '.has-blur-content::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at center,rgba(212,175,55,.12) 0%,rgba(0,0,0,0) 60%);pointer-events:none;z-index:2;border-radius:inherit;opacity:0;transition:opacity .25s ease}',
      '.has-blur-content:hover::after{opacity:1}',
      '.unlock-cta{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;background:linear-gradient(135deg,#f5cd47 0%,#d4af37 100%);color:#0a0a0f;padding:10px 16px;border-radius:999px;font-size:.78rem;font-weight:900;letter-spacing:.5px;text-transform:uppercase;box-shadow:0 8px 24px rgba(212,175,55,.4),0 2px 6px rgba(0,0,0,.4);display:inline-flex;align-items:center;gap:6px;opacity:.92;transition:all .25s ease;pointer-events:none;white-space:nowrap}',
      '.unlock-cta::before{content:"🔒";font-size:.85rem}',
      '.has-blur-content:hover .unlock-cta{opacity:1;transform:translate(-50%,-50%) scale(1.06);box-shadow:0 12px 32px rgba(212,175,55,.55),0 2px 6px rgba(0,0,0,.5)}',
      '.unlock-mini{display:inline-flex;align-items:center;gap:4px;background:rgba(212,175,55,.18);border:1px solid rgba(212,175,55,.45);color:#f5cd47;padding:1px 8px;border-radius:999px;font-size:.7rem;font-weight:800;margin-left:4px;vertical-align:middle;cursor:pointer;transition:all .2s}',
      '.unlock-mini:hover{background:rgba(212,175,55,.32)}',
      'body.unlocked [style*="blur("],body.unlocked [data-spoiler]{filter:none!important;transform:none!important;user-select:auto!important}',
      'body.unlocked .has-blur-content::after,body.unlocked .unlock-cta,body.unlocked .unlock-mini{display:none!important}',
      'body.unlocked img[data-spoiler],body.unlocked div[data-spoiler]{filter:none!important}'
    ].join('');
    document.head.appendChild(style);

    // === Helper: reemplazar texto tachado por valor real ===
    function unlockRealValues(){
      document.body.classList.add('unlocked');
      var nodes = document.querySelectorAll('[data-real]');
      nodes.forEach(function(n){
        var real = n.getAttribute('data-real');
        if (!real) return;
        // Si el nodo tiene un <small> hijo, conservarlo
        var small = n.querySelector('small');
        if (small){
          // textContent del nodo principal sin tocar small
          // Limpiar y reagregar
          while (n.firstChild && n.firstChild.nodeType === 3) n.removeChild(n.firstChild);
          n.insertBefore(document.createTextNode(real), n.firstChild);
        } else {
          n.textContent = real;
        }
      });
    }

    // === Si ya está unlocked, marcar body y desbloquear textos ===
    try {
      if (localStorage.getItem('gambeta_lead_ok') === '1') {
        unlockRealValues();
        return;
      }
    } catch(_){}

    // Exponer para uso post-mail
    window.__gambetaUnlockReal = unlockRealValues;

    // === Marcar cards que contienen blureados ===
    function markBlurCards(){
      var candidates = document.querySelectorAll(
        '.premio-card, .team-card, .bar-row, .match-card, .stat-card, .hero-img-wrap, .group-card, .candidata-card'
      );
      candidates.forEach(function(card){
        var hasBlur = card.querySelector('[data-spoiler], [style*="blur("]');
        if (hasBlur && !card.classList.contains('has-blur-content')){
          card.classList.add('has-blur-content');
          // Añadir cartel DESBLOQUEAR centrado
          if (!card.querySelector('.unlock-cta')){
            var cta = document.createElement('div');
            cta.className = 'unlock-cta';
            cta.textContent = 'Desbloquear';
            card.appendChild(cta);
          }
        }
      });
      // Auto-detectar otros containers que tengan blureados directos
      var allBlurs = document.querySelectorAll('[data-spoiler], [style*="blur("]');
      allBlurs.forEach(function(b){
        // Buscar primer padre con position relative o un block container claro
        var p = b.parentElement;
        var hops = 0;
        while (p && hops < 3){
          if (p.classList.contains('has-blur-content')) return;
          var tag = (p.tagName||'').toLowerCase();
          // Si es un container claro y NO es la card principal del flujo
          if (tag === 'div' && p.offsetWidth > 80 && p.offsetHeight > 40 && !p.querySelector('.unlock-cta')){
            // Verificar que sea un contenedor cohesivo (no body)
            if (p !== document.body && p.tagName !== 'SECTION' && p.tagName !== 'MAIN'){
              p.classList.add('has-blur-content');
              var cta = document.createElement('div');
              cta.className = 'unlock-cta';
              cta.textContent = 'Desbloquear';
              p.appendChild(cta);
              return;
            }
          }
          p = p.parentElement;
          hops++;
        }
      });
    }
    markBlurCards();

    // === Click en cualquier elemento blureado/cartel abre el gate ===
    document.addEventListener('click', function(e){
      try { if (localStorage.getItem('gambeta_lead_ok') === '1') return; } catch(_){}
      var ignore = e.target.closest && e.target.closest('#mundial-gate-overlay, .gate-form, .lead-form-cta, .sticky-btn, .sticky-bar, a.brand, nav a, header a, button[type="submit"]');
      if (ignore) return;
      var el = e.target;
      var hops = 0;
      function isBlurredDeep(node){
        if (!node) return false;
        if (node.classList && node.classList.contains('has-blur-content')) return true;
        if (node.classList && (node.classList.contains('unlock-cta') || node.classList.contains('unlock-mini'))) return true;
        var inline = (node.getAttribute && node.getAttribute('style')) || '';
        if (inline.indexOf('blur(') !== -1) return true;
        if (node.hasAttribute && node.hasAttribute('data-spoiler')) return true;
        try { var cs = window.getComputedStyle(node); if (cs && cs.filter && cs.filter.indexOf('blur') !== -1) return true; } catch(_){}
        var txt = (node.textContent || '').trim();
        if (txt && /^[█▌▐▓?]+$/.test(txt.replace(/\s/g, ''))) return true;
        try { if (node.querySelector && node.querySelector('[data-spoiler], [style*="blur("]')) return true; } catch(_){}
        return false;
      }
      while (el && hops < 5){
        if (isBlurredDeep(el)) {
          var tag = (el.tagName||'').toLowerCase();
          if (tag !== 'button' && tag !== 'a' && tag !== 'input' && tag !== 'select' && tag !== 'textarea') {
            e.preventDefault(); e.stopPropagation(); showGate();
            if(window.gtag) gtag('event','spoiler_click_open_gate',{event_category:'mundial-gate'});
            return;
          }
        }
        el = el.parentElement;
        hops++;
      }
    }, true);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(init, 300);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 300); });
  }

  // Exponer API pública para abrir el gate desde otros elementos (banner sticky, CTAs, etc)
  // SIEMPRE abre, aunque el usuario ya esté unlocked (por si quiere recuperar acceso)
  window.gambetaOpenGate = function(){
    showGate();
    if (window.gtag) gtag('event','gate_manual_open',{event_category:'mundial-gate', event_label: source});
    return true;
  };
})();
