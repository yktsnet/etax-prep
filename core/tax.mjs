export function salaryDeduction(gross, cfg) {
  const d = cfg.salary_deduction;
  for (const b of d.brackets) {
    if (b.upto === null || gross <= b.upto) {
      const v = b.flat !== undefined
        ? b.flat
        : b.sub !== undefined ? gross * b.rate - b.sub : gross * b.rate + b.add;
      return Math.max(d.min, Math.floor(v));
    }
  }
  return d.min;
}

export function salaryIncome(gross, cfg) {
  return Math.max(0, gross - salaryDeduction(gross, cfg));
}

function applyBrackets(taxable, brackets) {
  for (const b of brackets) {
    if (b.upto === null || taxable <= b.upto) {
      return { tax: Math.max(0, Math.floor(taxable * b.rate - b.deduct)), rate: b.rate };
    }
  }
  return { tax: 0, rate: 0 };
}

// 事業所得（青色控除後）と給与収入から、合算後の課税所得・税額・限界税率を出す。
// deductions は社会保険料控除・iDeCo 等の所得控除の合計（基礎控除は含めない）。
export function estimate({ businessIncome, salaryGross, deductions = 0, withheld = 0 }, cfg) {
  const salary = salaryIncome(salaryGross, cfg);
  const total = businessIncome + salary;

  const taxableIncome = Math.max(0, Math.floor((total - deductions - cfg.basic_deduction.income) / 1000) * 1000);
  const { tax: base, rate } = applyBrackets(taxableIncome, cfg.income_tax_brackets);
  const incomeTax = Math.floor(base * (1 + cfg.reconstruction_rate));

  const taxableResident = Math.max(0, total - deductions - cfg.basic_deduction.resident);
  const residentTax = Math.floor(taxableResident * cfg.resident_tax.rate) + cfg.resident_tax.per_capita;

  // 経費を1円積んだときに減る税額。事業所得が0未満（損益通算後）でも給与側に効く。
  const marginal = rate + cfg.resident_tax.rate + rate * cfg.reconstruction_rate;

  return {
    salaryIncome: salary,
    businessIncome,
    totalIncome: total,
    taxableIncome,
    incomeTax,
    residentTax,
    totalTax: incomeTax + residentTax,
    balance: incomeTax - withheld,
    marginalRate: marginal,
  };
}
