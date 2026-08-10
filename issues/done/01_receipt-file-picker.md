## PR記録: feat: 証憑をローカルファイル選択でも添付できるようにする
issue: 01 (01_receipt-file-picker.md)
PR: https://github.com/yktsnet/etax-prep/pull/3
Merged: 0bbacec0fdb0713f80ba932b1aab3024fc830df0

## 変更内容
証憑の入口がクリップボード貼り付けしかなく、保存済みの画像ファイル（Web 領収書のダウンロード、他端末から受け取ったスクショ）を添付できなかった。入力画面と台帳の編集行の両方に、ファイル選択からの添付経路を足した。圧縮・アップロードの既存処理は共有し、API は変更していない。

- `public/app.js`: `takePaste` から圧縮して `onDone` へ渡す部分を `attachImage(file, onDone)` として切り出し、貼り付け（`takePaste`）とファイル選択（`takeFile`）の両方から呼ぶ共通経路にした。入力画面は `applyPending` で貼り付けと選択を同じプレビュー表示に統一。台帳の編集行は選択と同時に `uploadReceipt` して `renderList()`（貼り付けと同じ）。ファイル選択後は毎回 `input.value` をクリアし、同じファイルを選び直せるようにした。
- `public/index.html`: `#paste-area` の隣にファイル選択の入口（`label.file-btn` + `input[type=file]`）を並置。`accept` は `image/*` ではなく `.png,.jpg,.jpeg,.gif,.webp` を列挙し、モバイルでカメラが既定の選択肢にならないようにした（`capture` 属性は付けない）。文言も両経路があることが分かる表現に直した。
- `public/style.css`: 素の `<input type=file>` をラベル経由でボタンとして見せる `.file-btn` を追加。色は既存の `:root` トークンのみを参照し、新規トークンは増やしていない。貼り付け専用の `.paste-area` はポインタ操作の効かない端末で従来どおり非表示にする一方、ファイル選択は端末を問わず使えるよう `#paste-preview` を非表示対象から外した。
- `README.md` / `README.en.md`: Screenshots のキャプションにあった貼り付け前提の記述を、貼り付け・ファイル選択の両方があることが分かる表現に直した。issue が言及していた Overview 中の「証憑の添付は PC のみ」という一文は、現在の README には存在しなかったため変更していない（grep で確認済み）。

## 保証
- 新たに宣言する保証: なし（issue記載のとおり、変更は `public/` の UI に閉じており、保証台帳の対象は `core/` の純関数と HTTP API の応答契約。API の要求・応答は変えていない）
- 維持する保証（いずれも `public/` の変更では触っていない `core/`・`functions/` 側の既存テストがそのまま担保）:
  - 証憑を取り外すと取引からの紐付けだけが外れ、退避先へ記録が残り、ファイル自体は取得できる → `tests/api.test.mjs`
  - 存在しない証憑の取得は 404 を返す → `tests/api.test.mjs`
  - 証憑の保存は書き込み失敗を例外にする（握り潰さない）→ `tests/api.test.mjs`「証憑の保存も書き込み失敗を例外にする」

## 静的確認結果
- `node --check public/app.js`: 構文エラーなし
- `node --test 'tests/*.test.mjs'`: 50 pass / 0 fail
- caller・import の整合性: `attachImage` / `takeFile` / `applyPending` は同一ファイル内で定義後にすべての呼び出し元（貼り付けハンドラ、`#file-input` の `onchange`、`openEdit` 内の `.file-btn input` の `onchange`）から参照されており未解決参照なし。`index.html` の `#file-input` id と `app.js` の `$('#file-input')` セレクタが一致することを確認。API 呼び出し（`uploadReceipt`, `/api/entries` 等）は変更していない。
- `git diff --name-only --cached`:
  ```
  README.en.md
  README.md
  public/app.js
  public/index.html
  public/style.css
  ```
  issue の「対象」フィールドと完全一致。

## 検証手順
`node dev/server.mjs` で起動し、入力画面と台帳の編集行の双方から、ファイル選択・貼り付けの両経路で証憑を添付できることを目視確認してください（本コミットではサーバー起動・目視確認は行っていません）。
