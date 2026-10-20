# onet-client

Typed client for [O\*NET Web Services v2](https://services.onetcenter.org/) (`api-v2.onetcenter.org`): occupation search and reports, paged details reports, the Interest Profiler and Mini-IP, plus parsers for the O\*NET database bulk files. Zero dependencies, ESM, Node 20 or later (uses the built-in `fetch`).

O\*NET is the U.S. Department of Labor's occupational database: about 1,000 occupations with skills, knowledge, abilities, work activities, work context, interests (RIASEC), job zones, outlook and BLS wages. The Web Services need a free API key from [My Account](https://services.onetcenter.org/developer/). This library was extracted from a production career-guidance product that verifies career cards against O\*NET and runs the Mini-IP for students; it keeps the lessons that product learned (see "What it does for you").

## Install

```sh
npm install onet-client
```

## Use

```ts
import { OnetClient } from 'onet-client';

const onet = new OnetClient({ apiKey: process.env.ONET_API_KEY!, userAgent: 'my-app/1.0 (contact@example.com)' });

// Title to occupation code: closest match first
const hit = await onet.resolveCode('mechanical engineer');       // { code: '17-2141.00', title: 'Mechanical Engineers', ... } | null

// One occupation, four reports in parallel; optional parts degrade to null with their error kept
const s = await onet.occupationSummary('17-2141.00');
s.occupation.description;                                         // the O*NET OnLine overview
s.jobZone?.code;                                                  // 1 to 5
s.outlook?.salary.annual_median;                                  // BLS OES, dollars
s.outlook?.bright_outlook?.map((b) => b.title);                   // ['Grow Rapidly', ...] when any apply
s.interests?.hollandCode;                                         // 'RIC'
s.errors;                                                         // { outlook?: OnetApiError, ... }

// Any details report, every page collected, 0 to 100 importance
const skills = await onet.skills('17-2141.00');                   // also knowledge, abilities, workActivities, workStyles, workContext
const top = skills.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 5);

// Interest Profiler: fetch the 30-item Mini-IP, score it with O*NET's own scorer
const set = await onet.interestProfilerQuestions(30);             // questions, answerOptions, itemSetVersion
const result = await onet.interestProfilerResults(answers, 30);   // answers: number[] in question order, 1 to 5
result.scores;                                                    // { realistic: 27, investigative: 13, ... }

// Anything else the service offers
const tech = await onet.careerReport('17-2141.00', 'technology');
const zones = await onet.get('online/job_zones/');
```

Bulk files need no key:

```ts
import { bulkFileUrl, BULK_FILES, parseOccupationData, diffOccupations, parseCareerInterestTypes } from 'onet-client';

const url = bulkFileUrl('30.3', BULK_FILES.occupationData);      // .../db_30_3_text/Occupation%20Data.txt
const current = parseOccupationData(await (await fetch(url)).text());
const diff = diffOccupations(previous, current);                  // { added, removed, changed, unchanged }
const riasec = parseCareerInterestTypes(interestsText);           // Map<code, { R, I, A, S, E, C }> on the 1 to 7 OI scale
```

## API

### `new OnetClient(options)`

| Option | Default | Notes |
|---|---|---|
| `apiKey` | required | Sent as `X-API-Key`; never in the query string. |
| `baseUrl` | `https://api-v2.onetcenter.org` | For a recording proxy in tests. |
| `fetch` | `globalThis.fetch` | Inject for tests or a custom agent. |
| `userAgent` | none | The terms ask that applications be identifiable. |
| `timeoutMs` | `15000` | Per request; `0` disables. |
| `rateLimitRetries` | `1` | How many 429s to retry before throwing. |
| `rateLimitDelayMs` | `200` | Never lowered below O\*NET's documented minimum. |
| `maxPages` | `50` | Upper bound on `next` links followed. |

Methods: `search(keyword, {start, end})`, `resolveCode(title)`, `careerOutlook(code)`, `careerReport(code, resource)`, `occupation(code)`, `jobZone(code)`, `summary(code, resource)`, `details(code, resource, {sort, start, end, all})`, `skills`, `knowledge`, `abilities`, `workActivities`, `workStyles`, `workContext`, `interests(code)`, `occupationSummary(code)`, `interestProfilerQuestions(30 | 60)`, `interestProfilerResults(answers, 30 | 60)`, `get(path, query)`, `pages(path, query)`.

Every code parameter is validated against `NN-NNNN.NN` and trimmed before a URL is built, so a value lifted from a request body cannot walk out of the intended path with your key attached. A non-2xx response throws `OnetApiError` with `status`, `url` and the parsed body (a 422 carries `{ error }`; other statuses may not carry JSON). A `next` link is only followed when it points back at `baseUrl`.

### Helpers

- Codes: `ONET_CODE_RE`, `isOnetCode`, `assertOnetCode`, `socToOnetCode` (`15-1252` to `15-1252.00`, the `.00` convention, not a fan-out), `onetToSocCode`.
- RIASEC: `hollandCodeFromScores` (ties in R-I-A-S-E-C order, as O\*NET's own high-point code), `riasecFromInterestElements`, `hasAllRiasecDimensions`, the area and letter tables.
- Interest Profiler: `answersToString`, `answersMapToOrderedArray`, `hasValidAnswerKeys`, `hasValidAnswerValues`, `computeItemSetVersion` (store it with in-progress answers; compare on resume to catch an item-set revision).
- Bulk: `bulkTextBase`, `bulkFileUrl`, `parseTabDelimited`, `columnIndex` (columns resolved by header name, with every missing name reported together), `parseOccupationData`, `diffOccupations`, `parseCareerInterestTypes`.

## What it does for you

- **One 429 retry after 200 ms**, O\*NET's documented guidance, then the error. The service is best-effort; batch jobs should add their own delays and stay under 5 requests per second and 50,000 per day.
- **Scored resources in one page.** Details reports default to 10 elements per page; the client asks for 500 (the largest observed resource is 57 work-context elements) and still follows `next` if the service splits.
- **No partial scores.** `interests` returns `scores: null` unless all six areas came back; `interestProfilerQuestions` throws unless the full form arrived; `interestProfilerResults` throws if an area is missing. Storing a partial RIASEC profile as if complete was a real bug upstream.
- **Known-code verification.** `occupation(code)` is the way to confirm a code you already hold; title search takes O\*NET's top hit, and on titles that are not O\*NET titles that hit is often a different occupation (16 of 87 cards in one audit). Prefer a known code over a search when you have one.
- **Field names as the service sends them.** `annual_median` and friends, `importance` on skills but `context` on work context and `occupational_interest` on interests, `_over` fields when a BLS estimate exceeds the published maximum. The types say which field each resource carries.

## Terms you still have to meet

The service's [Terms of Service](https://services.onetcenter.org/terms) and [Data License](https://services.onetcenter.org/help/license_data) bind the application, not this library:

- Credit and link O\*NET Web Services near the data. Suggested wording: "This site incorporates information from O\*NET Web Services by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O\*NET® is a trademark of USDOL/ETA."
- Do not alter the information; format and organization may change if accuracy, attribution and intent are preserved. Render Interest Profiler item text exactly as returned.
- Use the service only on registered sites or applications under your control. Paid or registration-required distributions need the Center's permission.

## Not covered

- Mi Próximo Paso (`/mpp/`) and My Next Move for Veterans (`/veterans/`) paths are reachable through `get`, but untyped.
- No caching. Most O\*NET data updates quarterly or annually; put a cache in front of the client for real-time use.
- The Interest Profiler "matching careers" service is reachable through `get('mnm/interestprofiler/careers', { answers })`; its response shape has not been exercised here, so it stays untyped.

## License

MIT. O\*NET data is licensed separately by its publisher; see above.
