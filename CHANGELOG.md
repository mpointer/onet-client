# Changelog

## 0.2.0

Behavior changes:

- `details()` throws `OnetApiError` when pagination stops before the
  report's `total` (for example a `next` link that is not followed),
  instead of returning a partial list. `all: false` is unchanged.
- `parseCareerInterestTypes` leaves out a code that lacks any of the six
  OI rows, instead of filling the missing areas with 0.
- `summary`, `careerReport` and `details` reject a resource name that is
  not lowercase letters and underscores. `..` used to resolve one path
  segment up.
- A 2xx response whose body is not JSON throws `OnetApiError`, not a raw
  `SyntaxError`.

Fixes:

- `resolveCode` returns null when the search response has no `career` list.
- The release workflow pins npm 11 instead of `npm@latest`.

## 0.1.0

First release. Extracted from a production career-guidance application's
`src/lib/onet*.ts` (keyword search and occupation verification, details
reports for embeddings and skills gaps, the hosted Mini-IP for students,
and bulk-file parsers for release validation and Holland-code backfills).

- `OnetClient`: `X-API-Key` GETs with one 429 retry after 200 ms, typed
  `OnetApiError`, `next`-link pagination pinned to the base URL, code
  validation before any URL is built.
- Typed reports: My Next Move search and `job_outlook`, O\*NET OnLine
  occupation overview, `summary/job_zone`, every `details/*` resource with
  pages collected, RIASEC scores and Holland code from `details/interests`,
  and `occupationSummary` for the four in parallel with per-part errors.
- Interest Profiler: 30 and 60 item question sets with pagination and a
  count check, hosted scoring, answer-string building and validation,
  `computeItemSetVersion`.
- Helpers for O\*NET-SOC codes, RIASEC tables and Holland codes, and the
  bulk "Occupation Data" and "Career Interest Types" files.
