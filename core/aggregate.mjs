export function accountMap(accounts) {
  const m = new Map();
  for (const list of [accounts.expense, accounts.hidden, accounts.revenue]) {
    for (const a of list) m.set(a.code, a);
  }
  return m;
}

export function applied(entry) {
  return entry.void ? 0 : Math.round(entry.amount * (entry.ratio ?? 1));
}

// 貸方は事業主借に固定。売上は入金日基準のため借方も事業主貸に寄せる。
export function toJournal(entry, accounts) {
  const a = accountMap(accounts).get(entry.account);
  const amount = applied(entry);
  return entry.kind === 'revenue'
    ? { date: entry.date, debit: '事業主貸', credit: a.name, amount }
    : { date: entry.date, debit: a.name, credit: '事業主借', amount };
}

// 一括償却は取得年から3年均等で費用化する。取得年以外にも当年分が立つため、
// 集計の前に「その年に効く金額」へ展開する。少額特例は取得年に全額なので素通し。
export function effectiveEntries(entries, year) {
  const out = [];
  for (const e of entries) {
    if (e.void) continue;
    const acq = Number(e.date.slice(0, 4));

    if (e.assetKind === 'lump') {
      const nth = year - acq;
      if (nth < 0 || nth > 2) continue;
      out.push({
        ...e,
        date: nth === 0 ? e.date : `${year}${e.date.slice(4)}`,
        amount: Math.round(e.amount / 3),
        depreciation: { nth: nth + 1, of: 3, original: e.amount },
      });
      continue;
    }

    if (acq === year) out.push(e);
  }
  return out;
}

export function assetLedger(entries, year) {
  return entries
    .filter((e) => !e.void && e.assetKind && Number(e.date.slice(0, 4)) <= year
      && (e.assetKind === 'small' ? Number(e.date.slice(0, 4)) === year : year - Number(e.date.slice(0, 4)) <= 2))
    .map((e) => {
      const nth = year - Number(e.date.slice(0, 4)) + 1;
      return {
        id: e.id, date: e.date, account: e.account, payee: e.payee, kind: e.assetKind,
        original: e.amount,
        thisYear: e.assetKind === 'lump' ? Math.round(e.amount / 3) : e.amount,
        nth: e.assetKind === 'lump' ? nth : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 税込金額から内税を割り戻す。免税・2割特例・本則のどれを選んでも比較できるよう3通り出す。
export function consumptionTax(entries, year) {
  const rate = (v) => (v === '8' ? 8 : v === '10' ? 10 : 0);
  const vatOf = (e) => {
    const r = rate(e.vat);
    return r ? Math.round((e.amount * (e.ratio ?? 1)) * r / (100 + r)) : 0;
  };

  const eff = effectiveEntries(entries, year);
  const sales = eff.filter((e) => e.kind === 'revenue');
  const purchases = eff.filter((e) => e.kind !== 'revenue');

  const salesVat = sales.reduce((a, e) => a + vatOf(e), 0);
  const purchaseVat = purchases.reduce((a, e) => a + vatOf(e), 0);

  return {
    salesTotal: sales.reduce((a, e) => a + e.amount, 0),
    salesVat,
    purchaseVat,
    exempt: 0,
    reduced: Math.round(salesVat * 0.2),
    standard: Math.max(0, salesVat - purchaseVat),
  };
}

// 年をまたぐ未収・未払。期中は入金日基準で入れ、ここだけ発生主義へ寄せる。
export function accruals(entries, year) {
  const list = entries.filter((e) => !e.void && e.accrual && e.date.startsWith(String(year)));
  const sum = (k) => list.filter((e) => e.accrual === k).reduce((a, e) => a + e.amount, 0);
  return { list, receivable: sum('receivable'), payable: sum('payable') };
}

export function monthlyMatrix(entries, accounts, year) {
  const map = accountMap(accounts);
  const rows = new Map();
  const monthTotal = Array(12).fill(0);

  for (const e of effectiveEntries(entries, year)) {
    if (e.kind !== 'expense') continue;
    const m = Number(e.date.slice(5, 7)) - 1;
    if (!rows.has(e.account)) rows.set(e.account, Array(12).fill(0));
    const v = applied(e);
    rows.get(e.account)[m] += v;
    monthTotal[m] += v;
  }

  return {
    rows: [...rows].map(([code, months]) => ({
      code,
      name: map.get(code)?.name ?? code,
      icon: map.get(code)?.icon ?? "circle-help",
      months,
      total: months.reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total),
    monthTotal,
    total: monthTotal.reduce((a, b) => a + b, 0),
  };
}

export function revenueByMonth(entries, year) {
  const months = Array(12).fill(0);
  for (const e of effectiveEntries(entries, year)) {
    if (e.kind !== 'revenue') continue;
    months[Number(e.date.slice(5, 7)) - 1] += applied(e);
  }
  return { months, total: months.reduce((a, b) => a + b, 0) };
}

// 適用開始年月の履歴から、その年の給与収入と振込予定日を組み立てる。
export function salaryForYear(salaryHistory, year) {
  const sorted = [...salaryHistory].sort((a, b) => a.from.localeCompare(b.from));
  const months = Array(12).fill(0);
  let payday = null;

  for (let m = 0; m < 12; m++) {
    const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
    const active = sorted.filter((s) => s.from <= ym).pop();
    if (!active) continue;
    months[m] = active.monthly;
    payday = active.payday ?? payday;
  }

  const bonus = sorted
    .flatMap((s) => s.bonuses ?? [])
    .filter((b) => b.date.startsWith(String(year)));
  for (const b of bonus) months[Number(b.date.slice(5, 7)) - 1] += b.amount;

  return { months, total: months.reduce((a, b) => a + b, 0), payday };
}
