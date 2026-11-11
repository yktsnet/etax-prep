[🇯🇵 日本語](README.md) | [🇬🇧 English](README.en.md)

# Guarantee Ledger

This is the list of behaviour this repository promises to the outside, and the tests that hold each promise. When a promise breaks, a test fails, so nothing written here drifts from the implementation unnoticed. **Behaviour not listed here is not a promise and may change without notice.**
The scope is the pure functions in `core/` (aggregation and tax calculation) and the response contracts of the HTTP API and the storage backend. The UI (`public/`) — its appearance and interactions — is out of scope and is verified by eye. This ledger ranks alongside the [design decision record](../design-decisions.en.md).

- Purpose: read in one place what is promised today; before a change, look up here the promises it must not break; keep promises that have no test under Gaps
- Layout: one file per subject of promise (a `core/` module, the HTTP API, a storage backend). Do not split by test file or by issue. Add a file only when a new subject appears
- Format: each file holds a "Guarantee | Test" table with one promise per row, written as a declarative sentence. Sources, history and design rationale are not written here (the design decision record holds them). UI appearance and manually checked interactions are not listed. A file with 10 or more promises is divided by `##` headings into groups of related promises, each with its own table of at least 3 rows (the file is not split). A file with fewer than 10 promises has no headings
- Lookup: before a change, open the subject's file and read the promises to keep. When a test fails, search the ledger for the test's name to find the broken promise. CI, which runs every test, confirms the promises hold
- Maintenance: read this README before a change, and take the "guarantees to keep" from the files the change touches. To add, change or remove a promise, add, edit or delete the row in the relevant table using the wording of the approved guarantee section, and fix the corresponding test in the same change. Update the Japanese version in the same change. Do not create a file or section per issue or task. Promises without a test go under Gaps and move into a table once a test is added. Drift is audited with `guarantee-audit`

## Files

| Subject |
|---|
| [aggregate](aggregate.en.md) (`core/aggregate.mjs`) |
| [tax](tax.en.md) (`core/tax.mjs`) |
| [api](api.en.md) (the HTTP API in `core/api.mjs`) |
| [store-github](store-github.en.md) (`GitHubStore` in `core/store-github.mjs`) |

## Gaps

- That the two storage backends (`LocalStore` and `GitHubStore`) satisfy the same interface is unguaranteed. How `GitHubStore` handles failures is in the `store-github` table; what is unguaranteed here is the equivalence of the two implementations. In particular, an update that moves a transaction across month boundaries is a branch each implementation carries separately, so one can break alone. Deferred because it needs a fake for the GitHub API, which goes beyond the scope of this audit.
- The asset thresholds (¥100k and ¥300k) are unguaranteed. The decision lives in the UI (`public/app.js`) and cannot be tested without extracting it into `core/`. Deferred because it would require moving implementation.
- That `monthlyMatrix` aggregates expenses only and excludes revenue is unguaranteed. The test input contains no revenue transaction.
- That `revenueByMonth` excludes revenue from other years is unguaranteed. The test input contains only revenue from the given year.
- That `estimate` adds a positive business income to salary income to form total income is unguaranteed. The merging test uses a business income of 0, and only the loss side (loss offset) is checked.
