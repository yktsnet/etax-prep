import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi } from '../core/api.mjs';

const accounts = JSON.parse(await readFile(new URL('../config/accounts.json', import.meta.url), 'utf8'));
const taxCfg = JSON.parse(await readFile(new URL('../config/tax-2026.json', import.meta.url), 'utf8'));

// 保存先は差し替え可能な前提で書かれている。テストは実ストアに触れず fake で受ける。
class FakeStore {
  constructor() {
    this.entries = [];
    this.receipts = new Map();
    this.settings = { salary: [], deductions: 0, withheld: 0 };
  }
  async listEntries() { return [...this.entries].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)); }
  async listYears() { return [...new Set(this.entries.map((e) => Number(e.date.slice(0, 4))))]; }
  async addEntry(e) { this.entries.push(e); return e; }
  async updateEntry(id, patch) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return null;
    this.entries[i] = { ...this.entries[i], ...patch, id };
    return this.entries[i];
  }
  async saveReceipt(id, name, bytes) { this.receipts.set(`${id}/${name}`, bytes); return `${id}/${name}`; }
  async readReceipt(rel) { return this.receipts.get(rel) ?? null; }
  async getSettings() { return this.settings; }
  async saveSettings(s) { this.settings = s; return s; }
}

const setup = () => {
  const store = new FakeStore();
  return { store, handle: createApi({ store, accounts, taxCfg }) };
};

const post = (handle, body) => handle(new Request('http://x/api/entries', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

test('存在しない勘定科目での登録は400を返す', async () => {
  const { handle } = setup();
  const res = await post(handle, { amount: 1000, account: 'nonexistent' });
  assert.equal(res.status, 400);
});

test('金額が無い、または0以下の登録は400を返す', async () => {
  const { handle } = setup();
  assert.equal((await post(handle, { account: 'tsushin' })).status, 400);
  assert.equal((await post(handle, { amount: 0, account: 'tsushin' })).status, 400);
  assert.equal((await post(handle, { amount: -100, account: 'tsushin' })).status, 400);
});

test('存在しない取引の更新は404を返す', async () => {
  const { handle } = setup();
  const res = await handle(new Request('http://x/api/entries/nope', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 1 }),
  }));
  assert.equal(res.status, 404);
});

test('存在しない証憑の取得は404を返す', async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request('http://x/api/receipts/nope/none.webp'))).status, 404);
});

test('登録時に勘定科目マスタの既定按分率と税率区分が補完される', async () => {
  const { handle } = setup();
  const e = await (await post(handle, { amount: 11000, account: 'tsushin' })).json();
  assert.equal(e.ratio, 0.3);
  assert.equal(e.vat, '10');
});

test('明示した按分率と税率区分は既定より優先される', async () => {
  const { handle } = setup();
  const e = await (await post(handle, { amount: 11000, account: 'tsushin', ratio: 1, vat: 'gai' })).json();
  assert.equal(e.ratio, 1);
  assert.equal(e.vat, 'gai');
});

test('日付を省略すると当日で登録される', async () => {
  const { handle } = setup();
  const e = await (await post(handle, { amount: 1000, account: 'tsushin' })).json();
  assert.equal(e.date, new Date().toISOString().slice(0, 10));
});

test('取消しても取引は残り、集計からだけ外れる', async () => {
  const { store, handle } = setup();
  const e = await (await post(handle, { amount: 50000, account: 'shomohin', date: '2026-05-01' })).json();

  const before = await (await handle(new Request(`http://x/api/dashboard?year=2026`))).json();
  assert.equal(before.expense.total, 50000);

  await handle(new Request(`http://x/api/entries/${e.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ void: true }),
  }));

  const after = await (await handle(new Request(`http://x/api/dashboard?year=2026`))).json();
  assert.equal(after.expense.total, 0);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].void, true);
});

test('証憑を取り外しても紐付けが外れるだけで、ファイルは残る', async () => {
  const { store, handle } = setup();
  const e = await (await post(handle, { amount: 1000, account: 'tsushin' })).json();

  await handle(new Request(`http://x/api/receipts/${e.id}?name=a.webp`, {
    method: 'POST', body: new Uint8Array([1, 2, 3]),
  }));
  assert.deepEqual(store.entries[0].receipts, [`${e.id}/a.webp`]);

  const detached = await (await handle(new Request(`http://x/api/receipts/${e.id}/a.webp`, { method: 'DELETE' }))).json();
  assert.deepEqual(detached.receipts, []);
  assert.deepEqual(detached.detachedReceipts, [`${e.id}/a.webp`]);
  assert.equal((await handle(new Request(`http://x/api/receipts/${e.id}/a.webp`))).status, 200);
});

test('ダッシュボードは年を指定して集計できる', async () => {
  const { handle } = setup();
  await post(handle, { amount: 10000, account: 'shomohin', date: '2026-05-01' });
  await post(handle, { amount: 20000, account: 'shomohin', date: '2027-05-01' });

  assert.equal((await (await handle(new Request('http://x/api/dashboard?year=2026'))).json()).expense.total, 10000);
  assert.equal((await (await handle(new Request('http://x/api/dashboard?year=2027'))).json()).expense.total, 20000);
});

test('未知の経路は404を返す', async () => {
  const { handle } = setup();
  assert.equal((await handle(new Request('http://x/api/unknown'))).status, 404);
});
