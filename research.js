// Catapult Research Script - paste entire file content into console
(function() {
  if (document.getElementById("ctr-overlay")) {
    document.getElementById("ctr-overlay").remove();
    return;
  }

  var o = document.createElement("div");
  o.id = "ctr-overlay";
  o.style.cssText = "position:fixed;top:0;right:0;width:400px;height:100vh;z-index:999999;background:#07080a;border-left:1px solid #1c2028;font-family:monospace;font-size:12px;color:#dde6f0;overflow-y:auto;box-shadow:-4px 0 20px rgba(0,0,0,0.8)";
  o.innerHTML = [
    '<div style="padding:14px;border-bottom:1px solid #1c2028;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#07080a">',
    '<div style="width:7px;height:7px;border-radius:50%;background:#00ff88"></div>',
    '<b style="color:#00ff88">CATAPULT RESEARCH</b>',
    '<button id="ctr-close" style="margin-left:auto;background:transparent;border:1px solid #333;color:#666;border-radius:4px;padding:2px 8px;cursor:pointer">x</button>',
    '</div>',
    '<div id="ctr-body" style="padding:14px">Загружаю...</div>'
  ].join("");
  document.body.appendChild(o);
  document.getElementById("ctr-close").onclick = function() { o.remove(); };

  var body = document.getElementById("ctr-body");

  function gql(b) {
    return fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b)
    }).then(function(r) { return r.json(); });
  }

  var q1 = "query TurboTokenList($pagination:CursorPaginationInput!,$sort:TurboTokenListSortInput,$filter:TurboTokenListFilterInput){turboTokenList(pagination:$pagination,sort:$sort,filter:$filter){items{id name symbol speedMode startDate endDate price buysCount sellsCount uniqueTradersCount volumeUsdtDrops}}}";
  var q2 = "query TurboTokenChartData($tokenId:String!){turboTokenChartData(tokenId:$tokenId){currentPrice s15{close high low open time}s30{close high low open time}m1{close high low open time}total{close high low open time}}}";

  function rsi(p, n) {
    if (p.length < n + 1) return null;
    var g = 0, l = 0;
    for (var i = p.length - n; i < p.length; i++) {
      var d = p[i] - p[i-1];
      if (d > 0) g += d; else l -= d;
    }
    if (l === 0) return 100;
    return Math.round(100 - 100 / (1 + (g/n) / (l/n)));
  }

  function analyze(token, chart) {
    if (!chart) return null;
    var c = chart.m1 && chart.m1.length >= 5 ? chart.m1
      : chart.s30 && chart.s30.length >= 5 ? chart.s30
      : chart.s15 && chart.s15.length >= 5 ? chart.s15
      : chart.total;
    if (!c || c.length < 3) return null;
    var cl = c.map(function(x) { return parseFloat(x.close); });
    var first = cl[0], last = cl[cl.length-1];
    var chg = first > 0 ? ((last - first) / first * 100) : 0;
    var f3 = c.slice(0, Math.min(3, c.length));
    var f3up = f3.filter(function(x) { return parseFloat(x.close) >= parseFloat(x.open); }).length;
    var c0up = parseFloat(c[0].close) >= parseFloat(c[0].open);
    var er = cl.length >= 6 ? rsi(cl.slice(0, 6), 5) : null;
    var streak = 1, sdir = c0up ? 1 : -1;
    for (var i = 1; i < Math.min(5, c.length); i++) {
      var d = parseFloat(c[i].close) >= parseFloat(c[i].open) ? 1 : -1;
      if (d === sdir) streak++; else break;
    }
    var maxH = Math.max.apply(null, cl), minL = Math.min.apply(null, cl);
    return {
      speed: token.speedMode,
      finalDir: chg > 0 ? "LONG" : "SHORT",
      f3bull: f3up >= 2,
      c0up: c0up,
      earlyRsi: er,
      streak: streak,
      streakUp: sdir === 1,
      maxGain: parseFloat(((maxH - first) / first * 100).toFixed(1)),
      maxDrop: parseFloat(((minL - first) / first * 100).toFixed(1))
    };
  }

  function render(data) {
    var ps = [
      { name: "1-я свеча вверх", f: function(a) { return a.c0up; } },
      { name: "1-я свеча вниз", f: function(a) { return !a.c0up; } },
      { name: "Первые 3 бычьи", f: function(a) { return a.f3bull; } },
      { name: "Первые 3 медвежьи", f: function(a) { return !a.f3bull; } },
      { name: "RSI>60 на старте", f: function(a) { return a.earlyRsi !== null && a.earlyRsi > 60; } },
      { name: "RSI<40 на старте", f: function(a) { return a.earlyRsi !== null && a.earlyRsi < 40; } },
      { name: "3+ свечей вверх", f: function(a) { return a.streak >= 3 && a.streakUp; } },
      { name: "3+ свечей вниз", f: function(a) { return a.streak >= 3 && !a.streakUp; } }
    ];

    ps.forEach(function(p) {
      p.total = 0; p.long = 0;
      data.forEach(function(a) { if (p.f(a)) { p.total++; if (a.finalDir === "LONG") p.long++; } });
      p.pct = p.total > 0 ? Math.round(p.long / p.total * 100) : 50;
      p.edge = Math.abs(p.pct - 50);
    });
    ps = ps.filter(function(p) { return p.total >= 3; }).sort(function(a, b) { return b.edge - a.edge; });

    var sp = {};
    data.forEach(function(a) {
      if (!sp[a.speed]) sp[a.speed] = { t: 0, l: 0, g: 0, d: 0 };
      sp[a.speed].t++;
      if (a.finalDir === "LONG") sp[a.speed].l++;
      sp[a.speed].g += a.maxGain;
      sp[a.speed].d += a.maxDrop;
    });
    Object.keys(sp).forEach(function(k) {
      var x = sp[k];
      x.pct = Math.round(x.l / x.t * 100);
      x.ag = (x.g / x.t).toFixed(1);
      x.ad = (x.d / x.t).toFixed(1);
    });

    // Save to localStorage
    var stats = { savedAt: new Date().toISOString(), total: data.length, patterns: {}, speeds: {} };
    ps.forEach(function(p) { stats.patterns[p.name] = { total: p.total, longPct: p.pct, edge: p.edge }; });
    Object.keys(sp).forEach(function(k) { stats.speeds[k] = { total: sp[k].t, longPct: sp[k].pct, avgGain: sp[k].ag, avgDrop: sp[k].ad }; });
    var saved = false;
    try { localStorage.setItem("catapult_research_stats", JSON.stringify(stats)); saved = true; } catch(e) {}

    var rows = "";
    rows += saved
      ? "<div style=\"background:rgba(0,255,136,0.07);border:1px solid rgba(0,255,136,0.2);border-radius:7px;padding:10px;margin-bottom:12px;font-size:11px;color:#00ff88\">Сохранено: " + data.length + " токенов · " + new Date().toLocaleTimeString("ru-RU") + "</div>"
      : "<div style=\"color:#ff3366;margin-bottom:10px\">Ошибка сохранения</div>";

    ps.forEach(function(p) {
      var ec = p.edge >= 15 ? "#00ff88" : p.edge >= 8 ? "#f5a623" : "#7a8898";
      var dir = p.pct > 50 ? "LONG" : "SHORT";
      var dirc = p.pct > 50 ? "#00ff88" : "#ff3366";
      rows += "<div style=\"background:#0a0c0f;border:1px solid #1c2028;border-radius:7px;padding:10px;margin-bottom:8px\">";
      rows += "<div style=\"font-size:11px;font-weight:700;margin-bottom:6px\">" + p.name + " <span style=\"color:#353d4a;font-size:9px\">(" + p.total + " шт)</span></div>";
      rows += "<div style=\"height:4px;background:#151820;border-radius:2px;margin-bottom:6px\"><div style=\"height:100%;width:" + p.pct + "%;background:#00ff88;border-radius:2px\"></div></div>";
      rows += "<div style=\"display:flex;justify-content:space-between;font-size:10px\">";
      rows += "<span style=\"color:" + dirc + ";font-weight:700\">" + dir + " " + Math.max(p.pct, 100-p.pct) + "%</span>";
      rows += "<span style=\"color:" + ec + "\">EDGE " + (p.pct-50>0?"+":"") + (p.pct-50) + "%" + (p.edge>=15?" F":p.edge>=8?" E":"") + "</span>";
      rows += "</div></div>";
    });

    rows += "<div style=\"font-size:9px;color:#353d4a;margin:12px 0 8px;letter-spacing:0.1em\">ПО СКОРОСТЯМ</div>";
    Object.keys(sp).forEach(function(k) {
      var x = sp[k];
      var sn = k === "FLASH" ? "flash" : k === "FAST" ? "fast" : "crack";
      rows += "<div style=\"display:flex;gap:8px;padding:8px;background:#0a0c0f;border:1px solid #1c2028;border-radius:7px;margin-bottom:6px;font-size:11px;align-items:center\">";
      rows += "<span style=\"color:#00ff88;min-width:50px;font-weight:700\">" + sn + "</span>";
      rows += "<span style=\"color:#353d4a;min-width:30px\">" + x.t + "шт</span>";
      rows += "<span style=\"color:" + (x.pct>55?"#00ff88":x.pct<45?"#ff3366":"#dde6f0") + ";font-weight:700;min-width:45px\">" + x.pct + "%L</span>";
      rows += "<span style=\"color:#00ff8877\">+" + x.ag + "%</span>";
      rows += "<span style=\"color:#ff336677\">" + x.ad + "%</span>";
      rows += "</div>";
    });

    body.innerHTML = rows;
  }

  Promise.all([
    gql({ query: q1, variables: { filter: { rank: "Public" }, pagination: { limit: 60 }, sort: { direction: "Desc", field: "Volume" } } }),
    gql({ query: q1, variables: { filter: { rank: "Public" }, pagination: { limit: 60 }, sort: { direction: "Desc", field: "DeployedAt" } } })
  ]).then(function(pages) {
    var seen = {}, tokens = [];
    pages.forEach(function(p) {
      var items = (p && p.data && p.data.turboTokenList && p.data.turboTokenList.items) || [];
      items.forEach(function(t) {
        if (!seen[t.id] && ["FLASH", "FAST", "CRACK"].indexOf(t.speedMode) >= 0) {
          seen[t.id] = true;
          tokens.push(t);
        }
      });
    });

    body.innerHTML = "Загружаю графики " + tokens.length + " токенов...";
    var results = [], idx = 0;

    function next() {
      if (idx >= tokens.length) {
        var analyses = results.map(function(r) { return analyze(r.token, r.chart); }).filter(Boolean);
        render(analyses);
        return;
      }
      var t = tokens[idx++];
      body.innerHTML = "Загружаю " + idx + "/" + tokens.length + ": " + t.name;
      gql({ query: q2, variables: { tokenId: t.id } }).then(function(cd) {
        results.push({ token: t, chart: cd && cd.data && cd.data.turboTokenChartData });
        setTimeout(next, 60);
      }).catch(function() {
        results.push({ token: t, chart: null });
        setTimeout(next, 60);
      });
    }
    next();
  }).catch(function(e) { body.innerHTML = "Ошибка: " + e.message; });
})();
