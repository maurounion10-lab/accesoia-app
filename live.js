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

  // Banderas de selecciones (nombre ES → emoji). Fallback ⚽.
  var FLAGS = {
    'Argentina': '🇦🇷', 'Brasil': '🇧🇷', 'Francia': '🇫🇷', 'España': '🇪🇸', 'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Portugal': '🇵🇹', 'Alemania': '🇩🇪', 'Países Bajos': '🇳🇱', 'P. Bajos': '🇳🇱', 'Bélgica': '🇧🇪',
    'Italia': '🇮🇹', 'Croacia': '🇭🇷', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'México': '🇲🇽',
    'Estados Unidos': '🇺🇸', 'EE.UU.': '🇺🇸', 'Marruecos': '🇲🇦', 'Japón': '🇯🇵', 'Corea del Sur': '🇰🇷',
    'Senegal': '🇸🇳', 'Suiza': '🇨🇭', 'Dinamarca': '🇩🇰', 'Serbia': '🇷🇸', 'Polonia': '🇵🇱',
    'Suecia': '🇸🇪', 'Noruega': '🇳🇴', 'Ecuador': '🇪🇨', 'Perú': '🇵🇪', 'Chile': '🇨🇱',
    'Paraguay': '🇵🇾', 'Canadá': '🇨🇦', 'Australia': '🇦🇺', 'Ghana': '🇬🇭', 'Nigeria': '🇳🇬',
    'Egipto': '🇪🇬', 'Irán': '🇮🇷', 'Arabia Saudita': '🇸🇦', 'Catar': '🇶🇦', 'Túnez': '🇹🇳',
    'Argelia': '🇩🇿', 'Camerún': '🇨🇲', 'Costa de Marfil': '🇨🇮', 'RD Congo': '🇨🇩', 'Nueva Zelanda': '🇳🇿',
    'N. Zelanda': '🇳🇿', 'Cabo Verde': '🇨🇻', 'Jordania': '🇯🇴', 'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿'
  };
  function flag(name) { return FLAGS[(name || '').trim()] || '⚽'; }

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

    // Pick del día: partido WC pendiente de MÁXIMA confianza (bvr), tiebreak kickoff próximo
    var pend = picks.filter(function (p) { return p.result === 'pending' && p._wcMatch; });
    if (!pend.length) pend = picks.filter(function (p) { return p.result === 'pending'; });
    pend.sort(function (a, b) { return (b.bvr || 0) - (a.bvr || 0) || tsOf(a) - tsOf(b); });
    var dp = pend[0] || null, daily = null;
    if (dp) {
      var favHome = (dp.probH || 0) >= (dp.probA || 0);
      var favName = favHome ? dp.home : dp.away;
      var favPct = Math.max(dp.probH || 0, dp.probA || 0);
      var dt = new Date(tsOf(dp));
      var dstr = isFinite(dt.getTime()) ? (dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) + ' · ' + dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })) : '';
      daily = {
        home: dp.home, away: dp.away, rec: dp.rec || '', fav: favName, favPct: favPct, confPct: favPct,
        dateStr: dstr, league: dp.league || '',
        insight: 'Nuestra IA marca a ' + favName + ' como favorito en este partido (' + favPct + '% de probabilidad), ponderando forma reciente, nivel individual y contexto del cruce.'
      };
    }
    // Partidos vigentes (pendientes WC) para el bloque "El Mundial ahora"
    var upcoming = picks.filter(function (p) { return p.result === 'pending' && p._wcMatch; })
      .sort(function (a, b) { return tsOf(a) - tsOf(b); })
      .map(function (p) {
        var fh = (p.probH || 0) >= (p.probA || 0);
        var dt = new Date(tsOf(p));
        return {
          home: p.home, away: p.away, fav: fh ? p.home : p.away, favPct: Math.max(p.probH || 0, p.probA || 0),
          dateStr: isFinite(dt.getTime()) ? dt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : ''
        };
      });

    // Combinada del día: hasta 3 PARTIDOS reales pendientes (nunca futures de torneo
    // tipo "X gana el Mundial" / "X es goleador" — eso no es una pata de combinada real).
    // Si hay menos de 2 partidos abiertos, no se arma (nunca se inventan patas).
    var isTournamentFuture = /gana el mundial|goleador|llega a (semifinales|cuartos|octavos|la final)/i;
    var allPending = picks.filter(function (p) { return p.result === 'pending' && !isTournamentFuture.test(p.rec || ''); })
      .sort(function (a, b) { return (b.bvr || 0) - (a.bvr || 0) || tsOf(a) - tsOf(b); });
    var combo = null;
    if (allPending.length >= 2) {
      var legs = allPending.slice(0, 3).map(function (p) {
        var o = num(p.odds || p._bestOdds || p._hO) || null;
        return { home: p.home, away: p.away, rec: p.rec || '', odds: o, pct: impliedPct(o) };
      });
      var totalOdds = legs.reduce(function (acc, l) { return l.odds ? acc * l.odds : acc; }, 1);
      var totalPct = legs.reduce(function (acc, l) { return l.pct != null ? acc * (l.pct / 100) : acc; }, 1);
      combo = { legs: legs, totalOdds: totalOdds > 1 ? +totalOdds.toFixed(2) : null, totalPct: Math.round(totalPct * 100) };
    }

    return { champ: champ, acc30: acc30, accAll: accAll, daily: daily, upcoming: upcoming, combo: combo, totalPicks: picks.length };
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
    var dp = data.daily;
    if (dp) {
      setAll('[data-live="pick-home"]', function (el) { el.textContent = dp.home; });
      setAll('[data-live="pick-away"]', function (el) { el.textContent = dp.away; });
      setAll('[data-live="pick-home-flag"]', function (el) { el.textContent = flag(dp.home); });
      setAll('[data-live="pick-away-flag"]', function (el) { el.textContent = flag(dp.away); });
      setAll('[data-live="pick-rec"]', function (el) { el.textContent = dp.rec; });
      setAll('[data-live="pick-conf"]', function (el) { el.textContent = '✓ ' + dp.confPct + '% de probabilidad IA'; });
      setAll('[data-live="pick-info"]', function (el) { el.textContent = '📅 ' + dp.dateStr + ' · 🏟️ Mundial 2026'; });
      setAll('[data-live="pick-insight"]', function (el) { el.innerHTML = '<strong>Análisis IA:</strong> ' + dp.insight; });
    }
    // Bloque "El Mundial ahora": favorito al título + partidos vigentes
    if (top) {
      setAll('[data-live="stage-fav-team"]', function (el) { el.textContent = top.team; });
      setAll('[data-live="stage-fav-pct"]', function (el) { el.textContent = top.pct + '%'; });
    }
    if (data.upcoming && data.upcoming.length) {
      var html = data.upcoming.map(function (m) {
        return '<div class="stage-match"><span class="sm-teams">' + flag(m.home) + ' <b>' + m.home + '</b> vs <b>' + m.away + '</b> ' + flag(m.away) + '</span>' +
          '<span class="sm-fav">Favorito IA: ' + m.fav + ' · ' + m.favPct + '%</span>' +
          (m.dateStr ? '<span class="sm-date">' + m.dateStr + '</span>' : '') + '</div>';
      }).join('');
      setAll('[data-live="stage-matches"]', function (el) { el.innerHTML = html; });
    }
    // Combinada del día
    var comboEmpty = document.querySelector('[data-live="combo-empty"]');
    var comboBody = document.querySelector('[data-live="combo-body"]');
    if (data.combo && data.combo.legs.length >= 2) {
      if (comboBody) comboBody.style.display = '';
      if (comboEmpty) comboEmpty.style.display = 'none';
      setAll('[data-live="combo-odds"]', function (el) { el.textContent = data.combo.totalOdds != null ? data.combo.totalOdds.toFixed(2) : '—'; });
      setAll('[data-live="combo-conf"]', function (el) { el.textContent = data.combo.totalPct + '%'; });
      var legsHtml = data.combo.legs.map(function (l, i) {
        return '<div class="leg"><div class="leg-num">' + (i + 1) + '</div><div class="leg-body">' +
          '<div class="leg-match">' + flag(l.home) + ' ' + l.home + ' vs ' + l.away + ' ' + flag(l.away) + '</div>' +
          '<div class="leg-pick">' + l.rec + '</div></div>' +
          '<div class="leg-odd">' + (l.odds ? l.odds.toFixed(2) : '—') + '</div></div>';
      }).join('');
      setAll('[data-live="combo-legs"]', function (el) { el.innerHTML = legsHtml; });
    } else {
      if (comboBody) comboBody.style.display = 'none';
      if (comboEmpty) comboEmpty.style.display = '';
    }
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
