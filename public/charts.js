const NS = 'http://www.w3.org/2000/svg';
const el = (n, attrs = {}, text) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

// 目盛りは人が読める刻みへ丸める。1/2/5×10^n 以外を軸に出さない。
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const s of [1, 2, 2.5, 5, 10]) if (v <= s * p) return s * p;
  return 10 * p;
}

function tooltip(host) {
  const t = document.createElement('div');
  t.className = 'tip';
  t.hidden = true;
  host.appendChild(t);
  return {
    show(x, y, html) { t.innerHTML = html; t.hidden = false; t.style.left = x + 'px'; t.style.top = y + 'px'; },
    hide() { t.hidden = true; },
  };
}

// 売上と経費は同じ単位・同じスケールなので1軸のグループ棒で並べる。
export function monthlyColumns(host, { revenue, expense, labels }) {
  host.innerHTML = '';
  host.style.position = 'relative';
  const tip = tooltip(host);

  const W = 760, H = 240, padL = 56, padR = 8, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = niceMax(Math.max(...revenue, ...expense, 1));
  const y = (v) => padT + ih - (v / max) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': '月次の売上と経費' });

  for (let i = 0; i <= 5; i++) {
    const v = (max / 5) * i;
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'grid' }));
    svg.appendChild(el('text', { x: padL - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' },
      v >= 10000 ? `${Math.round(v / 10000)}万` : String(v)));
  }

  const band = iw / 12;
  const bw = Math.min(14, (band - 6) / 2);
  labels.forEach((label, i) => {
    const cx = padL + band * i + band / 2;
    svg.appendChild(el('text', { x: cx, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, label));

    // 値が0の月も薄い台座を描く。売上と経費が常に対で並び、欠けと0が見分けられる。
    [['rev', revenue[i], cx - bw - 1], ['exp', expense[i], cx + 1]].forEach(([k, v, x]) => {
      const h = Math.max(2, ih - (y(v) - padT));
      const r = el('rect', {
        x, y: v ? y(v) : y(0) - 2, width: bw, height: v ? h : 2, rx: v ? 4 : 1,
        class: v ? `bar ${k}` : 'bar zero',
      });
      r.addEventListener('pointerenter', (ev) => {
        const b = host.getBoundingClientRect();
        tip.show(ev.clientX - b.left, ev.clientY - b.top - 8,
          `<b>${label}</b><br>売上 ${yen(revenue[i])}<br>経費 ${yen(expense[i])}`);
      });
      r.addEventListener('pointerleave', tip.hide);
      svg.appendChild(r);
    });
  });

  host.appendChild(svg);
}

const SLOTS = 6;

// 色数の上限を超えた科目は「その他」へ畳む。9個目の色を作らない。
function foldTail(rows, keep) {
  if (rows.length <= keep) return rows;
  const head = rows.slice(0, keep - 1);
  const tail = rows.slice(keep - 1);
  return [...head, {
    code: '__other', name: 'その他',
    total: tail.reduce((a, r) => a + r.total, 0),
    members: tail,
  }];
}

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];

export function expenseDonut(host, rows, total) {
  host.innerHTML = '';
  host.style.position = 'relative';
  if (!total) return void (host.innerHTML = '<p class="hint">データがありません</p>');

  const data = foldTail(rows, SLOTS);
  const tip = tooltip(host);

  const S = 240, cx = S / 2, cy = S / 2, R = 104, r0 = 62;
  const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, class: 'donut', role: 'img', 'aria-label': '経費の内訳' });

  let a = 0;
  data.forEach((d, i) => {
    const frac = d.total / total;
    const a1 = a + frac * Math.PI * 2;
    const large = a1 - a > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, R, a), [x1, y1] = polar(cx, cy, R, a1);
    const [u0, v0] = polar(cx, cy, r0, a1), [u1, v1] = polar(cx, cy, r0, a);

    const path = el('path', {
      d: `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${u0} ${v0}A${r0} ${r0} 0 ${large} 0 ${u1} ${v1}Z`,
      class: `slice s${i + 1}`,
    });
    path.addEventListener('pointerenter', (ev) => {
      const b = host.getBoundingClientRect();
      tip.show(ev.clientX - b.left, ev.clientY - b.top - 8,
        `<b>${d.name}</b><br>${yen(d.total)}　${(frac * 100).toFixed(1)}%`);
    });
    path.addEventListener('pointerleave', tip.hide);
    svg.appendChild(path);
    a = a1;
  });

  svg.appendChild(el('text', { x: cx, y: cy - 4, class: 'donut-total', 'text-anchor': 'middle' }, yen(total)));
  svg.appendChild(el('text', { x: cx, y: cy + 14, class: 'donut-sub', 'text-anchor': 'middle' }, '経費計'));

  const legend = document.createElement('ul');
  legend.className = 'donut-legend';
  legend.innerHTML = data.map((d, i) => `
    <li><i class="s${i + 1}"></i>
      <span class="dl-name">${d.name}</span>
      <span class="dl-val">${yen(d.total)}</span>
      <span class="dl-pct">${((d.total / total) * 100).toFixed(1)}%</span>
    </li>`).join('');

  host.append(svg, legend);
}
