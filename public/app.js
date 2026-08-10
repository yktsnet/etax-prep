import { monthlyColumns, expenseDonut } from '/charts.js';
import { icon } from '/icons.js';

const $ = (s) => document.querySelector(s);
const yen = (n) => (n < 0 ? '-' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
const api = async (p, opt) => {
  const r = await fetch(p, opt);
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
  return r.json();
};

const MONTHS = [...Array(12)].map((_, i) => `${i + 1}月`);
const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// data-icon を実SVGへ置き換える。静的HTMLと動的生成の両方で同じ経路を通す。
function paintIcons(root = document) {
  for (const n of root.querySelectorAll('i[data-icon]')) {
    n.innerHTML = icon(n.dataset.icon);
    n.removeAttribute('data-icon');
  }
}

let accounts, kind = 'expense', picked = null;
let year = new Date().getFullYear();
let assetKind = null;
const byCode = new Map();
const recent = JSON.parse(localStorage.getItem('recent') ?? '[]');

document.querySelectorAll('#tabs button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('#tabs button, .tab').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    $('#' + b.dataset.tab).classList.add('on');
    ({ ledger: renderList, business: renderBusiness, tax: renderTax, settings: renderSettings })[b.dataset.tab]?.();
  };
});

/* ---------- entry ---------- */

function accountList() {
  const list = kind === 'revenue' ? accounts.revenue : [...accounts.expense, ...accounts.hidden];
  const visible = kind === 'revenue' ? list : accounts.expense.slice();
  const extra = recent.map((c) => list.find((a) => a.code === c)).filter((a) => a && !visible.includes(a));
  return [...extra, ...visible].sort((a, b) => {
    const i = recent.indexOf(a.code), j = recent.indexOf(b.code);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });
}

function renderAccounts() {
  const box = $('#accounts');
  box.innerHTML = '';
  for (const a of accountList()) {
    const b = document.createElement('button');
    b.innerHTML = `${icon(a.icon)}<span>${a.name}</span>`;
    b.onclick = () => {
      picked = a;
      [...box.children].forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      $('#ratio').value = a.ratio ?? 1;
      $('#settai').hidden = !a.note;
      checkAsset();
    };
    box.appendChild(b);
  }
  picked = null;
}

function checkAsset() {
  const v = Number($('#amount').value);
  const w = $('#asset-warn');
  if (!picked?.asset || !(v >= 100000)) return void (w.hidden = true);
  w.hidden = false;
  w.innerHTML = v < 300000
    ? `${icon('circle-alert')}<span>10万円以上。処理を選んでください。</span>
       <span class="choices">
         <button data-k="lump"${assetKind === 'lump' ? ' class="on"' : ''}>一括償却（3年均等）</button>
         <button data-k="small"${assetKind === 'small' ? ' class="on"' : ''}>少額特例（全額）</button>
       </span>`
    : `${icon('circle-alert')}<span>30万円以上。少額特例の対象外で、本来の減価償却が必要。このアプリは未対応のため手で処理する。</span>`;

  w.querySelectorAll('.choices button').forEach((b) => {
    b.onclick = () => {
      assetKind = assetKind === b.dataset.k ? null : b.dataset.k;
      checkAsset();
    };
  });
}
$('#amount').oninput = checkAsset;

function setKind(k) {
  kind = k;
  $('.switch').dataset.kind = k;
  $('#k-expense').classList.toggle('on', k === 'expense');
  $('#k-revenue').classList.toggle('on', k === 'revenue');
  renderAccounts();
}
$('#k-expense').onclick = () => setKind('expense');
$('#k-revenue').onclick = () => setKind('revenue');

// Retina のスクショは実寸が大きい。長辺と WebP 再圧縮で落とす（hi と同じ方針）。
async function compressImage(blob, { maxDim = 1600, quality = 0.85, skipBelowBytes = 300 * 1024 } = {}) {
  let bitmap;
  try { bitmap = await createImageBitmap(blob); } catch { return blob; }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && blob.size <= skipBelowBytes) { bitmap.close(); return blob; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  return out && out.size < blob.size ? out : blob;
}

const kb = (n) => Math.round(n / 1024);
const uploadReceipt = (id, blob) =>
  fetch(`/api/receipts/${id}?name=${Date.now()}.${blob.type.split('/')[1] || 'png'}`, { method: 'POST', body: blob });

// 貼り付けとファイル選択の両方が、圧縮して onDone へ渡す先を共有する。
// 画像以外が来たら何もしない（貼り付け・選択どちらでも同じ扱い）。
async function attachImage(file, onDone) {
  if (!file || !file.type.startsWith('image/')) return;
  onDone(await compressImage(file), file);
}

async function takePaste(ev, onDone) {
  const item = [...(ev.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  ev.preventDefault();
  await attachImage(item.getAsFile(), onDone);
}

// 同じファイルを選び直せるよう、処理後は毎回 input の値をクリアする。
function takeFile(onDone) {
  return async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    await attachImage(file, onDone);
  };
}

// 入力画面ではまだ取引が存在しないため、登録が済むまで画像を保持しておく。
let pending = null;
function applyPending(blob, original) {
  pending = blob;
  $('#paste-img').src = URL.createObjectURL(blob);
  $('#paste-preview').hidden = false;
  $('#paste-status').textContent = blob === original
    ? `${kb(blob.size)}KB を添付します`
    : `${kb(original.size)}KB → ${kb(blob.size)}KB に圧縮して添付します`;
}

$('#paste-area').onclick = () => $('#paste-area').focus();
$('#paste-clear').onclick = clearPending;
document.addEventListener('paste', (ev) => {
  if (!$('#entry').classList.contains('on')) return;
  takePaste(ev, applyPending);
});
$('#file-input').onchange = takeFile(applyPending);

function clearPending() {
  pending = null;
  $('#paste-preview').hidden = true;
  $('#paste-img').removeAttribute('src');
}

$('#submit').onclick = async () => {
  const amount = Number($('#amount').value);
  if (!(amount > 0)) return void ($('#msg').textContent = '金額を入れてください');
  if (!picked) return void ($('#msg').textContent = '勘定科目を選んでください');

  const note = [$('#note').value, $('#who').value && `相手: ${$('#who').value}`, $('#purpose').value && `目的: ${$('#purpose').value}`]
    .filter(Boolean).join(' / ');

  const created = await api('/api/entries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind, amount, account: picked.code,
      date: $('#date').value || undefined,
      ratio: Number($('#ratio').value),
      payee: $('#payee').value, note,
      assetKind: Number($('#amount').value) >= 100000 ? assetKind : null,
    }),
  });
  if (pending) await uploadReceipt(created.id, pending);

  recent.splice(0, 0, picked.code);
  localStorage.setItem('recent', JSON.stringify([...new Set(recent)].slice(0, 8)));

  $('#msg').textContent = `${picked.name} ${yen(amount)} を登録しました${pending ? '（証憑つき）' : ''}`;
  clearPending();
  assetKind = null;
  for (const id of ['#amount', '#payee', '#note', '#who', '#purpose']) $(id).value = '';
  $('#settai').hidden = true;
  $('#asset-warn').hidden = true;
  renderAccounts();
  renderRecent();
  setTimeout(() => ($('#msg').textContent = ''), 2500);
};

async function renderRecent() {
  const entries = (await api('/api/entries')).filter((e) => !e.void).slice(0, 5);
  $('#recent-list').innerHTML = entries.length
    ? entries.map((e) => {
      const a = byCode.get(e.account);
      return `<div class="ritem">${icon(a?.icon ?? 'circle-help')}
        <span class="rn">${a?.name ?? e.account}${e.payee ? ` · ${e.payee}` : ''}</span>
        <span class="rd">${e.date.slice(5).replace('-', '/')}</span>
        <span class="ra">${e.kind === 'revenue' ? '+' : ''}${yen(e.amount)}</span></div>`;
    }).join('')
    : '<p class="empty">まだ登録がありません</p>';
}

/* ---------- ledger ---------- */

async function renderList() {
  const box = $('#entries');
  const entries = await api('/api/entries');
  box.innerHTML = '';

  const months = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort().reverse();
  $('#months').innerHTML = months.map((m) => {
    const mi = Number(m.slice(5, 7)) - 1;
    return `<button data-m="${m}"><span class="mo">${MON_EN[mi]}</span>${m.slice(2, 4)}</button>`;
  }).join('');
  $('#months').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.months button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      document.getElementById(`m-${b.dataset.m}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  let cur = null;
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    if (m !== cur) {
      cur = m;
      const mi = Number(m.slice(5, 7)) - 1;
      const sum = entries
        .filter((x) => x.date.startsWith(m) && !x.void && x.kind === 'expense')
        .reduce((a, x) => a + Math.round(x.amount * (x.ratio ?? 1)), 0);
      const h = document.createElement('div');
      h.className = 'mhead';
      h.id = `m-${m}`;
      h.innerHTML = `<span class="ml"><span class="mo">${MON_EN[mi]}</span><span class="my">${m.slice(0, 4)}年${mi + 1}月</span></span>
        <span class="ms">経費 ${yen(sum)}</span>`;
      box.appendChild(h);
    }

    const a = byCode.get(e.account);
    const row = document.createElement('div');
    row.className = 'item' + (e.void ? ' voided' : '');
    row.innerHTML = `<span class="d">${Number(e.date.slice(8))}</span>
      ${icon(a?.icon ?? 'circle-help')}
      <span class="n">${a?.name ?? e.account}${e.payee ? ` · ${e.payee}` : ''}${e.note ? ` · ${e.note}` : ''}</span>
      ${e.receipts?.length ? `<span class="tag">${icon('image')}${e.receipts.length}</span>` : ''}
      ${e.ratio !== 1 ? `<span class="tag">${Math.round(e.ratio * 100)}%</span>` : ''}
      <span class="a">${e.kind === 'revenue' ? '+' : ''}${yen(e.amount)}</span>`;
    row.onclick = () => openEdit(row, e);
    box.appendChild(row);
  }
}

function openEdit(row, e) {
  const box = document.createElement('div');
  box.className = 'edit';
  box.innerHTML = `
    <div class="egrid">
      <label>日付<input type="date" value="${e.date}"></label>
      <label>金額<input type="number" value="${e.amount}"></label>
      <label>勘定科目<select>${[...byCode.values()].map((a) => `<option value="${a.code}"${a.code === e.account ? ' selected' : ''}>${a.name}</option>`).join('')}</select></label>
      <label>按分率<input type="number" step="0.05" min="0" max="1" value="${e.ratio}"></label>
      <label class="wide">取引先<input type="text" value="${e.payee ?? ''}"></label>
      <label class="wide">摘要<input type="text" value="${e.note ?? ''}"></label>
    </div>
    <div class="shots">${(e.receipts ?? []).map((r) => `
      <span class="shot"><a href="/api/receipts/${r}" target="_blank"><img src="/api/receipts/${r}" alt=""></a>
      <button class="shot-x" data-r="${r}" title="この取引から外す">${icon('x')}</button></span>`).join('')}</div>
    <p class="hint">${e.receipts?.length ? `証憑 ${e.receipts.length}件` : '証憑なし'}。貼り付け（⌘V / Ctrl+V）またはファイル選択で添付できます。</p>
    <label class="file-btn">${icon('image')}ファイルを選ぶ<input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" hidden></label>
    <div class="row">
      <button data-a="save">保存</button>
      <button data-a="void" class="warn-btn">${e.void ? '取消を戻す' : '取り消す'}</button>
      <button data-a="cancel">閉じる</button>
    </div>`;
  row.replaceWith(box);

  const [date, amount] = box.querySelectorAll('input[type=date], input[type=number]');
  const sel = box.querySelector('select');
  const [ratio] = [...box.querySelectorAll('input[type=number]')].slice(1);
  const [payee, note] = box.querySelectorAll('input[type=text]');

  const attachToEntry = async (blob) => {
    await uploadReceipt(e.id, blob);
    renderList();
  };
  box.onpaste = (ev) => takePaste(ev, attachToEntry);
  box.querySelector('.file-btn input').onchange = takeFile(attachToEntry);

  const patch = (body) => api(`/api/entries/${e.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(renderList);

  box.querySelectorAll('.shot-x').forEach((b) => {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm('この証憑を取引から外しますか。ファイル自体はリポジトリに残ります。')) return;
      await api(`/api/receipts/${b.dataset.r}`, { method: 'DELETE' });
      renderList();
    };
  });

  box.querySelector('[data-a=cancel]').onclick = renderList;
  box.querySelector('[data-a=void]').onclick = () => patch({ void: !e.void });
  box.querySelector('[data-a=save]').onclick = () => patch({
    date: date.value, amount: Number(amount.value), account: sel.value,
    ratio: Number(ratio.value), payee: payee.value, note: note.value,
  });
}

/* ---------- business ---------- */

const card = (k, v, { ic, sub, hl } = {}) =>
  `<div class="card${hl ? ' hl' : ''}">
     <div class="k">${ic ? icon(ic) : ''}${k}</div>
     <div class="v">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}
   </div>`;

async function yearBar() {
  const years = await api('/api/years');
  if (!years.includes(year)) years.unshift(year);
  return `<select class="yearsel">${years.map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}年</option>`).join('')}</select>`;
}

function bindYear(root, rerender) {
  root.querySelector('.yearsel')?.addEventListener('change', (ev) => {
    year = Number(ev.target.value);
    rerender();
  });
}

async function renderBusiness() {
  const d = await api(`/api/dashboard?year=${year}`);

  $('#biz-year').innerHTML = await yearBar();
  bindYear($('#biz-year'), renderBusiness);

  $('#biz-cards').innerHTML = [
    card('売上', yen(d.revenue.total), { ic: 'coins' }),
    card('経費（按分後）', yen(d.expense.total), { ic: 'wallet' }),
    card('差引利益', yen(d.profit), { ic: 'trending-up' }),
    card('事業所得', yen(d.businessIncome), { ic: 'piggy-bank', sub: `青色申告特別控除 ${yen(d.aoiro)} 後`, hl: true }),
  ].join('');

  $('#lg-month').innerHTML =
    `<span><i style="background:var(--s1)"></i>売上</span><span><i style="background:var(--s2)"></i>経費</span>`;
  monthlyColumns($('#ch-month'), { revenue: d.revenue.months, expense: d.expense.monthTotal, labels: MONTHS });
  expenseDonut($('#ch-donut'), d.expense.rows, d.expense.total);

  const t = d.tax;
  $('#biz-tax').innerHTML = `
    <h2>${icon('scale')}税金の目安</h2>
    <p class="hint">給与を含めた全体で計算した見込み。内訳は Tax タブ。</p>
    <div id="biz-cards2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.55rem">
      ${card('課税所得', yen(t.taxableIncome), { ic: 'landmark' })}
      ${card('納める税金', yen(t.totalTax), { ic: 'banknote', sub: '所得税＋住民税' })}
      ${card('限界税率', (t.marginalRate * 100).toFixed(1) + '%', { ic: 'trending-up', sub: 'あと1円の経費で減る率' })}
    </div>`;
}

/* ---------- tax ---------- */

const frow = (ic, label, value, { op, cls, sub } = {}) =>
  `<div class="frow${cls ? ' ' + cls : ''}">
     <span class="op">${op ?? (ic ? icon(ic) : '')}</span>
     <span class="fl">${label}${sub ? `<small>${sub}</small>` : ''}</span>
     <span class="fv${typeof value === 'number' && value < 0 ? ' neg' : ''}">${typeof value === 'number' ? yen(value) : value}</span>
   </div>`;

async function renderTax() {
  const d = await api(`/api/dashboard?year=${year}`);
  const t = d.tax;
  const refund = t.balance < 0;

  $('#tax-year').innerHTML = await yearBar();
  bindYear($('#tax-year'), renderTax);

  $('#tax-hero').innerHTML = [
    card('課税所得', yen(t.taxableIncome), { ic: 'landmark' }),
    card('納める税金', yen(t.totalTax), { ic: 'banknote', sub: '所得税＋住民税', hl: true }),
    card(refund ? '還付の見込み' : '納付の見込み', yen(Math.abs(t.balance)), { ic: 'wallet', sub: '源泉徴収済みとの差引' }),
  ].join('');

  $('#tax-flow').innerHTML = `
    <div class="flow">
      ${frow('trending-up', '事業所得', d.businessIncome, { sub: `売上 ${yen(d.revenue.total)} − 経費 ${yen(d.expense.total)} − 青色控除 ${yen(d.aoiro)}` })}
      ${frow('banknote', '給与所得', t.salaryIncome, { op: '＋', sub: `給与収入 ${yen(d.salary.total)} − 給与所得控除` })}
      ${frow(null, '合計所得', t.totalIncome, { op: '＝', cls: 'total' })}
      ${frow(null, '所得控除', -(d.settings.deductions ?? 0), { op: '−', sub: '社会保険料・iDeCo 等' })}
      ${frow(null, '基礎控除', -d.basicDeduction, { op: '−' })}
      ${frow(null, '課税所得', t.taxableIncome, { op: '＝', cls: 'total' })}
      ${frow('receipt-text', '所得税', t.incomeTax, { sub: '復興特別所得税を含む' })}
      ${frow('landmark', '住民税', t.residentTax, { op: '＋', sub: '概算（税率10%＋均等割）' })}
      ${frow(null, '納める税金', t.totalTax, { op: '＝', cls: 'grand' })}
      ${frow(null, '源泉徴収済み', -(d.settings.withheld ?? 0), { op: '−' })}
      ${frow(null, refund ? '還付される見込み' : '納付する見込み', Math.abs(t.balance), { op: '＝', cls: 'total' })}
    </div>`;

  renderAccrual(d);
  renderAssets(d);
  renderVat(d);

  $('#matrix').innerHTML = `
    <thead><tr><th>科目</th>${MONTHS.map((m) => `<th class="num">${m}</th>`).join('')}<th class="num">合計</th></tr></thead>
    <tbody>${d.expense.rows.map((r) => `<tr><td>${r.name}</td>${r.months.map((v) => `<td class="num">${v ? v.toLocaleString('ja-JP') : ''}</td>`).join('')}<td class="num">${r.total.toLocaleString('ja-JP')}</td></tr>`).join('')}</tbody>
    <tfoot>
      <tr><td>経費計</td>${d.expense.monthTotal.map((v) => `<td class="num">${v ? v.toLocaleString('ja-JP') : ''}</td>`).join('')}<td class="num">${d.expense.total.toLocaleString('ja-JP')}</td></tr>
      <tr><td>売上</td>${d.revenue.months.map((v) => `<td class="num">${v ? v.toLocaleString('ja-JP') : ''}</td>`).join('')}<td class="num">${d.revenue.total.toLocaleString('ja-JP')}</td></tr>
      <tr><td>給与</td>${d.salary.months.map((v) => `<td class="num">${v ? v.toLocaleString('ja-JP') : ''}</td>`).join('')}<td class="num">${d.salary.total.toLocaleString('ja-JP')}</td></tr>
    </tfoot>`;

  $('#tenki').innerHTML = `
    <thead><tr><th>決算書の行</th><th class="num">金額</th></tr></thead>
    <tbody>
      ${d.expense.rows.map((r) => `<tr><td>${r.name}</td><td class="num">${r.total.toLocaleString('ja-JP')}</td></tr>`).join('')}
      <tr><td>売上（収入）金額</td><td class="num">${d.revenue.total.toLocaleString('ja-JP')}</td></tr>
      <tr><td>差引金額</td><td class="num">${d.profit.toLocaleString('ja-JP')}</td></tr>
      <tr><td>青色申告特別控除額</td><td class="num">${d.aoiro.toLocaleString('ja-JP')}</td></tr>
      <tr class="emph"><td>所得金額</td><td class="num">${d.businessIncome.toLocaleString('ja-JP')}</td></tr>
    </tbody>`;
}

function renderAccrual(d) {
  const a = d.accrual;
  const rows = a.list.map((e) => `
    <div class="item"><span class="d">${e.date.slice(5).replace('-', '/')}</span>
      <span class="n">${byCode.get(e.account)?.name ?? e.account}${e.payee ? ` · ${e.payee}` : ''}</span>
      <span class="tag">${e.accrual === 'receivable' ? '未収' : '未払'}</span>
      <span class="a">${yen(e.amount)}</span></div>`).join('');

  $('#accrual').innerHTML = `
    <div class="flow">
      ${frow('coins', '売掛金（12月納品・翌年入金）', a.receivable, { sub: '来期に入金される当年の売上' })}
      ${frow('wallet', '未払金（12月利用・翌年引落）', a.payable, { op: '＋', sub: '来期に払う当年の経費' })}
    </div>
    ${rows ? `<div class="stack" style="margin-top:.5rem">${rows}</div>` : '<p class="empty">またぎの計上はまだありません</p>'}
    <div class="addbox">
      <div class="egrid">
        <label>区分<select id="ac-kind">
          <option value="receivable">未収（売上）</option>
          <option value="payable">未払（経費）</option>
        </select></label>
        <label>金額<input id="ac-amount" type="number" inputmode="numeric"></label>
        <label>勘定科目<select id="ac-account">${[...byCode.values()].map((x) => `<option value="${x.code}">${x.name}</option>`).join('')}</select></label>
        <label class="wide">相手・摘要<input id="ac-note" type="text"></label>
      </div>
      <button class="secondary" id="ac-add">${icon('plus')}12月31日付で計上する</button>
    </div>`;

  $('#ac-add').onclick = async () => {
    const amount = Number($('#ac-amount').value);
    if (!(amount > 0)) return;
    const accrual = $('#ac-kind').value;
    await api('/api/entries', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: accrual === 'receivable' ? 'revenue' : 'expense',
        amount, account: $('#ac-account').value,
        date: `${d.year}-12-31`, note: $('#ac-note').value, accrual,
      }),
    });
    renderTax();
  };
}

function renderAssets(d) {
  $('#assets').innerHTML = d.assets.length
    ? `<div class="scroll"><table>
        <thead><tr><th>取得日</th><th>内容</th><th>処理</th><th class="num">取得価額</th><th class="num">当年の費用</th></tr></thead>
        <tbody>${d.assets.map((a) => `<tr>
          <td>${a.date}</td>
          <td>${byCode.get(a.account)?.name ?? a.account}${a.payee ? ` · ${a.payee}` : ''}</td>
          <td>${a.kind === 'lump' ? `一括償却 ${a.nth}/3年目` : '少額特例（全額）'}</td>
          <td class="num">${a.original.toLocaleString('ja-JP')}</td>
          <td class="num">${a.thisYear.toLocaleString('ja-JP')}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">少額特例を使った資産は決算書に明細書の添付が要る。</p>`
    : '<p class="empty">10万円以上の資産はありません</p>';
}

function renderVat(d) {
  const v = d.vat;
  $('#vat').innerHTML = `
    <div class="flow">
      ${frow('coins', '課税売上（税込）', v.salesTotal)}
      ${frow(null, '売上にかかる消費税', v.salesVat, { sub: '税込から割り戻した内税' })}
      ${frow(null, '仕入・経費にかかる消費税', v.purchaseVat, { sub: '按分後の金額から算出' })}
      ${frow(null, '免税事業者', v.exempt, { op: 'A', cls: 'total', sub: '納付なし' })}
      ${frow(null, '2割特例', v.reduced, { op: 'B', cls: 'total', sub: '売上税額の20%' })}
      ${frow(null, '本則課税', v.standard, { op: 'C', cls: 'total', sub: '売上税額 − 仕入税額' })}
    </div>`;
}

/* ---------- settings ---------- */

async function renderSettings() {
  const s = await api('/api/settings');
  const list = s.salary ?? [];

  $('#salary').innerHTML = list.length
    ? list.map((x, i) => `
        <div class="srow">
          <span class="sfrom">${x.from.replace('-', '/')} 〜</span>
          <span class="smeta">${x.payday ? `毎月${x.payday}日 振込` : '振込日 未設定'}</span>
          <span class="samt">${yen(x.monthly)}</span>
          <button class="danger" data-i="${i}" title="削除">${icon('trash-2')}</button>
        </div>`).join('')
    : '<p class="empty">給与が未登録です。下から追加してください。</p>';

  const save = (next) => api('/api/settings', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next),
  }).then(renderSettings);

  $('#salary').querySelectorAll('button.danger').forEach((b) => {
    b.onclick = () => {
      const x = list[Number(b.dataset.i)];
      if (!confirm(`${x.from.replace('-', '/')} 〜 月額 ${yen(x.monthly)} を削除しますか。`)) return;
      save({ ...s, salary: list.filter((_, i) => i !== Number(b.dataset.i)) });
    };
  });

  $('#deductions').value = s.deductions ?? 0;
  $('#withheld').value = s.withheld ?? 0;
  $('#confirmed').value = s.confirmedSalaryGross ?? '';

  $('#s-add').onclick = () => {
    if (!$('#s-from').value || !$('#s-monthly').value) {
      $('#set-msg').textContent = '適用開始と月額を入れてください';
      return;
    }
    const next = [...list, {
      from: $('#s-from').value,
      monthly: Number($('#s-monthly').value),
      payday: Number($('#s-payday').value) || null,
    }].sort((a, b) => a.from.localeCompare(b.from));
    for (const id of ['#s-from', '#s-monthly', '#s-payday']) $(id).value = '';
    save({ ...s, salary: next });
  };

  $('#save-set').onclick = async () => {
    await save({
      ...s,
      deductions: Number($('#deductions').value) || 0,
      withheld: Number($('#withheld').value) || 0,
      confirmedSalaryGross: Number($('#confirmed').value) || null,
    });
    $('#set-msg').textContent = '保存しました';
    setTimeout(() => ($('#set-msg').textContent = ''), 2000);
  };
}

/* ---------- boot ---------- */

accounts = await api('/api/accounts');
for (const l of [accounts.expense, accounts.hidden, accounts.revenue]) for (const a of l) byCode.set(a.code, a);
paintIcons();
$('#date').value = new Date().toISOString().slice(0, 10);
renderAccounts();
renderRecent();
