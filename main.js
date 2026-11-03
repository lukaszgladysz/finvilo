(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  // ?shot: tryb do zrzutu całej strony – wszystko od razu w stanie końcowym, jak przy ograniczonym ruchu
  const shot = /[?&]shot\b/.test(location.search);
  if (shot) document.documentElement.classList.add('is-shot');
  const reduce = shot || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const monthWord = (n) => {
    if (n === 1) return 'miesiąc';
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'miesiące' : 'miesięcy';
  };
  const dateIn = (months) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    return new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(d);
  };

  // kolory do interpolacji: quiet -> violet
  const Q = [201, 194, 211], V = [106, 79, 209];
  const mix = (t) => `rgb(${Q.map((q, i) => Math.round(lerp(q, V[i], t))).join(',')})`;
  const mixC = (a, b, t) => `rgb(${a.map((x, i) => Math.round(lerp(x, b[i], t))).join(',')})`;
  // kolory rozproszonych wydatków: koral, słońce, mięta, róż, lawenda
  const CHAOS = [[255, 107, 74], [255, 194, 71], [34, 184, 147], [226, 90, 199], [183, 166, 244]];

  // gładka krzywa przez punkty (Catmull-Rom -> Bezier)
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function seeded(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= Opowieść ================= */
  const story = $('#historia');
  const stage = story.querySelector('.story__stage');
  const svg = $('#storySvg');
  const chapters = [...story.querySelectorAll('.chapter')];
  const storyTags = $('#storyTags');
  const LABELS = ['Rata 1 850 zł', 'Zakupy', 'Prąd', 'Przedszkole', 'Paliwo', 'Prezent dla mamy', 'Ubezpieczenie', 'Abonamenty', 'A wakacje?'];
  let S = null; // geometria i węzły

  function buildStory() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const mobile = W < 760;
    const N = mobile ? 24 : 34;
    const f = mobile
      ? { x0: W * 0.07, x1: W * 0.93, y0: Math.max(chapters[0].offsetTop + chapters[0].offsetHeight + 18, H * 0.55), y1: H * 0.96 }
      : { x0: W * 0.52, x1: W * 0.95, y0: H * 0.17, y1: H * 0.86 };
    // tagi siedzą nad polem punktów, w tej samej kolumnie co wizualizacja
    if (storyTags && !story.classList.contains('is-static')) {
      storyTags.style.left = `${f.x0}px`;
      storyTags.style.top = `${f.y0 - (mobile ? 6 : 58)}px`;
      if (mobile) {
        storyTags.style.display = '';
        const th = storyTags.offsetHeight + 12;
        // na niskich ekranach nie ma miejsca na tagi i punkty naraz – zostają same punkty
        if (f.y1 - (f.y0 + th) < 150) storyTags.style.display = 'none'; else f.y0 += th;
      }
    }
    const rnd = seeded(7);
    const cols = mobile ? 6 : 7, rows = mobile ? 4 : 5;
    const cw = (f.x1 - f.x0) / cols, ch = (f.y1 - f.y0) / rows;
    const cells = [...Array(cols * rows).keys()].sort(() => rnd() - 0.5);
    const scatter = [], line = [], size = [];
    for (let i = 0; i < N; i++) {
      const c = cells[i];
      size.push(2.6 + 5 * Math.pow(rnd(), 1.6)); // różne kwoty = różne punkty
      scatter.push([f.x0 + ((c % cols) + 0.15 + 0.7 * rnd()) * cw, f.y0 + (Math.floor(c / cols) + 0.15 + 0.7 * rnd()) * ch]);
    }
    const lx0 = f.x0 + 6, lx1 = f.x1 - (mobile ? 26 : 40), ly0 = f.y1 - 10, ly1 = f.y0 + (mobile ? 30 : 46);
    const curve = (t) => {
      const s = 0.5 * t + 0.5 * t * t * (3 - 2 * t);
      return [lerp(lx0, lx1, t), lerp(ly0, ly1, s)];
    };
    for (let i = 0; i < N; i++) line.push(curve((i / (N - 1)) * 0.93));
    const goal = curve(1);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';
    const defs = el('defs', {}, svg);
    const lg = el('linearGradient', { id: 'lineGrad', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#6A4FD1' }, lg);
    el('stop', { offset: .6, 'stop-color': '#E25AC7' }, lg);
    el('stop', { offset: 1, 'stop-color': '#22B893' }, lg);
    const ag = el('linearGradient', { id: 'areaGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#B7A6F4', 'stop-opacity': .55 }, ag);
    el('stop', { offset: 1, 'stop-color': '#B7A6F4', 'stop-opacity': 0 }, ag);
    const area = el('path', { class: 'st-area', opacity: 0 }, svg);
    const thread = el('path', { class: 'st-thread', pathLength: 1, 'stroke-dasharray': 1 }, svg);
    const threadC = el('path', { class: 'st-thread', stroke: 'url(#lineGrad)', opacity: 0 }, svg);
    const ringG = el('g', {}, svg);
    el('circle', { class: 'st-ring', r: 15 }, ringG);
    const ringFill = el('circle', { class: 'st-ring-fill', r: 15, pathLength: 1, 'stroke-dasharray': 1, transform: 'rotate(-90)' }, ringG);
    const ringCore = el('circle', { class: 'st-ring-core', r: 7 }, ringG);
    const goalTxt = el('text', { class: 'st-goal', 'text-anchor': 'end' }, svg);
    goalTxt.textContent = 'Wasz cel';
    const dots = line.map(() => el('circle', { r: 4.5 }, svg));
    // podpisy tylko przy punktach, które mają wokół siebie miejsce
    const labelIdx = [];
    const gap = mobile ? 92 : 140;
    for (let i = 0; i < N && labelIdx.length < (mobile ? 5 : 9); i++) {
      const [x, y] = scatter[i];
      if (labelIdx.every((j) => Math.hypot(scatter[j][0] - x, (scatter[j][1] - y) * 1.8) > gap)) labelIdx.push(i);
    }
    const texts = mobile ? ['Rata 1 850 zł', 'Zakupy', 'Przedszkole', 'Paliwo', 'A wakacje?'] : LABELS;
    const labels = labelIdx.map((idx, k) => {
      const n = el('text', { class: 'st-label' }, svg);
      n.textContent = texts[k];
      n.dataset.idx = idx;
      return n;
    });
    const stepIdx = [0.16, 0.5, 0.84].map((t) => Math.round(t * (N - 1)));
    const steps = stepIdx.map((_, k) => {
      const g = el('g', { class: k === 0 ? 'st-step is-live' : 'st-step' }, svg);
      el('circle', { r: 13 }, g);
      el('text', {}, g).textContent = k + 1;
      return g;
    });
    S = { W, H, N, size, threadC, colors: line.map((_, i) => CHAOS[i % CHAOS.length]), scatter, line, goal, area, thread, dots, labels, ringG, ringFill, ringCore, goalTxt, steps, stepIdx, bottom: f.y1 + 4, mobile };
  }

  const bands = [[-1, 0, 0.09, 0.14], [0.11, 0.16, 0.38, 0.43], [0.41, 0.46, 0.69, 0.74], [0.71, 0.76, 2, 3]];

  function renderStory(p, time) {
    if (!S) return;
    const s1 = clamp((p - 0.1) / 0.3);
    const q = clamp((p - 0.42) / 0.28);
    const s3 = clamp((p - 0.72) / 0.22);
    const pts = [];
    for (let i = 0; i < S.N; i++) {
      const local = easeInOut(clamp(q * 1.5 - (i / (S.N - 1)) * 0.5));
      const amp = (1 - local) * (reduce ? 0 : 4);
      const x = lerp(S.scatter[i][0], S.line[i][0], local) + Math.sin(time * 0.0007 + i * 1.7) * amp;
      const y = lerp(S.scatter[i][1], S.line[i][1], local) + Math.cos(time * 0.0006 + i * 2.3) * amp;
      pts.push([x, y]);
      const d = S.dots[i];
      d.setAttribute('cx', x.toFixed(1));
      d.setAttribute('cy', y.toFixed(1));
      const gt = i / (S.N - 1); // kolor na linii = kolor gradientu w tym miejscu
      const lineCol = gt < 0.6 ? [lerp(106, 226, gt / 0.6), lerp(79, 90, gt / 0.6), lerp(209, 199, gt / 0.6)] : [lerp(226, 34, (gt - 0.6) / 0.4), lerp(90, 184, (gt - 0.6) / 0.4), lerp(199, 147, (gt - 0.6) / 0.4)];
      d.setAttribute('fill', mixC(S.colors[i], lineCol, local));
      d.setAttribute('r', lerp(S.size[i], 3.8, local).toFixed(2));
    }
    const last = S.scatter[S.N - 1];
    const gq = easeInOut(q);
    const threadPts = pts.concat([[lerp(last[0], S.goal[0], gq), lerp(last[1], S.goal[1], gq)]]);
    S.thread.setAttribute('d', smoothPath(threadPts));
    S.thread.setAttribute('stroke-dashoffset', (1 - Math.max(s1, q > 0 ? 1 : 0)).toFixed(4));
    S.thread.setAttribute('stroke', mix(q));
    S.thread.setAttribute('stroke-width', (1.3 + 2.2 * q).toFixed(2));
    S.thread.setAttribute('opacity', (0.75 * (1 - q)).toFixed(2));
    S.threadC.setAttribute('d', S.thread.getAttribute('d'));
    S.threadC.setAttribute('opacity', q.toFixed(3));
    S.threadC.setAttribute('stroke-width', (1.3 + 2.7 * q).toFixed(2));

    const areaOp = clamp((q - 0.65) / 0.35) * 0.75;
    S.area.setAttribute('opacity', areaOp.toFixed(3));
    if (areaOp > 0) {
      S.area.setAttribute('d', smoothPath(threadPts) + `L${S.goal[0]},${S.bottom}L${threadPts[0][0]},${S.bottom}Z`);
    }

    const labOp = (1 - clamp((s1 - 0.35) / 0.5)) * (1 - q);
    S.labels.forEach((n) => {
      const [x, y] = pts[n.dataset.idx];
      const right = x > S.W - 130;
      n.setAttribute('x', (right ? x - 10 : x + 10).toFixed(1));
      n.setAttribute('y', (y + 4).toFixed(1));
      n.setAttribute('text-anchor', right ? 'end' : 'start');
      n.setAttribute('opacity', labOp.toFixed(3));
    });

    const rs = easeOut(clamp((q - 0.55) / 0.45));
    S.ringG.setAttribute('transform', `translate(${S.goal[0]},${S.goal[1]}) scale(${rs.toFixed(3)})`);
    S.ringFill.setAttribute('stroke-dashoffset', (1 - easeInOut(s3)).toFixed(4));
    S.ringCore.setAttribute('transform', `scale(${easeOut(clamp((s3 - 0.85) / 0.15)).toFixed(3)})`);
    S.goalTxt.setAttribute('x', S.goal[0] - 26);
    S.goalTxt.setAttribute('y', S.goal[1] - 22);
    S.goalTxt.setAttribute('opacity', rs.toFixed(3));

    S.steps.forEach((g, k) => {
      const o = easeOut(clamp((s3 - k * 0.22) / 0.25));
      const [x, y] = pts[S.stepIdx[k]];
      g.setAttribute('transform', `translate(${x.toFixed(1)},${(y - 26 - (1 - o) * 10).toFixed(1)})`);
      g.setAttribute('opacity', o.toFixed(3));
    });

    if (!story.classList.contains('is-static')) {
      chapters.forEach((c, k) => {
        const [a, b, cc, d] = bands[k];
        const o = Math.min(clamp((p - a) / (b - a)), 1 - clamp((p - cc) / (d - cc)));
        c.style.opacity = o.toFixed(3);
        c.style.visibility = o < 0.02 ? 'hidden' : 'visible';
        const base = S.mobile ? '' : 'translateY(-50%) ';
        c.style.transform = `${base}translateY(${((1 - o) * (p > b ? -18 : 18)).toFixed(1)}px)`;
        if (k === 0 && storyTags) { storyTags.style.opacity = o.toFixed(3); storyTags.style.visibility = c.style.visibility; }
      });
    }
  }

  const storyProgress = () => {
    const r = story.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  };

  let storyVisible = true;
  function storyLoop(t) {
    if (storyVisible) renderStory(storyProgress(), t);
    requestAnimationFrame(storyLoop);
  }

  if (reduce) {
    story.classList.add('is-static');
    buildStory();
    renderStory(1, 0);
  } else {
    buildStory();
    new IntersectionObserver(([e]) => { storyVisible = e.isIntersecting; }).observe(story);
    requestAnimationFrame(storyLoop);
  }
  let rT;
  addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => { buildStory(); renderStory(reduce ? 1 : storyProgress(), performance.now()); }, 120);
  });

  /* ================= Kalkulator ================= */
  const form = $('#calcForm');
  const inp = {
    goal: $('#goalAmount'), saved: $('#savedAmount'), monthsNum: $('#monthsNum'),
    monthsRange: $('#monthsRange'), monthly: $('#monthlyAmount'), other: $('#otherName'),
  };
  const errs = { goal: $('#goalErr'), saved: $('#savedErr'), months: $('#monthsErr'), monthly: $('#monthlyErr') };
  const chart = $('#chart');
  const playBtn = $('#playBtn');
  const doneMsg = $('#doneMsg');
  const playInfo = $('#playInfo');
  const resultBox = $('#result');
  const mini = $('#miniResult');
  const parse = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

  let C;
  function chartSize() {
    const narrow = chart.parentElement.clientWidth < 520;
    C = narrow ? { X0: 22, X1: 352, Y0: 54, Y1: 226 } : { X0: 56, X1: 586, Y0: 52, Y1: 282 };
    chart.setAttribute('viewBox', narrow ? '0 0 374 264' : '0 0 640 340');
  }
  chartSize();
  addEventListener('resize', () => { chartSize(); if (disp) drawChart(); });
  let target = null, disp = null, tween = null;
  let playT = 0, ringT = 0, playing = false, done = false, autoPlayed = false;

  function goalName() {
    const v = form.goal.value;
    return v === 'inne' ? (inp.other.value.trim() || 'Wasz cel') : v;
  }

  function setErr(key, msg, input) {
    errs[key].textContent = msg || '';
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function compute() {
    const goal = parse(inp.goal.value);
    const saved = parse(inp.saved.value);
    const mode = form.mode.value;
    let months = Math.round(Number(inp.monthsNum.value));
    let monthly = parse(inp.monthly.value);
    let ok = true;
    ['goal', 'saved', 'months', 'monthly'].forEach((k) => setErr(k, ''));
    inp.goal.removeAttribute('aria-invalid'); inp.saved.removeAttribute('aria-invalid');
    inp.monthsNum.removeAttribute('aria-invalid'); inp.monthly.removeAttribute('aria-invalid');

    if (goal <= 0) { setErr('goal', 'Wpiszcie kwotę celu.', inp.goal); ok = false; }
    const rem = goal - saved;
    if (ok && rem <= 0) return { reached: true, goal, saved, months: 1, monthly: 0 };

    if (mode === 'term') {
      if (!(months >= 1 && months <= 360)) { setErr('months', 'Termin: od 1 do 360 miesięcy.', inp.monthsNum); ok = false; }
      else monthly = Math.ceil(rem / months);
    } else {
      if (monthly <= 0) { setErr('monthly', 'Wpiszcie, ile możecie odkładać.', inp.monthly); ok = false; }
      else if (ok) {
        months = Math.ceil(rem / monthly);
        if (months > 360) { setErr('monthly', 'Przy tej kwocie to ponad 30 lat – spróbujcie większej kwoty miesięcznej.', inp.monthly); ok = false; }
      }
    }
    return ok ? { goal, saved, months, monthly, mode } : null;
  }

  function update() {
    const r = compute();
    stopPlay(false);
    const label = $('#resLabel'), value = $('#resValue'), unit = $('#resUnit'), sub = $('#resSub');
    resultBox.classList.toggle('is-error', !r);
    if (!r) { sub.textContent = 'Uzupełnijcie pola formularza.'; mini.textContent = 'Uzupełnijcie pola'; return; }
    if (r.reached) {
      label.textContent = goalName();
      value.textContent = 'Cel osiągnięty';
      unit.textContent = '';
      sub.textContent = 'Ten cel już macie – gratulacje!';
      mini.textContent = 'Cel osiągnięty';
      done = true; ringT = 1; playT = 1;
      setTarget({ goal: r.goal, saved: r.goal, months: 1 });
      doneMsg.textContent = '';
      playBtn.disabled = true;
      return;
    }
    playBtn.disabled = false;
    playBtn.textContent = 'Zobaczcie drogę do celu';
    const when = dateIn(r.months);
    mini.textContent = r.mode === 'term' ? `${fmt(r.monthly)} zł miesięcznie · ${when}` : `${r.months} ${monthWord(r.months)} · ${when}`;
    if (r.mode === 'term') {
      label.textContent = 'Odkładajcie';
      value.textContent = `${fmt(r.monthly)} zł`;
      unit.textContent = 'miesięcznie';
      sub.textContent = `przez ${r.months} ${monthWord(r.months)} · ${goalName()}: ${when}`;
      $('#monthsHint').textContent = `Cel: ${when}`;
    } else {
      label.textContent = 'Dojdziecie do celu za';
      value.textContent = `${r.months} ${r.months === 1 ? 'miesiąc' : 'mies.'}`;
      unit.textContent = '';
      sub.textContent = `${goalName()}: ${when} · odkładając ${fmt(r.monthly)} zł miesięcznie`;
    }
    setTarget({ goal: r.goal, saved: r.saved, months: r.months });
  }

  function setTarget(t) {
    target = t;
    if (!disp || reduce) { disp = { ...t }; drawChart(); return; }
    const from = { ...disp }, t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = (now) => {
      const k = easeOut(clamp((now - t0) / 450));
      disp = { goal: lerp(from.goal, t.goal, k), saved: lerp(from.saved, t.saved, k), months: lerp(from.months, t.months, k) };
      drawChart();
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  function drawChart() {
    const { goal, saved, months } = disp;
    const { X0, X1, Y0, Y1 } = C;
    const x = (m) => X0 + (X1 - X0) * (m / months);
    const y = (v) => Y1 - (Y1 - Y0) * (v / goal);
    chart.querySelectorAll(':scope > :not(desc)').forEach((n) => n.remove());
    const g = el('g', {}, chart);
    el('line', { class: 'c-grid', x1: X0, x2: X1, y1: Y1, y2: Y1 }, g);
    el('line', { class: 'c-goal', x1: X0, x2: X1, y1: Y0, y2: Y0 }, g);
    const nowMonth = new Date().getMonth();
    if (months > 14) {
      for (let o = 12 - nowMonth; o < months; o += 12) {
        if (x(o) - X0 < 44 || X1 - x(o) < 96) continue;
        el('line', { class: 'c-grid', x1: x(o), x2: x(o), y1: Y1, y2: Y1 + 6 }, g);
        const t = el('text', { class: 'c-txt', x: x(o), y: Y1 + 22, 'text-anchor': 'middle' }, g);
        t.textContent = new Date().getFullYear() + Math.ceil((o + 1) / 12);
      }
    }
    el('path', { class: 'c-area', d: `M${X0},${Y1}L${X0},${y(saved)}L${X1},${y(goal)}L${X1},${Y1}Z` }, g);
    el('path', { class: 'c-line', d: `M${X0},${y(saved)}L${X1},${y(goal)}` }, g);

    const count = Math.max(1, Math.min(Math.round(months), 48));
    const stepM = months / count;
    const at = playT * months;
    for (let k = 0; k < count; k++) {
      const m = k * stepM;
      const v = saved + (goal - saved) * (m / months);
      el('circle', { class: 'c-dot' + (m <= at + 1e-6 && (k === 0 || playT > 0) ? ' is-full' : ''), cx: x(m), cy: y(v), r: count > 30 ? 3 : 4 }, g);
    }

    const ring = el('g', { transform: `translate(${X1},${Y0})` }, g);
    el('circle', { class: 'c-ring', r: 15 }, ring);
    el('circle', { class: 'c-ring-fill', r: 15, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 - easeInOut(ringT), transform: 'rotate(-90)' }, ring);
    if (ringT > 0.6) {
      const s = easeOut(clamp((ringT - 0.6) / 0.4));
      const core = el('g', { transform: `scale(${s})` }, ring);
      el('circle', { class: 'c-ring-core', r: 12 }, core);
      el('path', { class: 'c-check', d: 'M-5 0.5 L-1.5 4 L5.5 -3.5' }, core);
    }

    if (playing || (playT > 0 && playT < 1)) {
      const mx = x(at), my = y(saved + (goal - saved) * playT);
      el('circle', { class: 'c-marker-halo', cx: mx, cy: my, r: 14 }, g);
      el('circle', { class: 'c-marker', cx: mx, cy: my, r: 6.5 }, g);
    }

    const tStart = el('text', { class: 'c-txt', x: X0, y: Y1 + 22, 'text-anchor': 'start' }, g);
    tStart.textContent = 'Dziś';
    const tEnd = el('text', { class: 'c-txt c-txt--strong', x: X1, y: Y1 + 22, 'text-anchor': 'end' }, g);
    tEnd.textContent = dateIn(Math.round(months));
    const room = Y1 - y(saved) >= 24; // podpis w polu pod linią, nad osią
    const tSaved = el('text', { class: 'c-txt', x: X0 + (room ? 10 : 0), y: room ? Y1 - 9 : y(saved) - 14, 'text-anchor': 'start' }, g);
    tSaved.textContent = saved > 0 ? `Macie ${fmt(saved)} zł` : 'Start od zera';
    const tGoal = el('text', { class: 'c-txt c-txt--strong', x: X1 - 26, y: Y0 - 22, 'text-anchor': 'end' }, g);
    tGoal.textContent = `${goalName()}: ${fmt(goal)} zł`;
  }

  function stopPlay(keepDone) {
    playing = false;
    if (!keepDone) { done = false; playT = 0; ringT = 0; doneMsg.textContent = ''; playInfo.classList.remove('is-on'); }
  }

  function play() {
    if (!target || playBtn.disabled) return;
    const { goal, saved, months } = target;
    disp = { ...target };
    const finish = () => {
      playing = false; done = true; playT = 1; ringT = 1;
      drawChart();
      playInfo.classList.remove('is-on');
      doneMsg.textContent = `Gotowe! ${goalName()} – ${dateIn(months)}.`;
      playBtn.disabled = false;
      playBtn.textContent = 'Jeszcze raz';
    };
    doneMsg.textContent = '';
    if (reduce) { finish(); return; }
    playing = true; playT = 0; ringT = 0;
    playBtn.disabled = true;
    playBtn.textContent = 'W drodze…';
    playInfo.classList.add('is-on');
    const dur = 2400, t0 = performance.now();
    const step = (now) => {
      if (!playing) return;
      const k = clamp((now - t0) / dur);
      playT = easeInOut(k);
      const m = Math.max(1, Math.ceil(playT * months));
      playInfo.textContent = `${fmt(saved + (goal - saved) * playT)} zł · ${m}. ${monthWord(1)} z ${months}`;
      if (k >= 1) {
        const r0 = performance.now();
        const ring = (n) => {
          ringT = clamp((n - r0) / 600);
          drawChart();
          if (ringT < 1) requestAnimationFrame(ring); else finish();
        };
        requestAnimationFrame(ring);
        return;
      }
      drawChart();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // zdarzenia formularza
  const moneyFields = [inp.goal, inp.saved, inp.monthly];
  moneyFields.forEach((f) => {
    f.addEventListener('input', update);
    f.addEventListener('blur', () => { const v = parse(f.value); if (v) f.value = fmt(v).replace(/ /g, ' '); });
  });
  inp.monthsRange.addEventListener('input', () => { inp.monthsNum.value = inp.monthsRange.value; update(); });
  inp.monthsNum.addEventListener('input', () => {
    const v = Number(inp.monthsNum.value);
    if (v >= 1 && v <= 120) inp.monthsRange.value = v;
    update();
  });
  inp.other.addEventListener('input', update);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'goal') $('#otherWrap').hidden = e.target.value !== 'inne';
    if (e.target.name === 'mode') {
      const term = form.mode.value === 'term';
      $('#termWrap').hidden = !term;
      $('#monthlyWrap').hidden = term;
    }
    if (e.target.name === 'goal' || e.target.name === 'mode') update();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  playBtn.addEventListener('click', play);
  $('#exampleBtn').addEventListener('click', () => {
    form.querySelector('input[name="goal"][value="Mieszkanie"]').checked = true;
    form.querySelector('input[name="mode"][value="term"]').checked = true;
    $('#otherWrap').hidden = true; $('#termWrap').hidden = false; $('#monthlyWrap').hidden = true;
    inp.goal.value = '120 000'; inp.saved.value = '18 000';
    inp.monthsNum.value = 48; inp.monthsRange.value = 48;
    $('#exampleNote').hidden = false;
    update();
    setTimeout(play, reduce ? 0 : 500);
  });

  update();

  if (!reduce) {
    new IntersectionObserver(([e], obs) => {
      if (e.isIntersecting && !autoPlayed) { autoPlayed = true; obs.disconnect(); setTimeout(play, 350); }
    }, { threshold: 0.55 }).observe($('.calc__out'));
  }

  /* ================= Animated List (21st.dev / Magic UI) ================= */
  // Co `delay` ms na górę listy trafia kolejne powiadomienie; po ostatnim lista zaczyna od nowa.
  const alertList = $('#alertList');
  const ALERTS = [
    ['warn', '!', 'Hej, uważajcie z jedzeniem', 'Wydaliście 83% budżetu, a zostało 8 dni.', 'poniedziałek · podsumowanie tygodnia'],
    ['goal', '◎', 'Wakacje: brakuje 200 zł do planu', 'W tym miesiącu odłożyliście 400 z 600 zł.', 'środa'],
    ['ok', '✓', 'Brawo – transport poniżej budżetu', '140 zł zostaje w tym miesiącu.', 'piątek'],
    ['meet', '◷', 'Niedziela, 19:00 – Wasze spotkanie', 'Podsumowanie miesiąca jest gotowe: 3 tematy.', 'przypomnienie'],
    ['ok', '✓', 'Rachunek za prąd zgodnie z planem', '312 zł – mieści się w „Mieszkanie i rachunki”.', 'wtorek'],
    ['goal', '◎', 'Mieszkanie: 27% celu', 'Do wkładu własnego brakuje 87 600 zł.', 'koniec miesiąca'],
    ['warn', '!', 'Kategoria „Inne” rośnie szybciej niż zwykle', '430 z 800 zł w połowie miesiąca.', 'czwartek'],
  ];
  const alertEl = ([kind, ic, title, text, when]) => {
    const n = document.createElement('div');
    n.className = `al al--${kind}`;
    n.innerHTML = `<span class="al__ic" aria-hidden="true">${ic}</span><div><b>${title}</b><p>${text}</p><small>${when}</small></div>`;
    return n;
  };
  const ALERT_DELAY = 1800;
  let alertIdx = -1, alertTimer = null;

  function nextAlert() {
    alertIdx = (alertIdx + 1) % ALERTS.length;
    if (alertIdx === 0 && alertList.children.length) {
      // jak AnimatePresence: wszystkie znikają, lista startuje od pierwszego
      [...alertList.children].forEach((c) => c.animate([{ scale: 1, opacity: 1 }, { scale: 0, opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }));
      setTimeout(() => { alertList.textContent = ''; addAlert(ALERTS[0]); }, 280);
      return;
    }
    addAlert(ALERTS[alertIdx]);
  }
  function addAlert(data) {
    // FLIP: zapamiętaj pozycje, dodaj na górę, przesuń starsze płynnie w nowe miejsce
    const before = new Map([...alertList.children].map((c) => [c, c.getBoundingClientRect().top]));
    const n = alertEl(data);
    alertList.prepend(n);
    before.forEach((top, c) => {
      const dy = top - c.getBoundingClientRect().top;
      if (dy) c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.22,1.12,.36,1)' });
    });
    n.animate([{ scale: 0, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.22,1.12,.36,1)' });
    while (alertList.children.length > 6) alertList.lastElementChild.remove();
  }

  if (reduce) {
    alertList.classList.add('is-static');
    ALERTS.slice(0, 4).forEach((a) => alertList.append(alertEl(a)));
  } else {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !alertTimer) { nextAlert(); alertTimer = setInterval(nextAlert, ALERT_DELAY); }
      if (!e.isIntersecting && alertTimer) { clearInterval(alertTimer); alertTimer = null; }
    }, { threshold: 0.3 }).observe(alertList);
  }

  /* ================= Efekty: słowa, markery, rotujące słowo, światło kursora ================= */
  // dzieli tekst nagłówka na słowa, zachowując znaczniki (mark, span, br)
  function splitWords(node, counter) {
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement('span');
          w.className = 'w';
          w.style.setProperty('--i', counter.i++);
          w.textContent = part;
          frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') splitWords(c, counter);
    });
  }
  const wordEls = [...document.querySelectorAll('[data-words]')];
  wordEls.forEach((h) => splitWords(h, { i: 0 }));
  const marks = [...document.querySelectorAll('.hl')].filter((m) => !m.closest('[data-words]'));
  if (reduce) {
    wordEls.concat(marks).forEach((e) => e.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.4, rootMargin: '0px 0px -8% 0px' });
    wordEls.concat(marks).forEach((e) => io.observe(e));
  }

  const rot = $('.rot');
  if (rot && !reduce) {
    const words = rot.dataset.words.split('|');
    let wi = 0;
    setInterval(() => {
      wi = (wi + 1) % words.length;
      // wszystko poza aktualnym słowem znika (także resztki, gdy karta była w tle)
      const words$ = [...rot.querySelectorAll('.rot__w')];
      const old = words$.pop();
      words$.forEach((w) => w.remove());
      old.classList.remove('is-new');
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 500);
      const n = document.createElement('span');
      n.className = 'rot__w is-new';
      n.textContent = words[wi];
      rot.append(n);
    }, 2200);
  }

  document.querySelectorAll('.fs, .card, .kpi').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ================= Czat: dymki wyskakują po kolei ================= */
  const chat = $('#chaos');
  chat.querySelectorAll('.bb').forEach((b, i) => b.style.setProperty('--i', i));
  if (reduce) chat.classList.add('is-in');
  else new IntersectionObserver(([e], o) => { if (e.isIntersecting) { chat.classList.add('is-in'); o.disconnect(); } }, { threshold: 0.35 }).observe(chat);

  /* ================= Dashboard + finał + nawigacja ================= */
  const app = $('#aplikacja');
  const dash = app.querySelector('.dash');
  const finalSec = $('#final');
  const finalDraw = $('#finalDraw');
  const finalGoal = $('#finalGoal');
  const nav = $('#nav');
  const floats = [...app.querySelectorAll('.float')];
  const counters = [...dash.querySelectorAll('[data-count]')];
  let counted = false;
  function countUp() {
    if (reduce) return;
    const t0 = performance.now();
    const step = (now) => {
      const k = easeOut(clamp((now - t0) / 1200));
      counters.forEach((c) => { c.textContent = `${fmt(Number(c.dataset.count) * k)} zł`; });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const featsList = $('#featsList');
  const feats = [...featsList.querySelectorAll('.feat')];

  function onScroll() {
    nav.classList.toggle('is-scrolled', scrollY > 20);
    const vh = innerHeight;
    // dashboard „wypełnia się” danymi, gdy wjeżdża w widok: linia planu, paski budżetu i celów
    const dr = dash.getBoundingClientRect();
    const dp = reduce ? 1 : easeOut(clamp((vh - dr.top) / (vh * 0.75)));
    dash.style.setProperty('--p', dp.toFixed(3));
    // dashboard wjeżdża z perspektywy i „kładzie się” płasko; powiadomienia płyną szybciej niż ekran
    dash.style.transform = reduce ? '' : innerWidth <= 900
      ? `translateY(${((1 - dp) * 30).toFixed(1)}px)`
      : `rotateX(${((1 - dp) * 18).toFixed(2)}deg) scale(${(0.92 + 0.08 * dp).toFixed(3)}) translateY(${((1 - dp) * 50).toFixed(1)}px)`;
    const k = clamp((vh - dr.top) / (vh + dr.height));
    floats.forEach((f) => {
      f.style.transform = reduce || innerWidth <= 900 ? '' : `translateY(${((0.5 - k) * 160 * Number(f.dataset.depth)).toFixed(1)}px)`;
      f.style.opacity = reduce ? 1 : clamp((dp - 0.35) / 0.4).toFixed(3);
    });
    if (dp > 0.55 && !counted) { counted = true; countUp(); }
    // linia statusu funkcji rysuje się z przewijaniem; ekrany przesuwają się wolniej niż tekst
    const lr = featsList.getBoundingClientRect();
    const lp = reduce ? 1 : clamp((vh * 0.6 - lr.top) / lr.height);
    featsList.style.setProperty('--fp', lp.toFixed(3));
    feats.forEach((f) => {
      const r = f.getBoundingClientRect();
      f.classList.toggle('is-reached', reduce || r.top < vh * 0.6);
      const k = clamp((vh - r.top) / (vh + r.height));
      f.querySelector('.fs').style.transform = reduce || innerWidth <= 900 ? '' : `translateY(${((0.5 - k) * 70).toFixed(1)}px)`;
    });
    const fr = finalSec.getBoundingClientRect();
    const fp = reduce ? 1 : clamp((vh - fr.top) / (vh * 0.85));
    finalDraw.style.strokeDashoffset = (1 - easeInOut(clamp(fp / 0.85))).toFixed(4);
    finalGoal.classList.toggle('is-full', fp > 0.7);
  }
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
  if (shot) setTimeout(() => { document.documentElement.dataset.h = document.documentElement.scrollHeight; }, 1200);

  /* ================= Tryb demo do nagrania filmu: ?demo ================= */
  // Strona sama przewija się przez wszystkie sceny w stałym tempie. Esc zatrzymuje.
  if (/[?&]demo\b/.test(location.search)) {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.classList.add('is-demo');
    let stop = false;
    addEventListener('keydown', (e) => { if (e.key === 'Escape') stop = true; });
    const top = (sel, off = 0) => document.querySelector(sel).getBoundingClientRect().top + scrollY + off;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const glide = (to, dur) => new Promise((res) => {
      const from = scrollY, t0 = performance.now();
      const step = (now) => {
        if (stop) return res();
        const k = clamp((now - t0) / dur);
        scrollTo(0, from + (to - from) * easeInOut(k));
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
    (async () => {
      scrollTo(0, 0);
      await sleep(2600);
      await glide(story.offsetTop + story.offsetHeight - innerHeight, 12000); await sleep(1400);
      await glide(top('#chaos', -40), 1600); await sleep(5600);
      await glide(top('.ribbon', -innerHeight * 0.35), 1400); await sleep(1200);
      await glide(top('#aplikacja', -40), 1400); await sleep(1400);
      await glide(top('.dash', -90), 1600); await sleep(3800);
      for (const [i, f] of [...document.querySelectorAll('.feat')].entries()) {
        if (stop) return;
        await glide(f.getBoundingClientRect().top + scrollY - 120, 1500);
        await sleep(i === 4 ? 6500 : 3200);
      }
      await glide(top('.nogoal', -innerHeight * 0.4), 1300); await sleep(1600);
      await glide(top('#kalkulator', -40), 1600); await sleep(800);
      if (!stop) document.querySelector('#exampleBtn').click();
      await sleep(5200);
      await glide(top('#final', -40), 2200); await sleep(4000);
      document.body.classList.remove('is-demo');
    })();
  }
})();
