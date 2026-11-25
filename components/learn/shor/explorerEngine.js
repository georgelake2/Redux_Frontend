// components/learn/shor/explorerEngine.js
//
// Mockup (feature/shor-explorer-page, georgelake2 fork only): the Shor's explorer from the
// thesis mockup, run inside a Redux page. It is the mockup's own script moved here nearly
// unchanged, so it builds its DOM imperatively inside `root` instead of as React components.
// Rebuilding it as React components is the next step before anything is proposed to ISU.
//
// Every element lookup is scoped to `root`, and mountShorExplorer returns a cleanup that
// stops the playhead timer and the resize observer, so the page can mount and unmount it.

export function mountShorExplorer(root, { hardwareRun, kingstonCircuit }) {
  const HW_EMBED = hardwareRun;
  const CHIP = kingstonCircuit;

  const $ = (id) => root.querySelector(`#${id}`);
  const gcd = (x, y) => {
    while (y) [x, y] = [y, x % y];
    return x;
  };
  const powmod = (b, e, n) => {
    let r = 1 % n;
    b %= n;
    while (e > 0) {
      if (e & 1) r = (r * b) % n;
      b = (b * b) % n;
      e = Math.floor(e / 2);
    }
    return r;
  };
  const bits = (n) => Math.ceil(Math.log2(n + 1));
  const order = (a, n) => {
    let v = a % n,
      k = 1;
    while (v !== 1) {
      v = (v * a) % n;
      k++;
    }
    return k;
  };
  const S = {
    N: 55,
    a: 7,
    t: 12,
    stage: 0,
    run: [],
    sel: 0,
    playing: null,
    detail: null,
    src: "sim",
    hw: null,
  };
  let sim = null;

  /* Measurement probabilities after the inverse QFT, in closed form: the x values sharing a work value form a
   comb x0, x0 + r, x0 + 2r, ..., and each comb's Fourier transform is a geometric sum of length L. */
  function hwCase(N, a) {
    const d = S.hw;
    return (d && d.cases.find((c) => c.n === N && c.a === a && c.counts)) || null;
  }
  function hwLabel() {
    const d = S.hw;
    if (!d) return "";
    return d.mode === "ibm"
      ? `IBM's ${d.backend}, a real quantum computer (run ${d.created.slice(0, 10)}${d.job_ids ? `, job ${d.job_ids.join(" and ")}` : d.job_id ? `, job ${d.job_id}` : ""})`
      : `a noisy simulation of IBM's ${String(d.backend).replace(/ \(.*/, "").replace("Fake", "ibm_").toLowerCase()} (a free preview, not the real machine)`;
  }
  function hwDist(c, T) {
    const P = new Float64Array(T),
      shots = c.shots || Object.values(c.counts).reduce((u, v) => u + v, 0);
    for (const [x, k] of Object.entries(c.counts)) P[+x] = k / shots;
    return P;
  }
  function dist(N, a, T) {
    const c = S.src === "hw" && hwCase(N, a);
    return c ? hwDist(c, T) : measureProbs(T, order(a, N));
  }
  function measureProbs(T, r) {
    const L1 = Math.ceil(T / r),
      n1 = T % r || r,
      L2 = L1 - 1,
      n2 = r - n1,
      P = new Float64Array(T);
    for (let k = 0; k < T; k++) {
      const th = (Math.PI * k * r) / T,
        sd = Math.sin(th);
      const f = (L) => (Math.abs(sd) < 1e-12 ? L * L : (Math.sin(L * th) / sd) ** 2);
      P[k] = (n1 * f(L1) + (n2 ? n2 * f(L2) : 0)) / (T * T);
    }
    return P;
  }
  function sample(P) {
    let u = Math.random(),
      x = 0;
    while (x < P.length - 1 && (u -= P[x]) > 0) x++;
    return x;
  }
  function convergents(num, den) {
    const out = [];
    let h0 = 0,
      h1 = 1,
      k0 = 1,
      k1 = 0,
      n = num,
      d = den;
    while (d) {
      const q = Math.floor(n / d);
      [h0, h1] = [h1, q * h1 + h0];
      [k0, k1] = [k1, q * k1 + k0];
      out.push([h1, k1]);
      [n, d] = [d, n - q * d];
    }
    return out;
  }
  function decode(x, ctx) {
    const { N, a, T, t } = ctx,
      steps = [],
      sup = (e) => `<sup>${e}</sup>`;
    const st = (title, eqs, note) => steps.push({ title, eqs, note });
    st(
      "Turn the measurement into a fraction",
      [
        `x = ${x}  (binary ${x.toString(2).padStart(t, "0")})`,
        `x ÷ 2${sup(t)} = ${x} ÷ ${T} = ${(x / T).toFixed(5)}`,
      ],
      `The circuit makes x land near a multiple of ${T} ÷ r, so this decimal is close to a fraction s ÷ r, with the period r on the bottom.`,
    );
    if (x === 0)
      return {
        steps,
        ok: false,
        why: "x = 0 gives the fraction 0, which says nothing about r. Measure again.",
      };
    const g = gcd(x, T),
      cv = convergents(x / g, T / g),
      cands = cv.filter(([h, k]) => h > 0 && k > 1 && k < N);
    st(
      "Find the simple fraction it is close to",
      [
        `continued fractions of ${x} ÷ ${T}:`,
        cv
          .filter(([, k]) => k < N)
          .map(([h, k]) => `${h}/${k} = ${(h / k).toFixed(5)}`)
          .join("    "),
      ],
      cands.length
        ? `The closest one with a bottom number below ${N} is ${cands[cands.length - 1][0]}/${cands[cands.length - 1][1]}, so the candidate period is k = ${cands[cands.length - 1][1]}. The true period is k or a multiple of it.`
        : `No useful fraction with a bottom number below ${N}.`,
    );
    let r = null;
    const tried = [];
    for (const [, k] of [...cands].reverse()) {
      for (let m = 1; m * k < N && !r; m++) {
        const c = m * k;
        if (tried.includes(c)) continue;
        tried.push(c);
        if (powmod(a, c, N) === 1) r = c;
      }
      if (r) break;
    }
    const tests = tried.map(
      (c) =>
        `${a}${sup(c)} mod ${N} = ${powmod(a, c, N)}   ${powmod(a, c, N) === 1 ? "← yes, equals 1" : "(not 1)"}`,
    );
    if (!r) {
      st(
        "Test the candidates: does a" + sup("k") + " mod N equal 1?",
        tests.length ? tests : ["no candidates to test"],
        "None works, so this shot landed between peaks.",
      );
      return { steps, ok: false, why: "This shot landed between peaks. Measure again." };
    }
    st(
      "Test the candidates: does a" + sup("k") + " mod N equal 1?",
      [...tests, `period r = ${r}`],
      `The period is the smallest k that brings ${a}${sup("k")} back to 1. A reduced fraction can hide it, which is why multiples are tried too.`,
    );
    if (r % 2)
      return {
        steps,
        ok: false,
        r,
        why: `r = ${r} is odd, so r ÷ 2 is not a whole number and step 4 can't be done. Pick another base a.`,
      };
    const h = powmod(a, r / 2, N),
      sq = h * h;
    st(
      "Cut the period in half",
      [
        `h = ${a}${sup(r / 2)} mod ${N} = ${h}`,
        `${a}${sup(r)} = ${a}${sup(r / 2)} × ${a}${sup(r / 2)}, and step 3 found ${a}${sup(r)} mod ${N} = 1`,
        `so h × h mod ${N} = 1 too.  Check: ${h} × ${h} = ${sq}, and ${sq} ÷ ${N} = ${Math.floor(sq / N)} remainder 1`,
      ],
      `h is a number whose square leaves a remainder of 1 when divided by ${N}. That one fact is all step 5 needs.`,
    );
    if (h === N - 1)
      return {
        steps,
        ok: false,
        r,
        why: `h = ${h} = ${N} − 1, so h + 1 = ${N} holds all of ${N} and h − 1 holds none of it. Pick another base a.`,
      };
    const p = gcd(h - 1, N),
      q = gcd(h + 1, N);
    st(
      "Split it as a difference of squares, then use gcd",
      [
        `h × h − 1 = (h − 1) × (h + 1) = ${h - 1} × ${h + 1} = ${(h - 1) * (h + 1)} = ${((h - 1) * (h + 1)) / N} × ${N}`,
        `gcd(${h - 1}, ${N}) = ${p}`,
        `gcd(${h + 1}, ${N}) = ${q}`,
      ],
      `${N} divides ${h - 1} × ${h + 1} but neither number on its own, so each one holds part of ${N}. The gcd pulls that part out.`,
    );
    return { steps, ok: true, r, p: Math.min(p, q), q: Math.max(p, q) };
  }

  /* ---------- circuit ---------- */
  function layout() {
    const t = sim.t,
      lab = 70,
      wH = 84,
      wQ = 92,
      wM = 76;
    const avail = Math.max(
      ($("circ").parentElement.clientWidth || 700) - lab - wH - wQ - wM - 16,
      t * 44,
    );
    const cw = Math.min(70, Math.max(44, avail / t));
    const cols = [{ w: wH, kind: "h" }];
    for (let j = 0; j < t; j++) cols.push({ w: cw, kind: "cu", j });
    cols.push({ w: wQ, kind: "qft" }, { w: wM, kind: "m" });
    let x = lab;
    for (const c of cols) {
      c.x = x;
      x += c.w;
    }
    return { cols, lab, W: x + 12 };
  }
  function drawCircuit() {
    if (!sim) return;
    const svg = $("circ"),
      { t, mult } = sim,
      L = layout(),
      rowH = 30,
      top = 40;
    const yRow = (i) => top + i * rowH,
      yWork = top + t * rowH + 14,
      H = yWork + 30;
    const st = S.stage;
    svg.setAttribute("width", L.W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${L.W} ${H}`);
    const done = (k) => k < st;
    const cur = (k) => k === st - 1;
    const strokeOf = (k) => (cur(k) ? "var(--acc)" : done(k) ? "var(--ink)" : "var(--line)");
    const txtOf = (k) => (done(k) || cur(k) ? "var(--ink)" : "var(--mute)");
    let g = "";
    const bands = [
      [0, 0, "Superpose"],
      [
        1,
        t,
        L.cols[t].x + L.cols[t].w - L.cols[1].x > 180 ? "Modular exponentiation" : "a^x mod N",
      ],
      [t + 1, t + 1, "Inverse QFT"],
      [t + 2, t + 2, "Measure"],
    ];
    for (const [k0, k1, name] of bands) {
      const x0 = L.cols[k0].x + 4,
        x1 = L.cols[k1].x + L.cols[k1].w - 4;
      g += `<line x1="${x0}" x2="${x1}" y1="22" y2="22" stroke="var(--line)" stroke-width="2"/>`;
      g += `<text x="${(x0 + x1) / 2}" y="15" text-anchor="middle" font-size="12" font-weight="600" fill="var(--mute)">${name}</text>`;
    }
    for (let i = 0; i < t; i++) {
      g += `<text x="6" y="${yRow(i) + 5}" font-size="13" fill="var(--mute)">c${i}</text><text x="34" y="${yRow(i) + 5}" font-size="13" fill="var(--ink)">|0⟩</text>`;
      g += `<line x1="${L.lab - 4}" x2="${L.W - 12}" y1="${yRow(i)}" y2="${yRow(i)}" stroke="var(--ink)" stroke-width="1.2"/>`;
    }
    g += `<text x="6" y="${yWork + 5}" font-size="13" fill="var(--mute)">work</text><text x="44" y="${yWork + 5}" font-size="13" fill="var(--ink)">|1⟩</text>`;
    g += `<line x1="${L.lab - 4}" x2="${L.W - 12}" y1="${yWork - 2}" y2="${yWork - 2}" stroke="var(--ink)"/><line x1="${L.lab - 4}" x2="${L.W - 12}" y1="${yWork + 2}" y2="${yWork + 2}" stroke="var(--ink)"/>`;
    g += `<line x1="${L.lab + 4}" x2="${L.lab + 12}" y1="${yWork + 7}" y2="${yWork - 7}" stroke="var(--ink)"/><text x="${L.lab + 14}" y="${yWork - 6}" font-size="11" fill="var(--mute)">${sim.m}</text>`;
    L.cols.forEach((c, k) => {
      const cx = c.x + c.w / 2,
        sk = strokeOf(k),
        tx = txtOf(k),
        sw = cur(k) ? 2.5 : 1.4;
      if (c.kind === "h")
        for (let i = 0; i < t; i++)
          g += `<rect x="${cx - 12}" y="${yRow(i) - 11}" width="24" height="22" rx="3" fill="var(--panel)" stroke="${sk}" stroke-width="${sw}"/><text x="${cx}" y="${yRow(i) + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${tx}">H</text>`;
      if (c.kind === "cu") {
        const v = mult[c.j],
          bw = Math.min(c.w - 6, 56);
        g += `<line x1="${cx}" x2="${cx}" y1="${yRow(c.j)}" y2="${yWork - 12}" stroke="${sk}" stroke-width="${sw}"/><circle cx="${cx}" cy="${yRow(c.j)}" r="5" fill="${sk}"/>`;
        g += `<rect x="${cx - bw / 2}" y="${yWork - 12}" width="${bw}" height="24" rx="3" fill="var(--panel)" stroke="${sk}" stroke-width="${sw}"/><text x="${cx}" y="${yWork + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${v === 1 ? "var(--mute)" : tx}">×${v}</text>`;
      }
      if (c.kind === "qft") {
        const y0 = yRow(0) - 12,
          y1 = yRow(t - 1) + 12;
        g += `<rect x="${cx - 30}" y="${y0}" width="60" height="${y1 - y0}" rx="4" fill="var(--panel)" stroke="${sk}" stroke-width="${sw}"/><text x="${cx}" y="${(y0 + y1) / 2 + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="${tx}">QFT†</text>`;
      }
      if (c.kind === "m" && st === t + 3 && S.run[S.sel].circuit)
        for (let i = 0; i < t; i++)
          g += `<text x="${cx + 22}" y="${yRow(i) + 5}" font-size="14" font-weight="700" fill="var(--acc-ink)">${(S.run[S.sel].x >> i) & 1}</text>`;
      if (c.kind === "m")
        for (let i = 0; i < t; i++)
          g += `<rect x="${cx - 13}" y="${yRow(i) - 11}" width="26" height="22" rx="3" fill="var(--panel)" stroke="${sk}" stroke-width="${sw}"/><path d="M${cx - 8} ${yRow(i) + 5} A9 9 0 0 1 ${cx + 8} ${yRow(i) + 5}" fill="none" stroke="${tx}" stroke-width="1.3"/><line x1="${cx}" y1="${yRow(i) + 5}" x2="${cx + 6}" y2="${yRow(i) - 6}" stroke="${tx}" stroke-width="1.3"/>`;
      g += `<rect data-k="${k}" x="${c.x}" y="0" width="${c.w}" height="${H}" fill="transparent" style="cursor:pointer"><title>Show this gate and what is inside it</title></rect>`;
    });
    const px = st === 0 ? L.lab - 2 : L.cols[st - 1].x + L.cols[st - 1].w;
    g += `<line x1="${px}" x2="${px}" y1="26" y2="${H - 4}" stroke="var(--acc)" stroke-width="3"/><path d="M${px - 7} 26 L${px + 7} 26 L${px} 35 Z" fill="var(--acc)"/>`;
    svg.innerHTML = g;
  }

  /* ---------- text for each playhead position ---------- */
  function stepText(st) {
    const { t, a, N, mult } = sim;
    if (st === 0)
      return [
        "Start",
        `Each wire is one qubit, read left to right like a timeline. The ${t} top wires (c0 to c${t - 1}) start at |0⟩. The doubled wire at the bottom is a bundle of ${sim.m} qubits that starts at |1⟩.`,
      ];
    if (st === 1)
      return [
        "Hadamards",
        `An <b>H</b> gate on each top wire puts that qubit into an equal mix of 0 and 1. With ${t} wires that is every number from 0 to ${2 ** t - 1} at once.`,
      ];
    if (st <= t + 1) {
      const j = st - 2,
        v = mult[j];
      return [
        `Controlled ×${v}`,
        `The dot on c${j} is the <b>control</b>. Only when c${j} is 1 does the box multiply the bottom bundle by <b>${v}</b>, which is ${a}<sup>${2 ** j}</sup> mod ${N}. Each top wire controls the next power: ${a}<sup>1</sup>, ${a}<sup>2</sup>, ${a}<sup>4</sup> and so on.${v === 1 ? ` Here the multiplier is 1, so this gate changes nothing and a real circuit can leave it out.` : ""}`,
      ];
    }
    if (st === t + 2)
      return [
        "Inverse QFT",
        `<b>QFT†</b>, the inverse quantum Fourier transform, acts on all ${t} top wires together. It is drawn as one block, but inside it is a ladder of H gates and controlled rotations. It turns a repeating pattern into a few sharp values.`,
      ];
    const at = S.run[S.sel];
    return [
      "Measure",
      at.circuit
        ? `The meters read the ${t} top wires as bits, shown at the right of each wire. c0 is the 1s bit, so read from c${t - 1} up to c0: binary ${at.x.toString(2).padStart(t, "0")} = <b>${at.x}</b>. That number is all the quantum part hands over; the arithmetic below turns it into the factors. The bottom bundle is never measured.`
        : `The meter on each top wire reads that qubit as 0 or 1, and the ${t} bits make one number. This run never got here: it found a factor with gcd first.`,
    ];
  }
  /* ---------- scaling panel ---------- */
  const LOG10_2 = Math.log10(2);
  // Measured with shor_sweep.py, 2026-11-24: ceilings (signal falls to 10%) of 2,236 and 1,411 (ibm_kingston, two runs),
  // 1,890 (ibm_marrakesh) and 1,223 (ibm_fez) two-qubit gates.
  const CHIP_CEILING = 2236,
    CHIP_CEILING_LOW = 1223;
  const gnfsRaw = (n) => {
    const lnN = n * Math.LN2;
    return (Math.cbrt(64 / 9) * Math.cbrt(lnN) * Math.log(lnN) ** (2 / 3)) / Math.LN10;
  };
  // For the time column only: scale the sieve so RSA-250 (829 bits) costs what it really did, 32 million core-hours at a billion operations a second.
  const GNFS_CAL = Math.log10(32e6 * 3600 * 1e9) - gnfsRaw(829);
  const scale = {
    trial: (n) => (n / 2) * LOG10_2,
    gnfs: (n) => gnfsRaw(n),
    shor: (n) => 3 * Math.log10(n),
  };
  const crossBits = () => {
    for (let n = 4; n < 4096; n += 0.25)
      if (scale.shor(n) < Math.min(scale.trial(n), scale.gnfs(n))) return Math.round(n);
    return null;
  };
  function fmtPow(l) {
    if (l < 6) return Math.round(10 ** l).toLocaleString();
    return `10<sup>${Math.round(l)}</sup>`;
  }
  function fmtTime(l) {
    const sec = l - 9; // at a billion operations a second
    if (sec < 0) return "under a second";
    if (sec < Math.log10(60)) return `${Math.round(10 ** sec)} seconds`;
    if (sec < Math.log10(3600)) return `${Math.round(10 ** sec / 60)} minutes`;
    if (sec < Math.log10(86400)) return `${Math.round(10 ** sec / 3600)} hours`;
    const yr = sec - Math.log10(31557600);
    if (yr < Math.log10(1)) return `${Math.round(10 ** sec / 86400)} days`;
    if (yr < 6) return `${Math.round(10 ** yr).toLocaleString()} years`;
    const uni = yr - Math.log10(1.38e10);
    return `10<sup>${Math.round(yr)}</sup> years${uni > 0 ? ` (about 10<sup>${Math.round(uni)}</sup> times the age of the universe)` : ""}`;
  }
  const scState = { bits: 2048 };
  function drawScaling() {
    const svg = $("scFig"),
      W = svg.clientWidth,
      H = svg.clientHeight;
    if (!W) return;
    const n = scState.bits,
      padL = W < 520 ? 44 : 56,
      padR = 16,
      padT = 14,
      padB = 34;
    const iw = W - padL - padR,
      ih = H - padT - padB,
      x0 = 2,
      x1 = 11,
      yMax = 40;
    const X = (b) => padL + ((Math.log2(b) - x0) / (x1 - x0)) * iw,
      Y = (l) => padT + ih - (Math.min(l, yMax) / yMax) * ih;
    let g = "";
    for (let l = 0; l <= yMax; l += 10)
      g += `<line x1="${padL}" x2="${padL + iw}" y1="${Y(l)}" y2="${Y(l)}" stroke="var(--line)" stroke-width="${l ? 0.6 : 1}"/><text x="${padL - 6}" y="${Y(l) + 4}" text-anchor="end">10${l ? `<tspan dy="-6" font-size="10">${l}</tspan>` : "⁰"}</text>`;
    for (let k = 2; k <= 11; k++)
      if (W >= 520 || k % 2 === 0)
        g += `<text x="${X(2 ** k)}" y="${padT + ih + 18}" text-anchor="middle">${2 ** k}</text>`;
    g += `<text x="${padL + iw / 2}" y="${H - 2}" text-anchor="middle">bits in the number to factor (log scale)</text>`;
    const yC = Y(Math.log10(CHIP_CEILING));
    const yL = Y(Math.log10(CHIP_CEILING_LOW));
    g += `<rect x="${padL}" y="${yL}" width="${iw}" height="${Y(0) - yL}" fill="var(--acc)" opacity=".14"/><rect x="${padL}" y="${yC}" width="${iw}" height="${yL - yC}" fill="var(--acc)" opacity=".3"/>`;
    const line = (f, dash, color, w) => {
      let d = "";
      for (let b = 4; b <= 2048; b *= 1.04) {
        const l = scale[f](b);
        d += `${d ? "L" : "M"}${X(b).toFixed(1)} ${Y(l).toFixed(1)}`;
        if (l > yMax) break;
      }
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? 'stroke-dasharray="6 5"' : ""}/>`;
    };
    g +=
      line("trial", true, "var(--mute)", 2) +
      line("gnfs", false, "var(--ink)", 2.5) +
      line("shor", false, "var(--acc)", 3.5);
    g += `<text x="${X((2 * yMax) / LOG10_2) + 6}" y="${Y(yMax) + 14}" style="fill:var(--mute)">trial division</text>`;
    g += `<text x="${X(400)}" y="${Y(scale.gnfs(400)) - 12}" text-anchor="end" style="fill:var(--ink)" font-weight="600">best classical</text>`;
    g += `<text x="${X(400)}" y="${Y(scale.shor(400)) - 12}" text-anchor="middle" style="fill:var(--acc-ink)" font-weight="700">Shor's</text>`;
    const dot = (b, l, num, ok) =>
      `<circle cx="${X(b)}" cy="${Y(l)}" r="10" fill="${ok ? "var(--acc)" : "var(--panel)"}" stroke="${ok ? "var(--acc)" : "var(--acc-ink)"}" stroke-width="2"/><text x="${X(b)}" y="${Y(l) + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:${ok ? "#fff" : "var(--acc-ink)"};stroke:none">${num}</text>`;
    g += dot(4, Math.log10(250), 1, true);
    g += dot(6, Math.log10(101000), 2, false);
    g += dot(829, scale.gnfs(829), 3, true);
    g += dot(2048, scale.shor(2048), 4, false);
    g += `<line x1="${X(n)}" x2="${X(n)}" y1="${padT}" y2="${padT + ih}" stroke="var(--acc)" stroke-width="2" stroke-dasharray="2 3"/>`;
    svg.innerHTML = g;
    const t = scale.trial(n),
      f = scale.gnfs(n),
      q = scale.shor(n),
      best = Math.min(t, f);
    $("scBitsVal").textContent =
      `${n} bits${n === 4 ? " (like 15)" : n === 6 ? " (like 55)" : n === 829 ? " (RSA-250)" : n === 2048 ? " (RSA-2048)" : ""}`;
    $("scHead").innerHTML =
      q < best
        ? `At ${n} bits, Shor's needs about ${fmtPow(q)} steps; the best classical method needs about ${fmtPow(best)}: <em>${fmtPow(best - q)} times more</em>.`
        : `At ${n} bits, classical is still cheaper (about ${fmtPow(best)} steps against ${fmtPow(q)} for Shor's). Shor's pulls ahead past about ${crossBits()} bits, and the gap then grows enormously.`;
    $("scTab").innerHTML =
      `<thead><tr><th>Method</th><th>Operations, about</th><th>One computer, a billion operations a second</th></tr></thead><tbody>
<tr><td>Trial division (try every divisor)</td><td class="n">${fmtPow(t)}</td><td>${fmtTime(t)}</td></tr>
<tr><td>Best classical (number field sieve)</td><td class="n">${fmtPow(f)}</td><td>${fmtTime(Math.max(0, f + GNFS_CAL))}, scaled from the real RSA-250 effort</td></tr>
<tr><td><b>Shor's</b>, on an error-corrected quantum computer</td><td class="n">${fmtPow(q)}</td><td>${n >= 1024 ? "Google estimates under a week for 2048 bits, counting error-correction overhead" : "fast in principle, but needs error correction; today’s noisy chips stop at about N = 15"}</td></tr></tbody>`;
    $("scBits").value = Math.log2(n);
  }
  $("scBits").oninput = (e) => {
    scState.bits = Math.max(4, Math.round(2 ** +e.target.value));
    drawScaling();
  };
  $("scale").addEventListener("click", (e) => {
    const b = e.target.closest(".scpre button");
    if (!b) return;
    scState.bits = +b.dataset.b;
    drawScaling();
  });
  const roS = new ResizeObserver(() => drawScaling());
  roS.observe($("scWrap"));

  /* ---------- state changes ---------- */
  function makeRun(N) {
    const m = bits(N - 1),
      t = 2 * m,
      T = 2 ** t;
    const cands = [];
    for (let a = 2; a < N - 1; a++) cands.push(a);
    for (let i = cands.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [cands[i], cands[k]] = [cands[k], cands[i]];
    }
    const out = [];
    for (const a of cands.slice(0, 10)) {
      const g = gcd(a, N);
      if (g > 1) {
        out.push({
          a,
          ok: true,
          circuit: false,
          text: `gcd(${a}, ${N}) = ${g}, already a factor. Lucky: <span class="ok">${N} = ${Math.min(g, N / g)} × ${Math.max(g, N / g)}</span>, no circuit needed.`,
        });
        break;
      }
      if (S.src === "hw" && !hwCase(N, a)) continue;
      const x = sample(dist(N, a, T)),
        d = decode(x, { N, a, T, t });
      const res = d.ok
        ? `<span class="ok">${N} = ${d.p} × ${d.q}</span>.`
        : `<span class="bad">${d.why.replace(/ (Measure again|Pick another base a)\.$/, "")} Start over.</span>`;
      out.push({
        a,
        ok: d.ok,
        circuit: true,
        x,
        d,
        text: `gcd = 1, so run the circuit. It measures x = ${x}${d.r ? `, which gives r = ${d.r}` : ""}. ${res}`,
      });
      if (d.ok) break;
    }
    if (S.src === "hw" && !out.some((o) => o.ok))
      out.push({
        a: "–",
        ok: false,
        circuit: false,
        text: `<span class="bad">No more hardware results to draw from.</span> The file only has runs for a = ${S.hw.cases
          .filter((c) => c.n === N && c.counts)
          .map((c) => c.a)
          .join(", ")}; a real run would keep trying new bases.`,
      });
    return out;
  }
  function newRun() {
    S.detail = null;
    S.run = makeRun(S.N);
    const withC = S.run.map((x, i) => (x.circuit ? i : -1)).filter((i) => i >= 0);
    S.sel = withC.length ? withC[withC.length - 1] : 0;
    S.stage = 0;
    rebuild();
  }
  function rebuild() {
    stop();
    const N = S.N,
      m = bits(N - 1),
      t = 2 * m,
      att = S.run[S.sel];
    let a = att.a;
    if (!att.circuit) {
      a = 2;
      while (gcd(a, N) !== 1) a++;
    }
    const mult = [];
    for (let j = 0; j < t; j++) mult.push(powmod(a, 2 ** j, N));
    S.a = a;
    S.t = t;
    sim = { N, a, t, m, T: 2 ** t, mult };
    S.stage = Math.min(S.stage, t + 3);
    $("setup").innerHTML =
      `N = ${N} takes <b>${m} bits</b>, so the circuit uses <b>${m} work qubits</b> to hold numbers mod ${N}, plus <b>${t} counting qubits</b> (twice the bits of N, enough to read the period sharply): <b>${m + t} qubits</b> in all, whatever a is.`;
    $("att").innerHTML = S.run
      .map(
        (x, i) =>
          `<li><button data-i="${i}" aria-pressed="${i === S.sel}" ${x.circuit ? "" : "disabled"}><span class="k">Attempt ${i + 1}</span><span class="a">a = ${x.a}</span><span class="r">${x.text}</span></button></li>`,
      )
      .join("");
    $("circNote").innerHTML = att.circuit
      ? `Circuit for attempt ${S.sel + 1}, a = ${a}:`
      : `This run got lucky, so the circuit never ran. Below is the circuit it would have used with a = ${a}.`;
    const hc = S.src === "hw" && hwCase(N, a);
    $("srcNote").hidden = S.src !== "hw";
    if (S.src === "hw")
      $("srcNote").innerHTML =
        `Measurements come from ${hwLabel()}.${hc ? ` On that machine this circuit compiled to <b>${hc.compiled.two_qubit_gates.toLocaleString()} two-qubit gates</b> (depth ${hc.compiled.depth.toLocaleString()}).${N === 15 ? " For N = 15 each multiplier box is a few controlled swaps, and the ×1 boxes are left out." : " Each multiplier box becomes thousands of gates, so noise wipes out the peaks. The most common results are multiples of 128: their low bits are 0 because qubits decay back to 0 during such a long circuit, not because of the period."}` : ""}`;
    render();
  }
  function qftSvg(t) {
    const ops = [];
    for (let i = 0; i < Math.floor(t / 2); i++) ops.push({ swap: [i, t - 1 - i] });
    for (let j = 0; j < t; j++) {
      for (let m = 0; m < j; m++) ops.push({ c: m, tg: j, d: j - m + 1 });
      ops.push({ h: j });
    }
    const lab = 40,
      cw = 34,
      rowH = 28,
      top = 14,
      W = lab + ops.length * cw + 12,
      H = top + t * rowH;
    const y = (i) => top + i * rowH + 6;
    let g = "";
    for (let i = 0; i < t; i++)
      g += `<text x="4" y="${y(i) + 5}" font-size="13" fill="var(--mute)">c${i}</text><line x1="${lab - 6}" x2="${W - 6}" y1="${y(i)}" y2="${y(i)}" stroke="var(--ink)" stroke-width="1.1"/>`;
    ops.forEach((o, n) => {
      const x = lab + n * cw + cw / 2;
      if (o.swap) {
        const [p, q] = o.swap;
        g += `<line x1="${x}" x2="${x}" y1="${y(p)}" y2="${y(q)}" stroke="var(--ink)"/>`;
        for (const r of [p, q])
          g += `<path d="M${x - 5} ${y(r) - 5} L${x + 5} ${y(r) + 5} M${x + 5} ${y(r) - 5} L${x - 5} ${y(r) + 5}" stroke="var(--ink)" stroke-width="1.6"/>`;
      }
      if (o.h !== undefined)
        g += `<rect x="${x - 11}" y="${y(o.h) - 10}" width="22" height="20" rx="3" fill="var(--panel)" stroke="var(--ink)"/><text x="${x}" y="${y(o.h) + 5}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">H</text>`;
      if (o.c !== undefined)
        g += `<line x1="${x}" x2="${x}" y1="${y(o.c)}" y2="${y(o.tg)}" stroke="var(--acc)" stroke-width="1.4"/><circle cx="${x}" cy="${y(o.c)}" r="4" fill="var(--acc)"/><rect x="${x - 14}" y="${y(o.tg) - 10}" width="28" height="20" rx="3" fill="var(--panel)" stroke="var(--acc)"/><text x="${x}" y="${y(o.tg) + 5}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)">R${o.d}†</text>`;
    });
    const nc = ops.filter((o) => o.c !== undefined).length;
    return {
      svg: `<div class="scroll"><svg class="sub-circ" width="${W}" height="${H + 6}" viewBox="0 0 ${W} ${H + 6}" role="img" aria-label="Inverse QFT gate by gate">${g}</svg></div>`,
      nc,
      ns: Math.floor(t / 2),
    };
  }
  function probChart(P, T, mark, label) {
    const bins = Math.min(T, 500),
      bw = 1000 / bins,
      top = Math.max(...P);
    let g = "";
    for (let b = 0; b < bins; b++) {
      let m = 0;
      const x0 = Math.floor((b * T) / bins),
        x1 = Math.floor(((b + 1) * T) / bins);
      for (let x = x0; x < Math.max(x1, x0 + 1); x++) if (P[x] > m) m = P[x];
      const h = Math.max((m / top) * 100, m > 0 ? 1.2 : 0);
      if (h)
        g += `<rect x="${b * bw}" y="${110 - h}" width="${Math.max(bw * 0.8, 1)}" height="${h}" fill="var(--ink)"/>`;
    }
    if (mark !== null) {
      const mx = ((mark + 0.5) / T) * 1000;
      g += `<line x1="${mx}" x2="${mx}" y1="0" y2="110" stroke="var(--acc)" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
    }
    return `<div class="pc"><div class="pc-l">${label}</div><svg viewBox="0 0 1000 112" preserveAspectRatio="none" role="img" aria-label="${label.replace(/<[^>]+>/g, "")}"><line x1="0" x2="1000" y1="110.5" y2="110.5" stroke="var(--line)" vector-effect="non-scaling-stroke"/>${g}</svg><div class="pc-ax"><span>0</span><span>x →</span><span>${T - 1}</span></div></div>`;
  }
  function measState(P, at) {
    const key = `${S.N}:${at.a}:${S.sel}`;
    if (!S.meas || S.meas.key !== key) {
      let c = 0;
      for (let x = 0; x < at.x; x++) c += P[x];
      S.meas = {
        key,
        tally: [at.x],
        shot: { x: at.x, u: c + P[at.x] * Math.random(), first: true },
        anim: true,
      };
    }
    return S.meas;
  }
  function measureAgain(times) {
    const T = 2 ** sim.t,
      P = dist(sim.N, sim.a, T);
    for (let k = 0; k < times; k++) {
      const u = Math.random();
      let c = 0,
        x = 0;
      while (x < T - 1 && c + P[x] < u) {
        c += P[x];
        x++;
      }
      S.meas.tally.push(x);
      S.meas.shot = { x, u, first: false };
    }
    S.meas.anim = true;
    render();
  }
  function grayNote(P) {
    let g = 0;
    for (const p of P) if (p < 0.0015) g += p;
    return g < 0.001
      ? "Every other x has zero chance, so it takes up no room at all."
      : `Gray: the many other x values, each with a tiny chance, together about ${(g * 100).toFixed(0)}%.`;
  }
  function stripSvg(P, T, r) {
    let g = "",
      pos = 0,
      run = 0;
    const flush = () => {
      if (run > 0) {
        g += `<rect x="${pos * 1000}" y="0" width="${run * 1000}" height="40" fill="var(--soft)"/>`;
        pos += run;
        run = 0;
      }
    };
    for (let x = 0; x < T; x++) {
      if (P[x] < 0.0015) {
        run += P[x];
        continue;
      }
      flush();
      const peak = Math.round((x * r) / T) % r;
      g += `<rect x="${pos * 1000}" y="0" width="${P[x] * 1000}" height="40" fill="${peak % 2 ? "var(--ink)" : "var(--mute)"}" stroke="var(--panel)" stroke-width="1" vector-effect="non-scaling-stroke"><title>x = ${x}: ${(P[x] * 100).toFixed(2)}%</title></rect>`;
      pos += P[x];
    }
    flush();
    return `<svg class="stripc" viewBox="0 0 1000 40" preserveAspectRatio="none" role="img" aria-label="All measurement chances laid end to end">${g}</svg>`;
  }
  function drawDetail() {
    const k = S.detail;
    if (k === null || k === undefined || k > sim.t + 2) {
      $("detail").hidden = true;
      return;
    }
    const { t, N, a, mult } = sim,
      at = S.run[S.sel];
    $("detail").hidden = false;
    let title = "",
      body = "";
    if (k === 0) {
      title = "H, the Hadamard gate";
      body = `<p>H acts on one qubit. It turns a definite 0 into an equal mix of 0 and 1:</p>
<p>|0⟩ → (|0⟩ + |1⟩) / √2 &nbsp;&nbsp; and &nbsp;&nbsp; |1⟩ → (|0⟩ − |1⟩) / √2</p>
<p>As a matrix: H = 1/√2 <span class="mat"><span>1</span><span>1</span><span>1</span><span>−1</span></span></p>
<p><b>Why it's here:</b> one H on each of the ${t} top wires gives every combination of ${t} bits at once, so the top wires hold all ${2 ** t} numbers from 0 to ${2 ** t - 1}. Every later gate then acts on all of them together.</p>`;
    } else if (k <= t) {
      const j = k - 1,
        v = mult[j];
      title = `Controlled ×${v} (controlled by c${j})`;
      body = `<p>When c${j} is 1, this gate replaces the number y on the bottom wires with <b>y × ${v} mod ${N}</b>. When c${j} is 0, it does nothing. Here ${v} = ${a}<sup>${2 ** j}</sup> mod ${N}.</p>
${v === 1 ? `<p>Multiplying by 1 changes nothing, so this gate could be left out.</p>` : `<p>Because ${v} shares no factor with ${N}, no two inputs end up on the same output, so the gate can be undone. Every quantum gate must be reversible like that.</p>`}
<p><b>Inside the box:</b> real hardware builds a modular multiplier from quantum adder circuits: hundreds of gates even for N = ${N}, so it is drawn as one box here, as in most textbooks.</p>`;
    } else if (k === t + 1) {
      const q = qftSvg(t);
      title = "QFT†, the inverse quantum Fourier transform";
      const T = 2 ** t,
        r = order(a, N),
        after = measureProbs(T, r),
        before = new Float64Array(T).fill(1 / T),
        mx = at.circuit ? at.x : null,
        top = Math.max(...after);
      body = `<p><b>What it does.</b> ${S.src === "hw" && hwCase(N, a) ? "All three charts" : "Both charts"} show how likely each measured value x would be, on the same scale.</p>
${probChart(before, T, null, `If you measured <b>before</b> QFT†: every x equally likely, 1 in ${T} each (${(100 / T).toFixed(3)}%). The measurement would say nothing.`)}
${probChart(after, T, S.src === "hw" ? null : mx, `${S.src === "hw" ? "On a perfect machine, if" : "If"} you measure <b>after</b> QFT†: ${r} peaks, ${Number.isInteger(T / r) ? T / r : "about " + (T / r).toFixed(1)} apart, the tallest about ${(top * 100).toFixed(1)}% likely. Almost every other x is close to 0.${mx !== null ? ` Orange line: this attempt's x = ${mx}.` : ""}`)}
${S.src === "hw" && hwCase(N, a) ? probChart(hwDist(hwCase(N, a), T), T, mx, `${S.hw.mode === "ibm" ? "Measured <b>for real</b>" : "Measured <b>with simulated hardware noise</b>"} after QFT†, on ${hwLabel()}: ${hwCase(N, a).shots} shots. ${Math.round(hwCase(N, a).quality.on_peak_share * 100)}% landed on a peak (a perfect machine: ${Math.round(hwCase(N, a).quality.ideal_on_peak_share * 100)}%; pure noise: ${Math.max(1, Math.round(hwCase(N, a).quality.uniform_on_peak_share * 100))}%). The rest is noise.${mx !== null ? " Orange line: this attempt's x." : ""}`) : ""}
<p>The QFT† takes the repeat hidden in the multiplies (period r = ${r}) and turns it into peaks spaced ${T} ÷ ${r} apart, so a single measurement lands on one and gives the period away.</p>
<p><b>What's inside.</b> The one block in the main circuit is really these gates, run left to right:</p>${q.svg}
<p><b>× pairs:</b> ${q.ns} swaps that reverse the wire order. <b>H:</b> Hadamards. <b>R<sub>d</sub>†:</b> ${q.nc} controlled phase rotations. Each turns the phase of its wire back by 360° ÷ 2<sup>d</sup>, only when its orange dot's wire is 1. Bigger d means a smaller turn.</p>
<p>The rotations make the repeats line up and add together at the peak values, and cancel everywhere else.</p>`;
    } else {
      title = "Measurement: one weighted random draw";
      if (!at.circuit)
        body = `<p>Each meter reads its qubit as a plain 0 or 1. This run never measured, because gcd found a factor first.</p>`;
      else {
        const T = 2 ** t,
          r = order(a, N),
          P = dist(N, a, T),
          m = measState(P, at);
        const shot = m.shot,
          n = m.tally.length,
          counts = new Float64Array(T);
        for (const x of m.tally) counts[x] += 1 / n;
        const delta = new Float64Array(T);
        delta[shot.x] = 1;
        body = `<p>Measuring doesn't calculate anything. Nature picks one x at random, and each x's chance is its height in the QFT† chart. Lay all ${T} chances end to end, then drop a dart:</p>
${stripSvg(P, T, r)}
<div class="dartrow"><div class="dart" id="dart" style="left:${m.anim ? 0 : shot.u * 100}%"></div></div>
<p class="sub" style="margin-top:0">Each dark block is one x, as wide as its chance. ${grayNote(P)}</p>
<p class="landed">The dart landed on <b>x = ${shot.x}</b> &nbsp;·&nbsp; binary ${shot.x.toString(2).padStart(t, "0")}</p>
${probChart(delta, T, shot.x, `<b>After</b> measuring, the mix is gone: the qubits now hold x = ${shot.x} for certain. The other peaks have collapsed to 0.${shot.first ? " These are the bits shown on the wires in the circuit above." : ""}`)}
<div class="meas"><button id="bAgain" class="primary">Measure again, same state</button><button id="bAgain50">Measure 50 times</button><span class="sub">${n} shot${n === 1 ? "" : "s"} so far</span></div>
${n > 1 ? probChart(counts, T, null, `Tally of ${n} shots. Each shot lands on a different peak; together they rebuild the QFT† chart. One run of the algorithm only ever gets one of them.`) : ""}`;
      }
    }
    $("dTitle").textContent = title;
    $("dBody").innerHTML = body;
    if (k === t + 2 && at.circuit && S.meas) {
      const d = $("dart"),
        u = S.meas.shot.u;
      if (S.meas.anim && d) {
        S.meas.anim = false;
        setTimeout(() => {
          d.style.left = u * 100 + "%";
        }, 40);
      }
      $("bAgain").onclick = () => measureAgain(1);
      $("bAgain50").onclick = () => measureAgain(50);
    }
  }
  function drawMath() {
    const at = S.run[S.sel],
      N = S.N;
    if (!at.circuit) {
      $("mathTitle").textContent = "No measurement this run";
      $("math").innerHTML =
        `<p class="why">Attempt ${S.sel + 1} picked a = ${at.a}, and gcd(${at.a}, ${N}) was already a factor, so the circuit never ran. Press Run again for a run that uses it.</p>`;
      return;
    }
    const d = at.d;
    $("mathTitle").textContent =
      `From the measurement x = ${at.x} to the factors (attempt ${S.sel + 1}, a = ${at.a})`;
    $("math").innerHTML =
      `<ol class="dec">${d.steps.map((x) => `<li><b>${x.title}</b><div class="eqs">${x.eqs.map((e) => `<div>${e}</div>`).join("")}</div><p class="why">${x.note}</p></li>`).join("")}</ol><p class="verdict ${d.ok ? "ok" : "no"}">${d.ok ? `Factors: <span>${N} = ${d.p} × ${d.q}</span>` : d.why.replace("Measure again.", "The algorithm starts over with a new a.").replace("Pick another base a.", "The algorithm starts over with a new a.")}</p>`;
  }
  function render() {
    const last = sim.t + 3;
    $("scrub").max = last;
    $("scrub").value = S.stage;
    const [name, text] = stepText(S.stage);
    $("stepName").textContent = `${S.stage} / ${last}: ${name}`;
    $("now").innerHTML = text;
    $("bPrev").disabled = S.stage === 0;
    $("bNext").disabled = S.stage === last;
    drawCircuit();
    drawMath();
    drawDetail();
  }
  function go(st) {
    S.stage = Math.max(0, Math.min(sim.t + 3, st));
    render();
  }
  function stop() {
    if (S.playing) {
      clearInterval(S.playing);
      S.playing = null;
      $("bPlay").textContent = "Play";
    }
  }
  function play() {
    if (S.playing) return stop();
    if (S.stage === sim.t + 3) S.stage = 0;
    $("bPlay").textContent = "Pause";
    render();
    S.playing = setInterval(() => {
      if (S.stage >= sim.t + 3) return stop();
      go(S.stage + 1);
    }, 1400);
  }
  $("selN").onchange = (e) => {
    S.N = +e.target.value;
    newRun();
  };
  $("bRun").onclick = newRun;
  function applySrc() {
    const hasHw = !!S.hw;
    $("optHw").disabled = !hasHw;
    $("optHw").textContent = hasHw
      ? S.hw.mode === "ibm"
        ? `IBM ${S.hw.backend}`
        : "IBM preview (noisy simulation)"
      : "IBM hardware (load a results file)";
    if (S.src === "hw" && !hasHw) S.src = "sim";
    $("selSrc").value = S.src;
    const ns = hasHw ? new Set(S.hw.cases.filter((c) => c.counts).map((c) => c.n)) : null;
    for (const o of $("selN").options) o.disabled = S.src === "hw" && !ns.has(+o.value);
    if (S.src === "hw" && !ns.has(S.N)) {
      S.N = Math.min(...ns);
      $("selN").value = String(S.N);
    }
  }
  $("selSrc").onchange = (e) => {
    S.src = e.target.value;
    if (S.src === "hw") {
      S.N = 15;
      $("selN").value = "15";
    }
    applySrc();
    newRun();
  };
  $("fileHw").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const d = JSON.parse(txt);
        if (!Array.isArray(d.cases)) throw new Error("no cases");
        S.hw = d;
        S.src = "hw";
        applySrc();
        newRun();
      } catch (err) {
        $("srcNote").hidden = false;
        $("srcNote").textContent =
          `That file isn't a results file from shor_hardware_run.py (${err.message}).`;
      }
    });
  };
  $("att").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    S.sel = +b.dataset.i;
    S.stage = 0;
    rebuild();
  };
  $("bPrev").onclick = () => {
    stop();
    go(S.stage - 1);
  };
  $("bNext").onclick = () => {
    stop();
    go(S.stage + 1);
  };
  $("bPlay").onclick = play;
  $("scrub").oninput = (e) => {
    stop();
    go(+e.target.value);
  };
  $("circ").onclick = (e) => {
    const k = e.target.dataset?.k;
    if (k === undefined) return;
    stop();
    S.detail = +k;
    go(+k + 1);
  };
  $("dClose").onclick = () => {
    S.detail = null;
    render();
  };
  $("circ").onkeydown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(S.stage + 1);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(S.stage - 1);
    }
  };
  const ro = new ResizeObserver(() => drawCircuit());
  ro.observe($("circ").parentElement);
  /* ---------- what the chip actually runs (compiled circuit from ibm_kingston) ---------- */
  {
    const C = CHIP,
      used = new Set(C.used),
      isWork = (q) => C.work.includes(q);
    const role = (q) => (isWork(q) ? "work" : `c${C.meas[q]}`);
    const czCount = {};
    for (const [, n, qs] of C.gates)
      if (n === "cz") {
        const k = [...qs].sort((a, b) => a - b).join("-");
        czCount[k] = (czCount[k] || 0) + 1;
      }
    function drawMap() {
      const sx = 52,
        sy = 34,
        pad = 26,
        W = pad * 2 + 15 * sx + 24,
        H = pad * 2 + 14 * sy + 14;
      const P = (q) => [pad + C.pos[q][0] * sx, pad + C.pos[q][1] * sy];
      const svg = $("chipMap");
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      let g = "";
      for (const [u, v] of C.edges) {
        const [x1, y1] = P(u),
          [x2, y2] = P(v),
          n = czCount[`${u}-${v}`] || 0;
        g += n
          ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="${2 + Math.sqrt(n) * 0.9}" stroke-linecap="round"><title>${n} cz gates between qubits ${u} and ${v}</title></line>`
          : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line)" stroke-width="1.5"/>`;
      }
      for (let q = 0; q < 156; q++) {
        const [x, y] = P(q);
        if (!used.has(q)) {
          g += `<circle cx="${x}" cy="${y}" r="4" fill="var(--line)"><title>qubit ${q}, unused</title></circle>`;
          continue;
        }
        const w = isWork(q);
        g += `<circle cx="${x}" cy="${y}" r="13" fill="${w ? "var(--panel)" : "var(--ink)"}" stroke="${w ? "var(--acc)" : "var(--ink)"}" stroke-width="3"><title>qubit ${q}: ${w ? "work qubit" : `counting qubit c${C.meas[q]}`}</title></circle>`;
        g += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${w ? "var(--ink)" : "var(--bg)"}" pointer-events="none">${q}</text>`;
        g += `<text x="${x + 15}" y="${y - 11}" text-anchor="start" font-size="12" font-weight="600" fill="${w ? "var(--acc-ink)" : "var(--ink)"}" paint-order="stroke" stroke="var(--panel)" stroke-width="4" pointer-events="none">${role(q)}</text>`;
      }
      svg.innerHTML = g;
    }
    const rows = [51, 58, 70, 71, 72, 79, 73, 74, 75, 59, 55, 54].filter((q) => used.has(q));
    const rowOf = Object.fromEntries(rows.map((q, i) => [q, i]));
    /* lay gates out again in this row order: a cz also blocks the rows its line crosses */
    const lv = new Array(rows.length).fill(0),
      sched = C.gates.map(([, n, qs, arg, sw]) => {
        const rs = qs.map((q) => rowOf[q]),
          lo = Math.min(...rs),
          hi = Math.max(...rs);
        let l = 0;
        for (let r = lo; r <= hi; r++) l = Math.max(l, lv[r]);
        for (let r = lo; r <= hi; r++) lv[r] = l + 1;
        return [l, n, qs, arg, sw];
      }),
      depth = Math.max(...lv);
    let zoom = false;
    function angle(s) {
      return s
        .replace(/\*/g, "")
        .replace(/pi/g, "π")
        .replace(/^(-?\d+\.\d{2})\d+$/, "$1");
    }
    function drawCmp() {
      const cw = zoom ? 36 : 7,
        rh = zoom ? 32 : 16,
        lab = zoom ? 92 : 78,
        top = 10,
        hl = $("hlSwap").checked;
      const W = lab + depth * cw + 14,
        H = top + rows.length * rh + 8,
        y = (q) => top + rowOf[q] * rh + rh / 2;
      const svg = $("cmpCirc");
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      let g = "";
      for (const q of rows) {
        g += `<text x="6" y="${y(q) + 4}" font-size="12" font-weight="600" fill="${isWork(q) ? "var(--acc-ink)" : "var(--ink)"}">${role(q)}</text><text x="${zoom ? 46 : 38}" y="${y(q) + 4}" font-size="12" fill="var(--mute)">q${q}</text>`;
        g += `<line x1="${lab - 4}" x2="${W - 8}" y1="${y(q)}" y2="${y(q)}" stroke="var(--line)" stroke-width="1"/>`;
      }
      for (const [l, n, qs, arg, sw] of sched) {
        const x = lab + l * cw + cw / 2,
          isSw = hl && sw,
          col = isSw ? "var(--acc)" : n === "cz" ? "var(--ink)" : "var(--mute)";
        const tip = `<title>${n}${arg ? `(${angle(arg)})` : ""} on ${qs.map((q) => `q${q} (${role(q)})`).join(" and ")}${sw ? `, part of swap ${sw}` : ""}</title>`;
        if (n === "cz") {
          const [a, b] = qs.map(y);
          g += `<g>${tip}<line x1="${x}" x2="${x}" y1="${a}" y2="${b}" stroke="${col}" stroke-width="${zoom ? 2 : 1.6}"/><circle cx="${x}" cy="${a}" r="${zoom ? 4.5 : 2.6}" fill="${col}"/><circle cx="${x}" cy="${b}" r="${zoom ? 4.5 : 2.6}" fill="${col}"/></g>`;
        } else if (zoom) {
          const bw = n === "rz" ? 32 : 24;
          g += `<g>${tip}<rect x="${x - bw / 2}" y="${y(qs[0]) - 10}" width="${bw}" height="20" rx="3" fill="var(--panel)" stroke="${col}" stroke-width="1.3"/><text x="${x}" y="${y(qs[0]) + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${isSw ? "var(--acc-ink)" : "var(--ink)"}">${n}</text></g>`;
        } else {
          g += `<rect x="${x - 2.5}" y="${y(qs[0]) - 3}" width="5" height="6" rx="1" fill="${n === "rz" ? "var(--line)" : col}" opacity="${n === "rz" ? 1 : 0.75}">${tip}</rect>`;
        }
      }
      for (const q of rows)
        if (!isWork(q))
          g += `<text x="${W - 10}" y="${y(q) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">→ c${C.meas[q]}</text>`;
      svg.innerHTML = g;
    }
    let drawn = false;
    $("bChip").onclick = () => {
      const open = $("chipBody").hidden;
      $("chipBody").hidden = !open;
      $("bChip").textContent = open ? "Hide" : "Show it";
      $("bChip").setAttribute("aria-expanded", String(open));
      if (open && !drawn) {
        drawn = true;
        drawMap();
        drawCmp();
        $("qasmTxt").textContent = C.qasm;
      }
    };
    const setZoom = (z) => {
      zoom = z;
      $("zWhole").setAttribute("aria-pressed", String(!z));
      $("zIn").setAttribute("aria-pressed", String(z));
      drawCmp();
      $("cmpScroll").scrollLeft = 0;
    };
    $("zWhole").onclick = () => setZoom(false);
    $("zIn").onclick = () => setZoom(true);
    $("hlSwap").onchange = drawCmp;
  }

  // Opened from a Redux run ("Explore this circuit"): start on that run's N.
  const askedN = Number(new URLSearchParams(window.location.search).get("N"));
  if (Number.isInteger(askedN) && askedN >= 15 && askedN <= 255) {
    const select = $("selN");
    if (![...select.options].some((o) => +o.value === askedN)) {
      const option = document.createElement("option");
      option.textContent = String(askedN);
      select.append(option);
    }
    select.value = String(askedN);
    S.N = askedN;
  }
  S.hw = HW_EMBED;
  applySrc();
  newRun();

  return () => {
    stop();
    ro.disconnect();
    roS.disconnect();
  };
}
