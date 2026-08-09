import { monthlyMatrix, revenueByMonth, salaryForYear, accountMap, assetLedger, consumptionTax, accruals } from './aggregate.mjs';
import { estimate } from './tax.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const IMAGE_MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

async function dashboard(store, accounts, taxCfg, year) {
  const [entries, settings] = await Promise.all([store.listEntries(), store.getSettings()]);

  const expense = monthlyMatrix(entries, accounts, year);
  const revenue = revenueByMonth(entries, year);
  const salary = salaryForYear(settings.salary ?? [], year);

  const profit = revenue.total - expense.total;
  const aoiro = profit > 0 ? Math.min(profit, taxCfg.aoiro_deduction) : 0;
  const businessIncome = profit - aoiro;

  const tax = estimate({
    businessIncome,
    salaryGross: settings.confirmedSalaryGross ?? salary.total,
    deductions: settings.deductions ?? 0,
    withheld: settings.withheld ?? 0,
  }, taxCfg);

  return {
    year, expense, revenue, salary, profit, aoiro, businessIncome, tax, settings,
    basicDeduction: taxCfg.basic_deduction.income,
    assets: assetLedger(entries, year),
    vat: consumptionTax(entries, year),
    accrual: accruals(entries, year),
  };
}

// ローカル開発（node:http）と Cloudflare Pages Functions が同じ実装を通るよう、
// Request → Response の Web 標準インターフェースで書く。差は store だけ。
export function createApi({ store, accounts, taxCfg }) {
  return async function handle(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    const method = request.method;

    try {
      if (p === '/api/accounts') return json(accounts);

      if (p === '/api/entries' && method === 'GET') return json(await store.listEntries());

      if (p === '/api/entries' && method === 'POST') {
        const body = await request.json();
        const acct = accountMap(accounts).get(body.account);
        if (!acct) return json({ error: 'unknown account' }, 400);
        if (!(body.amount > 0)) return json({ error: 'amount required' }, 400);

        return json(await store.addEntry({
          id: newId(),
          kind: body.kind ?? 'expense',
          date: body.date ?? new Date().toISOString().slice(0, 10),
          account: body.account,
          amount: Math.round(body.amount),
          ratio: body.ratio ?? acct.ratio ?? 1,
          vat: body.vat ?? acct.vat ?? '10',
          payee: body.payee ?? '',
          note: body.note ?? '',
          assetKind: body.assetKind ?? null,
          accrual: body.accrual ?? null,
          receipts: [],
          void: false,
          createdAt: new Date().toISOString(),
        }));
      }

      if (p.startsWith('/api/entries/') && method === 'PATCH') {
        const updated = await store.updateEntry(p.split('/')[3], await request.json());
        return updated ? json(updated) : json({ error: 'not found' }, 404);
      }

      if (p.startsWith('/api/receipts/')) {
        const rest = p.slice('/api/receipts/'.length).split('/').map(decodeURIComponent);

        if (method === 'POST') {
          const id = rest[0];
          const name = url.searchParams.get('name') ?? `${Date.now()}.png`;
          const cur = (await store.listEntries()).find((e) => e.id === id);
          if (!cur) return json({ error: 'not found' }, 404);
          const saved = await store.saveReceipt(id, name, new Uint8Array(await request.arrayBuffer()));
          return json(await store.updateEntry(id, { receipts: [...(cur.receipts ?? []), saved] }));
        }

        // 証憑そのものは消さず、取引からの紐付けだけを外す。訂正の履歴を残すため。
        if (method === 'DELETE') {
          const [id, ...file] = rest;
          const ref = `${id}/${file.join('/')}`;
          const cur = (await store.listEntries()).find((e) => e.id === id);
          if (!cur) return json({ error: 'not found' }, 404);
          return json(await store.updateEntry(id, {
            receipts: (cur.receipts ?? []).filter((r) => r !== ref),
            detachedReceipts: [...(cur.detachedReceipts ?? []), ref],
          }));
        }

        if (method === 'GET') {
          const rel = rest.join('/');
          const bytes = await store.readReceipt(rel);
          if (!bytes) return json({ error: 'not found' }, 404);
          return new Response(bytes, {
            headers: {
              'content-type': IMAGE_MIME[rel.split('.').pop().toLowerCase()] ?? 'application/octet-stream',
              'cache-control': 'private, max-age=31536000, immutable',
            },
          });
        }
      }

      if (p === '/api/settings' && method === 'GET') return json(await store.getSettings());
      if (p === '/api/settings' && method === 'PUT') return json(await store.saveSettings(await request.json()));

      if (p === '/api/years') return json(await store.listYears());

      if (p === '/api/dashboard') {
        const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
        return json(await dashboard(store, accounts, taxCfg, year));
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, 500);
    }
  };
}
