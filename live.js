/* ════════════════════════════════════════════════════════════════════════
 * live.js — auto-update de accesoia.app desde gambeta.ai
 * Toma data en vivo del endpoint público de gambeta (CORS abierto) y
 * actualiza predicciones/ranking sin que nadie edite HTML. 100% NEUTRO
 * (probabilidades, nunca cuotas/apuestas) → Meta-Ads safe.
 *
 * Rellena cualquier elemento con:
 *   data-live="fav-pct"      → % del favorito al título (nº1 del ranking)
 *   data-live="fav-team"     → nombre del favorito al título
 *   data-live="acc"          → % de acierto (ventana 30 días)
 *   data-live="total-picks"  → total de análisis publicados
 *   data-live-real="fav"     → setea el atributo data-real del hero borroso
 * Y emite window 'accesoia:live' con {champ, acc30, daily, ...} para render custom.
 * Si el fetch falla, NO toca nada (queda el contenido estático). Sin dependencias.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ENDPOINTS = [
    'https://gambeta.ai/api/sb?type=historial',
    'https://api.accesoia.app/api/sb?type=historial' // fallback (bypass adblock)
  ];

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function impliedPct(odds) { var o = num(odds); return (o && o > 1) ? Math.round(100 / o) : null; }
  function tsOf(p) { return p.commenceTs || (p.date ? Date.parse(p.date) : 0) || 0; }

  function compute(picks) {
    var now = Date.now(), DAY = 86400000;
    var resolved = picks.filter(function (p) { return p.result === 'win' || p.result === 'loss'; });
    var win = function (arr) { return arr.filter(function (p) { return p.result === 'win'; }).length; };
    var last30 = resolved.filter(function (p) { var t = tsOf(p); return t && (now - t) <= 30 * DAY; });
    var acc30 = last30.length ? Math.round(100 * win(last30) / last30.length) : null;
    var accAll = resolved.length ? Math.round(100 * win(resolved) / resolved.length) : null;

    // Ranking de campeón: futures "X gana el Mundial 2026" → probabilidad implícita
    var seen = {}, champ = [];
    picks.forEach(function (p) {
      if (!/gana el mundial/i.test(p.rec || '')) return;
      var team = (p.rec || '').replace(/\s+gana el mundial.*/i, '').trim();
      var pct = impliedPct(p.odds || p._bestOdds || p._hO);
      if (!team || !pct || seen[team]) return;
      seen[team] = 1; champ.push({ team: team, pct: pct });
    });
    champ.sort(function (a, b) { return b.pct - a.pct; });

    // Pick del día: próximo partido pendiente (favorito por probabilidad, sin cuota)
    var upcoming = picks.filter(function (p) { return p.result === 'pending' && p._wcMatch && tsOf(p) >= now - DAY; })
      .sort(function (a, b) { return tsOf(a) - tsOf(b); });
    var d = upcoming[0] || null, daily = null;
    if (d) {
      var favHome = (d.probH || 0) >= (d.probA || 0);
      daily = { home: d.home, away: d.away, fav: favHome ? d.home : d.away, favPct: Math.max(d.probH || 0, d.probA || 0), league: d.league };
    }
    return { champ: champ, acc30: acc30, accAll: accAll, daily: daily, totalPicks: picks.length };
  }

  function setAll(sel, fn) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) fn(els[i]); }

  function render(data) {
    var top = data.champ[0];
    if (top) {
      setAll('[data-live="fav-pct"]', function (el) { el.textContent = top.pct + '%'; });
      setAll('[data-live="fav-team"]', function (el) { el.textContent = top.team; });
      setAll('[data-live-real="fav"]', function (el) {
        el.setAttribute('data-real', top.pct + '%');
        if (!/blur/.test(el.getAttribute('style') || '')) el.textContent = top.pct + '%';
      });
    }
    if (data.acc30 != null) setAll('[data-live="acc"]', function (el) { el.textContent = data.acc30 + '%'; });
    if (data.totalPicks) setAll('[data-live="total-picks"]', function (el) { el.textContent = data.totalPicks.toLocaleString('es-AR'); });
    try { window.dispatchEvent(new CustomEvent('accesoia:live', { detail: data })); } catch (e) {}
  }

  function tryFetch(i) {
    if (i >= ENDPOINTS.length) return;
    fetch(ENDPOINTS[i], { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        var picks = (j && j[0] && j[0].historial_full) || [];
        if (picks.length) render(compute(picks));
      })
      .catch(function () { tryFetch(i + 1); });
  }

  function boot() { tryFetch(0); }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
