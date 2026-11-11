# tax

## Salary income deduction and salary income

| Guarantee | Test |
|---|---|
| `salaryDeduction` never falls below the floor amount for low income | `給与所得控除には下限がある` |
| `salaryDeduction` follows the formula for each income bracket | `給与所得控除は収入帯ごとの式で決まる` |
| `salaryDeduction` never exceeds the cap in the high-income bracket | `給与所得控除には上限がある` |
| `salaryDeduction` returns a flat amount across the bracket where the floor applies | `給与収入190万円までの給与所得控除は定額` |
| `salaryIncome` returns salary revenue minus the salary income deduction | `給与所得は収入から控除を引いた額` |

## Basic deduction

| Guarantee | Test |
|---|---|
| `basicDeduction` returns the basic deduction for the band the total income falls in | `基礎控除は合計所得金額の帯で変わる` |
| `basicDeduction` tapers the amount in the high-income bands | `基礎控除は高所得帯で逓減し0になる` |
| `basicDeduction` returns 0 in the top band | `基礎控除は高所得帯で逓減し0になる` |
| `estimate` uses a different basic deduction for resident tax than for income tax | `住民税の基礎控除は所得税と別の額を使う` |

## Taxable income

| Guarantee | Test |
|---|---|
| `estimate` subtracts itemised and basic deductions from total income to produce taxable income | `事業所得と給与所得を合算して課税所得を出す` |
| `estimate` adds a positive business income to salary income to form total income | `黒字の事業所得は給与所得に足して合計所得金額になる` |
| The taxable income `estimate` returns is truncated to the nearest ¥1,000 | `課税所得は1000円未満を切り捨てる` |
| `estimate` offsets a business loss against salary income (taxable income and tax come out lower than with a business income of 0) | `事業が赤字なら給与所得と損益通算される` |
| `estimate` never returns negative taxable income, even when income falls short of the deductions | `所得が控除に満たなくても課税所得と税額は負にならない` |

## Tax amounts

| Guarantee | Test |
|---|---|
| The income tax `estimate` returns includes the special reconstruction surtax | `所得税に復興特別所得税が上乗せされる` |
| The resident tax `estimate` returns adds a flat per-capita levy and forest environment tax on top of the income-based portion | `住民税には均等割と森林環境税が定額で乗る` |
| The marginal rate `estimate` returns is the sum of the income tax rate, the resident tax rate, and the reconstruction surtax | `限界税率は所得税・住民税・復興特別所得税の合計` |
| `estimate` returns a negative balance (a refund) when tax withheld exceeds the tax computed | `源泉徴収済みが税額を上回れば還付になる` |
| `estimate` never returns negative income tax, even when income falls short of the deductions | `所得が控除に満たなくても課税所得と税額は負にならない` |
