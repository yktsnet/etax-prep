# store-github

| Guarantee | Test |
|---|---|
| `listEntries` returns an empty list when the target does not exist (404) | `取得の404は「まだ無い」として扱う` |
| `readReceipt` returns null when the target does not exist (404) | `取得の404は「まだ無い」として扱う` |
| `addEntry` throws when a write is refused with a 404, rather than reporting success for a save that did not happen | `書き込みの404は握り潰さず例外にする` |
| `saveReceipt` turns a failed write into an exception | `証憑の保存も書き込み失敗を例外にする` |
| `saveSettings` turns a failed write into an exception | `設定の保存も書き込み失敗を例外にする` |
| `GitHubStore` fails at construction when the token is missing | `トークンとリポジトリが無ければ生成時に落とす` |
| `GitHubStore` fails at construction when the repository is missing | `トークンとリポジトリが無ければ生成時に落とす` |
| `readReceipt` refetches a receipt too large for the Contents API to return content (over 1MB) as raw and returns its bytes | `1MB を超える証憑は raw で取り直して中身を返す` |
