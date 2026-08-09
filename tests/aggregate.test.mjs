import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applied, toJournal, effectiveEntries, assetLedger,
  consumptionTax, accruals, monthlyMatrix, revenueByMonth, salaryForYear,
} from '../core/aggregate.mjs';

const accounts = {
  expense: [
    { code: 'tsushin', name: '通信費', icon: 'smartphone', vat: '10', ratio: 0.3 },
    { code: 'shomohin', name: '消耗品費', icon: 'shopping-cart', vat: '10', ratio: 1 },
  ],
  hidden: [],
  revenue: [{ code: 'uriage', name: '売上高', icon: 'banknote', vat: '10', ratio: 1 }],
};

const e = (o) => ({ kind: 'expense', ratio: 1, vat: '10', void: false, ...o });

test('按分率を掛けた額が計上される', () => {
  assert.equal(applied(e({ id: 'a', date: '2026-04-01', account: 'tsushin', amount: 11000, ratio: 0.3 })), 3300);
});

test('取消された取引は0として扱う', () => {
  assert.equal(applied(e({ id: 'a', date: '2026-04-01', account: 'tsushin', amount: 11000, void: true })), 0);
});

test('費用の貸方は事業主借に固定される', () => {
  const j = toJournal(e({ id: 'a', date: '2026-04-01', account: 'tsushin', amount: 10000, ratio: 0.3 }), accounts);
  assert.deepEqual(j, { date: '2026-04-01', debit: '通信費', credit: '事業主借', amount: 3000 });
});

test('売上の貸方は売上高、借方は事業主貸になる', () => {
  const j = toJournal(e({ kind: 'revenue', id: 'b', date: '2026-06-30', account: 'uriage', amount: 50000 }), accounts);
  assert.deepEqual(j, { date: '2026-06-30', debit: '事業主貸', credit: '売上高', amount: 50000 });
});

test('一括償却は取得年から3年均等で費用化し、4年目には残らない', () => {
  const entries = [e({ id: 'x', date: '2026-03-10', account: 'shomohin', amount: 150000, assetKind: 'lump' })];
  const at = (y) => effectiveEntries(entries, y).reduce((a, x) => a + x.amount, 0);
  assert.equal(at(2026), 50000);
  assert.equal(at(2027), 50000);
  assert.equal(at(2028), 50000);
  assert.equal(at(2029), 0);
});

test('一括償却の2年目以降は当年の日付へ振り替わる', () => {
  const entries = [e({ id: 'x', date: '2026-03-10', account: 'shomohin', amount: 150000, assetKind: 'lump' })];
  assert.equal(effectiveEntries(entries, 2027)[0].date, '2027-03-10');
});

test('少額特例は取得年に全額、翌年には残らない', () => {
  const entries = [e({ id: 'y', date: '2026-06-01', account: 'shomohin', amount: 220000, assetKind: 'small' })];
  assert.equal(effectiveEntries(entries, 2026)[0].amount, 220000);
  assert.equal(effectiveEntries(entries, 2027).length, 0);
});

test('取消された資産は台帳に載らない', () => {
  const entries = [e({ id: 'z', date: '2026-03-10', account: 'shomohin', amount: 150000, assetKind: 'lump', void: true })];
  assert.equal(assetLedger(entries, 2026).length, 0);
});

test('消費税は税込から割り戻し、免税・2割特例・本則の3通りを出す', () => {
  const entries = [
    e({ kind: 'revenue', id: 'r', date: '2026-06-30', account: 'uriage', amount: 110000 }),
    e({ id: 'p', date: '2026-04-01', account: 'shomohin', amount: 11000 }),
  ];
  const v = consumptionTax(entries, 2026);
  assert.equal(v.salesVat, 10000);
  assert.equal(v.purchaseVat, 1000);
  assert.equal(v.exempt, 0);
  assert.equal(v.reduced, 2000);
  assert.equal(v.standard, 9000);
});

test('対象外の税率区分は消費税に含めない', () => {
  const entries = [e({ kind: 'revenue', id: 'r', date: '2026-06-30', account: 'uriage', amount: 110000, vat: 'gai' })];
  assert.equal(consumptionTax(entries, 2026).salesVat, 0);
});

test('仕入税額は按分後の金額から求める', () => {
  const entries = [e({ id: 'p', date: '2026-04-01', account: 'tsushin', amount: 11000, ratio: 0.3 })];
  assert.equal(consumptionTax(entries, 2026).purchaseVat, 300);
});

test('またぎの未収・未払を区分ごとに集計する', () => {
  const entries = [
    e({ kind: 'revenue', id: 'a', date: '2026-12-31', account: 'uriage', amount: 90000, accrual: 'receivable' }),
    e({ id: 'b', date: '2026-12-31', account: 'shomohin', amount: 20000, accrual: 'payable' }),
    e({ id: 'c', date: '2026-05-01', account: 'shomohin', amount: 5000 }),
  ];
  const a = accruals(entries, 2026);
  assert.equal(a.receivable, 90000);
  assert.equal(a.payable, 20000);
  assert.equal(a.list.length, 2);
});

test('科目×月は按分後の額で、指定年だけを集計する', () => {
  const entries = [
    e({ id: 'a', date: '2026-04-25', account: 'tsushin', amount: 11000, ratio: 0.3 }),
    e({ id: 'b', date: '2025-04-25', account: 'tsushin', amount: 11000, ratio: 0.3 }),
  ];
  const m = monthlyMatrix(entries, accounts, 2026);
  assert.equal(m.total, 3300);
  assert.equal(m.monthTotal[3], 3300);
  assert.equal(m.rows[0].name, '通信費');
});

test('売上は月別に積み上がる', () => {
  const entries = [
    e({ kind: 'revenue', id: 'a', date: '2026-02-28', account: 'uriage', amount: 120000 }),
    e({ kind: 'revenue', id: 'b', date: '2026-04-30', account: 'uriage', amount: 80000 }),
  ];
  const r = revenueByMonth(entries, 2026);
  assert.equal(r.total, 200000);
  assert.equal(r.months[1], 120000);
});

test('給与は適用開始年月の履歴からその月に有効な額を引く', () => {
  const s = salaryForYear([
    { from: '2026-01', monthly: 500000, payday: 25 },
    { from: '2026-07', monthly: 540000, payday: 25 },
  ], 2026);
  assert.equal(s.months[0], 500000);
  assert.equal(s.months[6], 540000);
  assert.equal(s.total, 500000 * 6 + 540000 * 6);
  assert.equal(s.payday, 25);
});

test('適用開始前の月は給与が立たない', () => {
  const s = salaryForYear([{ from: '2026-04', monthly: 500000 }], 2026);
  assert.equal(s.months[0], 0);
  assert.equal(s.months[3], 500000);
});
