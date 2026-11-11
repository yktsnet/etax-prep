# api

## Posting entries

| Guarantee | Test |
|---|---|
| Posting an entry with an unknown account returns 400 | `存在しない勘定科目での登録は400を返す` |
| Posting an entry with a missing, zero, or negative amount returns 400 | `金額が無い、または0以下の登録は400を返す` |
| On creation, the default apportionment ratio and tax category are filled in from the chart of accounts | `登録時に勘定科目マスタの既定按分率と税率区分が補完される` |
| Explicitly supplied apportionment ratio and tax category take precedence over the defaults | `明示した按分率と税率区分は既定より優先される` |
| An entry posted without a date is recorded with today's date | `日付を省略すると当日で登録される` |

## Requests for things that do not exist

| Guarantee | Test |
|---|---|
| Patching a non-existent transaction returns 404 | `存在しない取引の更新は404を返す` |
| Requesting a non-existent receipt returns 404 | `存在しない証憑の取得は404を返す` |
| An unknown route returns 404 | `未知の経路は404を返す` |

## Voiding, detaching and aggregation

| Guarantee | Test |
|---|---|
| A voided transaction drops out of aggregation | `取消しても取引は残り、集計からだけ外れる` |
| A voided transaction remains in storage | `取消しても取引は残り、集計からだけ外れる` |
| Detaching a receipt only removes the link from the transaction | `証憑を取り外しても紐付けが外れるだけで、ファイルは残る` |
| A detached receipt is recorded in the detached list | `証憑を取り外しても紐付けが外れるだけで、ファイルは残る` |
| The file of a detached receipt remains retrievable | `証憑を取り外しても紐付けが外れるだけで、ファイルは残る` |
| The dashboard can aggregate by a specified year | `ダッシュボードは年を指定して集計できる` |
