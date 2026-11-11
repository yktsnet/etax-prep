# aggregate

## Apportionment and journal entries

| Guarantee | Test |
|---|---|
| `applied` returns the face amount multiplied by the household apportionment ratio | `按分率を掛けた額が計上される` |
| `applied` treats a voided transaction as 0 | `取消された取引は0として扱う` |
| `toJournal` places the account on the debit side and owner's capital on the credit side for expenses | `費用の貸方は事業主借に固定される` |
| `toJournal` places the account on the credit side and owner's drawings on the debit side for revenue | `売上の貸方は売上高、借方は事業主貸になる` |
| The amount `toJournal` produces is the post-apportionment amount | `費用の貸方は事業主借に固定される` |

## Expensing assets

| Guarantee | Test |
|---|---|
| `effectiveEntries` spreads a lump-sum depreciation asset over three years from acquisition, one third of the acquisition cost per year | `一括償却は取得年から3年均等で費用化し、4年目には残らない` |
| `effectiveEntries` books nothing for a lump-sum asset in its fourth year | `一括償却は取得年から3年均等で費用化し、4年目には残らない` |
| `effectiveEntries` shifts the booking date of a lump-sum asset to the same month and day of the current year from the second year onward | `一括償却の2年目以降は当年の日付へ振り替わる` |
| `effectiveEntries` books a small-amount-exemption asset in full in its acquisition year | `少額特例は取得年に全額、翌年には残らない` |
| `effectiveEntries` books nothing for a small-amount-exemption asset after its acquisition year | `少額特例は取得年に全額、翌年には残らない` |
| `assetLedger` excludes voided assets from the ledger | `取消された資産は台帳に載らない` |

## Consumption tax

| Guarantee | Test |
|---|---|
| `consumptionTax` extracts the embedded tax from tax-inclusive amounts to produce output and input tax | `消費税は税込から割り戻し、免税・2割特例・本則の3通りを出す` |
| `consumptionTax` returns the payable under all three methods (exempt, 20% special provision, standard) | `消費税は税込から割り戻し、免税・2割特例・本則の3通りを出す` |
| `consumptionTax` excludes out-of-scope tax categories from output tax | `対象外の税率区分は消費税に含めない` |
| `consumptionTax` computes input tax from post-apportionment amounts | `仕入税額は按分後の金額から求める` |
| `consumptionTax` also extracts the reduced 8% rate from tax-inclusive amounts | `軽減税率8%も税込から割り戻す` |
| `consumptionTax` excludes voided transactions | `取消された取引は消費税の集計に入らない` |

## Year-end accruals and monthly aggregation

| Guarantee | Test |
|---|---|
| `accruals` totals receivables and payables separately | `またぎの未収・未払を区分ごとに集計する` |
| `accruals` returns the matching transactions | `またぎの未収・未払を区分ごとに集計する` |
| `accruals` excludes ordinary transactions that carry no accrual category | `またぎの未収・未払を区分ごとに集計する` |
| `monthlyMatrix` aggregates transactions by account and month | `科目×月は按分後の額で、指定年だけを集計する` |
| The amounts `monthlyMatrix` aggregates are post-apportionment amounts | `科目×月は按分後の額で、指定年だけを集計する` |
| `monthlyMatrix` excludes transactions outside the given year | `科目×月は按分後の額で、指定年だけを集計する` |
| `monthlyMatrix` aggregates expenses only and excludes revenue | `科目×月は費用だけを集計し、売上を含めない` |
| `revenueByMonth` aggregates revenue by month | `売上は月別に積み上がる` |
| `revenueByMonth` excludes revenue from other years | `売上の月別は指定年以外の売上を含めない` |
| `salaryForYear` resolves the monthly amount in effect for each month from the effective-date history | `給与は適用開始年月の履歴からその月に有効な額を引く` |
| `salaryForYear` books no salary for months before the first effective date | `適用開始前の月は給与が立たない` |
