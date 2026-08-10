import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { salaryDeduction, salaryIncome, basicDeduction, estimate } from '../core/tax.mjs';

const cfg = JSON.parse(await readFile(new URL('../config/tax-2026.json', import.meta.url), 'utf8'));

test('給与所得控除には下限がある', () => {
  assert.equal(salaryDeduction(300000, cfg), cfg.salary_deduction.min);
});

test('給与所得控除は収入帯ごとの式で決まる', () => {
  assert.equal(salaryDeduction(6240000, cfg), 6240000 * 0.2 + 440000);
});

test('給与所得控除には上限がある', () => {
  assert.equal(salaryDeduction(12000000, cfg), 1950000);
});

test('給与所得は収入から控除を引いた額', () => {
  assert.equal(salaryIncome(6240000, cfg), 6240000 - salaryDeduction(6240000, cfg));
});

test('事業所得と給与所得を合算して課税所得を出す', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000, withheld: 450000 }, cfg);
  assert.equal(r.salaryIncome, 4552000);
  assert.equal(r.totalIncome, 4552000);
  assert.equal(r.taxableIncome, 4552000 - 1200000 - r.basicDeduction);
});

test('給与収入190万円までの給与所得控除は定額', () => {
  assert.equal(salaryDeduction(1900000, cfg), 650000);
  assert.equal(salaryDeduction(1000000, cfg), 650000);
});

test('基礎控除は合計所得金額の帯で変わる', () => {
  assert.equal(basicDeduction(1000000, cfg.basic_deduction.income), 950000);
  assert.equal(basicDeduction(3000000, cfg.basic_deduction.income), 580000);
  assert.equal(basicDeduction(4000000, cfg.basic_deduction.income), 680000);
  assert.equal(basicDeduction(5000000, cfg.basic_deduction.income), 630000);
  assert.equal(basicDeduction(10000000, cfg.basic_deduction.income), 580000);
});

test('基礎控除は高所得帯で逓減し0になる', () => {
  assert.equal(basicDeduction(23800000, cfg.basic_deduction.income), 480000);
  assert.equal(basicDeduction(24200000, cfg.basic_deduction.income), 320000);
  assert.equal(basicDeduction(30000000, cfg.basic_deduction.income), 0);
  assert.equal(basicDeduction(30000000, cfg.basic_deduction.resident), 0);
});

test('住民税の基礎控除は所得税と別の額を使う', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000 }, cfg);
  assert.equal(r.residentBasicDeduction, 430000);
  assert.notEqual(r.residentBasicDeduction, r.basicDeduction);
});

test('課税所得は1000円未満を切り捨てる', () => {
  const r = estimate({ businessIncome: 1234, salaryGross: 6240000, deductions: 1200000 }, cfg);
  assert.equal(r.taxableIncome % 1000, 0);
});

test('所得税に復興特別所得税が上乗せされる', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000 }, cfg);
  const base = Math.floor(r.taxableIncome * 0.1 - 97500);
  assert.equal(r.incomeTax, Math.floor(base * (1 + cfg.reconstruction_rate)));
});

test('事業が赤字なら給与所得と損益通算される', () => {
  const black = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000 }, cfg);
  const red = estimate({ businessIncome: -500000, salaryGross: 6240000, deductions: 1200000 }, cfg);
  assert.ok(red.taxableIncome < black.taxableIncome);
  assert.ok(red.totalTax < black.totalTax);
});

test('住民税には均等割と森林環境税が定額で乗る', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000 }, cfg);
  const shotoku = Math.floor((r.totalIncome - 1200000 - r.residentBasicDeduction) * cfg.resident_tax.rate);
  assert.equal(r.residentTax, shotoku + cfg.resident_tax.per_capita + cfg.resident_tax.forest_tax);
});

test('限界税率は所得税・住民税・復興特別所得税の合計', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000 }, cfg);
  assert.ok(Math.abs(r.marginalRate - (0.1 + 0.1 + 0.1 * cfg.reconstruction_rate)) < 1e-9);
});

test('源泉徴収済みが税額を上回れば還付になる', () => {
  const r = estimate({ businessIncome: 0, salaryGross: 6240000, deductions: 1200000, withheld: 450000 }, cfg);
  assert.ok(r.balance < 0);
});

test('所得が控除に満たなくても課税所得と税額は負にならない', () => {
  const r = estimate({ businessIncome: -9000000, salaryGross: 0, deductions: 0 }, cfg);
  assert.equal(r.taxableIncome, 0);
  assert.equal(r.incomeTax, 0);
  assert.ok(r.residentTax >= 0);
});
