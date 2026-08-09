@~/.claude/CLAUDE.md

# etax-prep

確定申告（青色65万・e-Tax）の前準備を担う個人用 Web アプリ。日々の経費入力を最小手数にし、申告時に必要な集計を出す。e-Tax への入力自体は手で行う。

フェーズ概念は適用しない（`~/github-public/` 配下ではないため）。相談者が開放チャットで直接実装してよい。公開の準備が済み次第 Public 化する予定。

## コマンド

```bash
node dev/server.mjs          # ローカル起動 → http://localhost:8099（保存先はローカルの data/）
STORE=github node dev/server.mjs   # 本番と同じ経路（GitHub リポジトリ）で検証する
node --test 'tests/*.test.mjs'     # テスト
```

ビルドステップは無い。依存パッケージも無い（Lucide のアイコンは `public/icons.js` に同梱済み）。

## 検証手段

PR 前に必ず `node --test 'tests/*.test.mjs'` を通す。集計・税計算は純関数として `core/` に置いてあり、ここがテストの対象。

UI は目視で確認する。ダーク専用のため、ライトモードの確認は不要。

## アーキテクチャ

API は Web 標準の `Request → Response` ハンドラ（`core/api.mjs`）が1本あるだけで、ローカルの node:http（`dev/server.mjs`）と Cloudflare Pages Functions（`functions/api/[[path]].js`）はそれを呼ぶ薄いアダプタ。**業務ロジックを二重に書かない**。

保存先は差し替え可能で、`LocalStore`（ファイル）と `GitHubStore`（GitHub Contents API）が同じインターフェースを実装する。本番の正本は GitHub リポジトリで、git 履歴が電子帳簿保存法の訂正・削除の記録を兼ねる。

## 触るときの注意

- **税率・控除額をコードに埋め込まない。** `config/tax-<年>.json` に置く。改正のたびに計算コードを触らずに済ませる
- **取消も証憑の取り外しも物理削除にしない。** フラグを立てて集計から外すだけにする（保存義務があるため）
- 認証は持たない。Cloudflare Access（Google ログイン限定）を通った要求だけが届く前提
