# 構成

## ディレクトリ

| パス | 内容 |
|---|---|
| `core/api.mjs` | API 本体。`Request → Response` の Web 標準ハンドラ。ローカルと本番が共有する |
| `core/aggregate.mjs` | 按分・仕訳生成・科目×月・一括償却の展開・消費税・またぎ計上。純関数のみ |
| `core/tax.mjs` | 給与所得控除・所得税・住民税・限界税率。純関数のみ |
| `core/store-local.mjs` | ローカル開発用の保存先（`data/` 配下のファイル） |
| `core/store-github.mjs` | 本番の保存先（GitHub Contents API） |
| `dev/server.mjs` | node:http アダプタ。静的配信も担う |
| `functions/api/[[path]].js` | Cloudflare Pages Functions アダプタ |
| `config/accounts.json` | 勘定科目マスタ（アイコン・既定税率区分・既定按分率） |
| `config/tax-<年>.json` | 税率表と各控除額。年ごとに1ファイル |
| `public/` | UI。`index.html` / `app.js` / `charts.js` / `icons.js` / `style.css` |
| `tests/` | `core/` の純関数に対するテスト |
| `data/` | ローカル実行時の帳簿。git 管理外 |

## データの流れ

```
入力（ブラウザ）
  → POST /api/entries
  → core/api.mjs        既定値の補完・検証
  → Store               entries/YYYY-MM.jsonl へ追記
                        receipts/<id>/<file> へ証憑

表示
  → GET /api/dashboard?year=YYYY
  → Store.listEntries()
  → core/aggregate.mjs  effectiveEntries で「その年に効く金額」へ展開
                        （一括償却は3年均等に分解される）
  → core/tax.mjs        給与と合算して税額を算出
  → JSON
```

## 保存形式

```
<LEDGER_ROOT>/
  entries/YYYY-MM.jsonl     1行1取引。月ごとに1ファイル
  receipts/<entryId>/*.webp  電子取引データ（スクショ）
  settings.json              給与履歴・所得控除・源泉徴収税額
```

取引の主なフィールド:

| キー | 意味 |
|---|---|
| `kind` | `expense` / `revenue` |
| `date` | 計上日。期中は入金日・支払日基準 |
| `account` | 勘定科目コード（`config/accounts.json`） |
| `amount` | 税込の額面 |
| `ratio` | 家事按分率。集計は `amount × ratio` |
| `vat` | 税率区分 `10` / `8` / `gai` |
| `assetKind` | `lump`（一括償却）/ `small`（少額特例）/ `null` |
| `accrual` | `receivable`（未収）/ `payable`（未払）/ `null` |
| `void` | 取消フラグ。集計から外れるが行は残る |
| `receipts` | 紐付いた証憑のパス |
| `detachedReceipts` | 取り外した証憑のパス。ファイル自体は残る |

## UI の構成

タブは5つ。Entry（入力）／ Ledger（一覧・編集）／ Business（事業の数字）／ Tax（申告の数字）／ Settings（給与・控除）。

Business には給与を出さない。給与と合算するのは申告のためであり、事業の実態を見る画面には混ぜない。
