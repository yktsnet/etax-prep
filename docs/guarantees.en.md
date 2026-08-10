[🇯🇵 日本語](guarantees.md) | [🇬🇧 English](guarantees.en.md)

# Guarantee Ledger

## Guarantees

### 1. `tests/aggregate.test.mjs` — core/aggregate.mjs (applied / toJournal / effectiveEntries / assetLedger / consumptionTax / accruals / monthlyMatrix / revenueByMonth / salaryForYear)

- `applied` returns the face amount multiplied by the household apportionment ratio
- `applied` treats a voided transaction as 0
- `toJournal` places the account on the debit side and owner's capital on the credit side for expenses
- `toJournal` places the account on the credit side and owner's drawings on the debit side for revenue
- The amount `toJournal` produces is the post-apportionment amount
- `effectiveEntries` spreads a lump-sum depreciation asset over three years from acquisition, one third of the acquisition cost per year
- `effectiveEntries` books nothing for a lump-sum asset in its fourth year
- `effectiveEntries` shifts the booking date of a lump-sum asset to the same month and day of the current year from the second year onward
- `effectiveEntries` books a small-amount-exemption asset in full in its acquisition year and nothing thereafter
- `assetLedger` excludes voided assets from the ledger
- `consumptionTax` extracts the embedded tax from tax-inclusive amounts and returns the payable under all three methods (exempt, 20% special provision, standard)
- `consumptionTax` excludes out-of-scope tax categories from output tax
- `consumptionTax` computes input tax from post-apportionment amounts
- `consumptionTax` also extracts the reduced 8% rate from tax-inclusive amounts
- `consumptionTax` excludes voided transactions
- `accruals` totals receivables and payables separately and returns the matching transactions
- `accruals` excludes ordinary transactions that carry no accrual category
- `monthlyMatrix` aggregates only the given year's expenses, at post-apportionment amounts, by account and month
- `revenueByMonth` aggregates the given year's revenue by month
- `salaryForYear` resolves the monthly amount in effect for each month from the effective-date history
- `salaryForYear` books no salary for months before the first effective date

| Guarantee (summary) | Test |
|---|---|
| Apportionment applied | `按分率を掛けた額が計上される` |
| Voided counts as 0 | `取消された取引は0として扱う` |
| Expense credit fixed to owner's capital | `費用の貸方は事業主借に固定される` |
| Revenue journal | `売上の貸方は売上高、借方は事業主貸になる` |
| Three-year spread, gone in year four | `一括償却は取得年から3年均等で費用化し、4年目には残らない` |
| Date shift for later years | `一括償却の2年目以降は当年の日付へ振り替わる` |
| Small-amount exemption booked in full | `少額特例は取得年に全額、翌年には残らない` |
| Voided assets excluded | `取消された資産は台帳に載らない` |
| Three consumption tax methods | `消費税は税込から割り戻し、免税・2割特例・本則の3通りを出す` |
| Out-of-scope categories excluded | `対象外の税率区分は消費税に含めない` |
| Input tax post-apportionment | `仕入税額は按分後の金額から求める` |
| Reduced 8% rate | `軽減税率8%も税込から割り戻す` |
| Voided excluded from consumption tax | `取消された取引は消費税の集計に入らない` |
| Accruals split by category | `またぎの未収・未払を区分ごとに集計する` |
| Account-by-month aggregation | `科目×月は按分後の額で、指定年だけを集計する` |
| Revenue by month | `売上は月別に積み上がる` |
| Salary history lookup | `給与は適用開始年月の履歴からその月に有効な額を引く` |
| Nothing before the effective date | `適用開始前の月は給与が立たない` |

### 2. `tests/tax.test.mjs` — core/tax.mjs (salaryDeduction / salaryIncome / estimate)

- `salaryDeduction` never falls below the floor amount for low income
- `salaryDeduction` follows the formula for each income bracket
- `salaryDeduction` never exceeds the cap in the high-income bracket
- `salaryDeduction` returns a flat amount across the bracket where the floor applies
- `salaryIncome` returns salary revenue minus the salary income deduction
- `basicDeduction` returns the basic deduction for the band the total income falls in
- `basicDeduction` tapers the amount in the high-income bands, reaching zero in the top one
- `estimate` uses a different basic deduction for resident tax than for income tax
- The resident tax `estimate` returns adds a flat per-capita levy and forest environment tax on top of the income-based portion
- `estimate` merges business and salary income, then subtracts itemised and basic deductions to produce taxable income
- The taxable income `estimate` returns is truncated to the nearest ¥1,000
- The income tax `estimate` returns includes the special reconstruction surtax
- `estimate` offsets a business loss against salary income, reducing taxable income and tax
- The marginal rate `estimate` returns is the sum of the income tax rate, the resident tax rate, and the reconstruction surtax
- `estimate` returns a negative balance (a refund) when tax withheld exceeds the tax computed
- `estimate` never returns negative taxable income or income tax, even when income falls short of the deductions

| Guarantee (summary) | Test |
|---|---|
| Salary deduction floor | `給与所得控除には下限がある` |
| Per-bracket formula | `給与所得控除は収入帯ごとの式で決まる` |
| Salary deduction cap | `給与所得控除には上限がある` |
| Flat band at the floor | `給与収入190万円までの給与所得控除は定額` |
| Salary income | `給与所得は収入から控除を引いた額` |
| Basic deduction bands | `基礎控除は合計所得金額の帯で変わる` |
| Basic deduction taper | `基礎控除は高所得帯で逓減し0になる` |
| Resident basic deduction | `住民税の基礎控除は所得税と別の額を使う` |
| Business and salary merged | `事業所得と給与所得を合算して課税所得を出す` |
| Truncation to ¥1,000 | `課税所得は1000円未満を切り捨てる` |
| Reconstruction surtax added | `所得税に復興特別所得税が上乗せされる` |
| Loss offset | `事業が赤字なら給与所得と損益通算される` |
| Resident tax flat portion | `住民税には均等割と森林環境税が定額で乗る` |
| Marginal rate composition | `限界税率は所得税・住民税・復興特別所得税の合計` |
| Refund sign | `源泉徴収済みが税額を上回れば還付になる` |
| Never negative | `所得が控除に満たなくても課税所得と税額は負にならない` |

### 3. `tests/api.test.mjs` — core/api.mjs (createApi)

- Posting an entry with an unknown account returns 400
- Posting an entry with a missing, zero, or negative amount returns 400
- Patching a non-existent transaction returns 404
- Requesting a non-existent receipt returns 404
- An unknown route returns 404
- On creation, the default apportionment ratio and tax category are filled in from the chart of accounts
- Explicitly supplied apportionment ratio and tax category take precedence over the defaults
- An entry posted without a date is recorded with today's date
- A voided transaction drops out of aggregation but remains in storage
- Detaching a receipt only removes the link from the transaction; the detachment is recorded and the file itself remains retrievable
- The dashboard can aggregate by a specified year

| Guarantee (summary) | Test |
|---|---|
| Invalid account | `存在しない勘定科目での登録は400を返す` |
| Invalid amount | `金額が無い、または0以下の登録は400を返す` |
| Patching a missing transaction | `存在しない取引の更新は404を返す` |
| Missing receipt | `存在しない証憑の取得は404を返す` |
| Unknown route | `未知の経路は404を返す` |
| Defaults filled in | `登録時に勘定科目マスタの既定按分率と税率区分が補完される` |
| Explicit values win | `明示した按分率と税率区分は既定より優先される` |
| Default date | `日付を省略すると当日で登録される` |
| Voiding preserves the record | `取消しても取引は残り、集計からだけ外れる` |
| Detaching preserves the file | `証憑を取り外しても紐付けが外れるだけで、ファイルは残る` |
| Aggregation by year | `ダッシュボードは年を指定して集計できる` |

## Gaps

The following are contract-level but have no backing test. The reason each was deferred is given.

- That the two storage backends (`LocalStore` and `GitHubStore`) satisfy the same interface contract is unguaranteed. In particular, an update that moves a transaction across month boundaries is a branch each implementation carries separately, so one can break alone. Deferred because it needs a fake for the GitHub API, which goes beyond the scope of this audit.
- The asset thresholds (¥100k and ¥300k) are unguaranteed. The decision lives in the UI (`public/app.js`) and cannot be tested without extracting it into `core/`. Deferred because it would require moving implementation.

## About

The scope is the pure functions in `core/` (aggregation and tax calculation) and the response contract of the HTTP API. The UI (`public/`) — its appearance and interactions — is out of scope and is verified by hand. **Behaviour not listed here is not a promise and may change without notice.** This document ranks alongside the design decision record.
