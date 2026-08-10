[🇯🇵 日本語](design-decisions.md) | [🇬🇧 English](design-decisions.en.md)

# Design Decisions

The full record of technology choices and design decisions for etax-prep. The Design Decisions and Tech Stack sections of the README draw their summaries from here.

## Building it rather than adopting an existing OSS project

Japanese tax-filing OSS falls into three families: bookkeeping systems with blue-return statements and journals (the mpp_fsjs family), a local-first PWA journal (e-shiwake), and an AI-agent plugin (shinkoku). All are thick at the back end — closing, statements, e-Tax — and none is designed as a front door for entering daily expenses with minimum effort. The tools that are light at the front door are household budget apps with no chart of accounts.

What was needed was the front door. Entering figures into e-Tax by hand is already routine and not a burden. Adopting an existing project would only duplicate the back end without solving the front-door problem.

Pairing with shinkoku and delegating the back end to it was considered, but the advantage evaporated once entering e-Tax by hand was settled as the premise.

## Accepting single-entry input and converting to double-entry

The ¥650k blue-return deduction requires proper bookkeeping, hence a balance sheet. Asking for debit and credit on every entry, however, defeats the goal of minimum effort.

Because no separate business account or card exists, every expense is paid from personal funds and the credit side can be fixed to owner's capital. Input therefore needs only the debit-side account, and journal generation can be fully automated. The double-entry requirement and lightness of entry are reconciled here.

Room is left to enable a payment-method field from `config` should a business account be separated in future.

## Holding amounts tax-inclusive and assigning tax categories automatically

The consumption tax method (exempt, 20% special provision, standard) is undecided and will be chosen at year end. As long as the standard method remains possible, expenses need a tax category too.

Asking for the rate on every entry would make input heavy, so it is assigned automatically from a per-account default. The default is almost always right, so no effort is added, and any method can be computed later. Tax-exclusive accounting is not used: committing to it while exemption is still possible would leave the data needlessly complex once exemption is confirmed.

## Cash basis during the year, accrual only at year end

Revenue should be booked on the date it is received. The ¥650k deduction, however, presupposes accrual accounting, and the cash-basis special provision only allows a ¥100k deduction, so the two cannot coexist.

The operating rule is to enter one line on the receipt date during the year and, at the end of December, pick up only the receivables and payables that straddle the year end. The result matches accrual accounting while daily entry keeps the lightness of the cash basis.

## Not digitising paper; handling only electronic transaction data

Since January 2024, electronic transaction data (credit card statement screenshots, web receipts, PDFs attached to email) must be preserved electronically, whereas a receipt handed over on paper may simply be kept as a paper original. Scanner preservation is an optional scheme, and adopting it triggers requirements around resolution, timestamp equivalents, and correction and deletion history.

Photographing receipts without meeting those requirements does not permit discarding the originals and merely creates duplicate management, so paper stays in an envelope and outside the app. The app handles only electronic transaction data, aligning the boundary of the implementation with the boundary in the regulation.

Photographing receipts is useful as insurance against thermal paper fading, but it is not regulatory compliance, so it remains an optional attachment.

## Not making deletion physical

Japan's Electronic Books Preservation Act requires that a trail of corrections and deletions remain. Removing a line makes it disappear from aggregation but leaves no record in the ledger of what was changed and how.

Voiding sets a flag that excludes the transaction from aggregation. Combined with git history, the record survives twice over. Receipts are treated the same way: detaching one from a transaction leaves the file in place. Having attached something by mistake is not a reason to delete it.

A sibling project never implemented editing on the web side, but that was a matter of low need rather than technical difficulty. Here, correcting typos happens routinely, so the editing path is part of the MVP. It runs through the GitHub API's read-modify-write (a PUT carrying the retrieved sha); with a single user, conflicts are rare, and a rejection on sha mismatch is resolved by re-fetching and retrying.

## Holding the ledger of record in a GitHub repository rather than a database

The ledger only ever grows by appending, and voiding sets a flag rather than removing a row. There is a single writer, and reads amount to aggregating every entry for a given year. With no concurrent updates to reconcile and no index to maintain, reading the per-month JSONL files and aggregating them through pure functions is enough.

The trail of corrections and deletions that the Electronic Books Preservation Act requires is satisfied by commit history as it stands. Moving to a database would mean designing and operating that trail separately. Since the preservation requirement already matches what git does, a database would add implementation rather than capability.

Storage is delegated to GitHub, but there is no lock-in. The ledger of record is JSONL with one transaction per line plus the receipt files, so a clone leaves a complete copy in hand. Reads and writes through the API are confined to `core/store-github.mjs`, and local runs use `core/store-local.mjs` behind the same interface. Migrating means adding one more store adapter.

## Keeping receipt images in git rather than external storage

Images are the electronic transaction data itself, and separating them from the ledger weakens preservation. A few hundred images and tens of megabytes per year is no burden for git.

A state where a single clone brings both ledger and supporting documents is the strongest answer to the preservation requirement. External object storage is not used.

## Plain ESM JavaScript with no static site generator

Aggregation is the main event, and figures should update the moment an entry lands. A static site generator that aggregates at build time would mean waiting for a redeploy on every entry — a poor fit.

The code is plain ESM with no build step, and the core logic (aggregation, apportionment, journal generation, tax calculation) is runtime-agnostic. Storage is swapped through an adapter: the filesystem for local development, the GitHub API in production. It ports to Cloudflare Pages Functions unchanged.

## Extracting tax rates and deduction amounts into configuration

The salary income deduction, the basic deduction, and the rate table are all subject to annual reform. Embedding them in code means touching the logic on every change, which invites mistakes.

They live in `config/tax-<year>.json` as per-year constants, and the calculation code is written without knowledge of the year. The premise is that the values are verified against the National Tax Agency's primary sources before operation begins and before each year's filing.

## Writing the API as a standard fetch handler

Local development runs on node:http and production on Cloudflare Pages Functions — two different runtimes. Written naively, routing and business logic end up implemented twice, and fixing only one of them becomes an accident waiting to happen.

A single handler is written against the standard `Request → Response` interface, and both runtimes become thin adapters that call it. Node 24 ships `Request` and `Response`, so this shape runs as-is. The only difference left is the storage backend (`LocalStore` or `GitHubStore`).

`STORE=github` exercises the production path locally.

## Open questions

- The marginal rate on the dashboard does not match reality while business income is capped by the blue-return deduction. There is a range in which adding expenses only shrinks the deduction without moving the tax, so the display should perhaps be replaced by an estimate of "how much the tax moves if you add N yen of expenses".
- A naming rule for receipt image files, incorporating transaction date, amount, and counterparty, to serve in place of the search requirement for electronic transaction data.
- The shape of the entry point for backfilling past records in bulk.
- Where to keep the internal procedures document used as the tamper-prevention measure for electronic transaction data.
