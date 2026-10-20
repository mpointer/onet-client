/**
 * O*NET Web Services v2 client (api-v2.onetcenter.org).
 *
 * Every request is a GET with an `X-API-Key` header, as the service
 * requires; keys never go in a query string. A 429 is retried once after
 * O*NET's documented minimum of 200 ms. Any other non-2xx response throws
 * `OnetApiError` with the status and, when the service sent one, its JSON
 * error message (only 422s are guaranteed to carry one). Paged reports are
 * followed through their `next` links, which are only honoured when they
 * point back at the configured base URL.
 *
 * Terms the service attaches to its data, which a consumer has to meet and
 * this client cannot meet for it: credit and link O*NET Web Services near
 * the data ("This site incorporates information from O*NET Web Services by
 * the U.S. Department of Labor, Employment and Training Administration
 * (USDOL/ETA)"), do not alter the information, stay under 5 requests per
 * second and 50,000 per day, and render Interest Profiler item text as
 * returned. See https://services.onetcenter.org/terms and
 * https://services.onetcenter.org/help/license_data.
 */
import { assertOnetCode } from './codes.js';
import {
  answersToString,
  type InterestProfilerAnswerOption,
  type InterestProfilerForm,
  type InterestProfilerQuestion,
  type InterestProfilerQuestionSet,
  type InterestProfilerAreaResult,
  type InterestProfilerResult,
  computeItemSetVersion,
} from './interest-profiler.js';
import { RIASEC_AREAS, hollandCodeFromScores, riasecFromInterestElements, type RiasecArea, type RiasecScores } from './riasec.js';

export const ONET_API_BASE = 'https://api-v2.onetcenter.org';

/** O*NET's documented minimum delay before retrying a 429. */
export const RATE_LIMIT_RETRY_DELAY_MS = 200;

export class OnetApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    /** The parsed JSON body when the response carried one, else the raw text (possibly empty). */
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'OnetApiError';
  }
}

export type QueryValue = string | number | boolean | undefined;
export type Query = Record<string, QueryValue>;

export interface OnetClientOptions {
  /** Your O*NET Web Services API key (services.onetcenter.org, My Account). */
  apiKey: string;
  /** Override the service root, e.g. for a recording proxy in tests. Default `https://api-v2.onetcenter.org`. */
  baseUrl?: string;
  /** Fetch implementation. Default `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Sent as `User-Agent`; the terms ask that applications be identifiable. */
  userAgent?: string;
  /** Per-request timeout in ms. Default 15000; 0 disables. */
  timeoutMs?: number;
  /** How many times to retry a 429 before throwing. Default 1 (the service's guidance). */
  rateLimitRetries?: number;
  /** Delay before a 429 retry, in ms. Default 200. Never lower than the service minimum. */
  rateLimitDelayMs?: number;
  /** Upper bound on pages followed through `next` links. Default 50. */
  maxPages?: number;
}

/** Pagination envelope shared by every paged report. */
export interface Page {
  start: number;
  end: number;
  total: number;
  prev?: string;
  next?: string;
}

export interface CareerTags {
  bright_outlook?: boolean;
  apprenticeship?: boolean;
}

/** A My Next Move search hit. */
export interface Career {
  href: string;
  code: string;
  title: string;
  tags: CareerTags;
}

export interface SearchPage extends Page {
  career: Career[];
}

export type BrightOutlookCategoryCode = 'grow' | 'openings' | 'emerging';

export interface BrightOutlookCategory {
  href?: string;
  code: BrightOutlookCategoryCode | string;
  title: string;
}

export interface OccupationLink {
  href: string;
  title: string;
}

/** The O*NET OnLine occupation overview (`/online/occupations/{code}/`). */
export interface Occupation {
  code: string;
  title: string;
  description: string;
  tags: CareerTags;
  sample_of_reported_titles?: string[];
  also_see?: Career[];
  bright_outlook?: BrightOutlookCategory[];
  updated?: { year: number; contents: Array<{ title: string; source?: string; year?: number }> };
  summary_contents?: OccupationLink[];
  details_contents?: OccupationLink[];
  custom_contents?: OccupationLink[];
}

/** `/online/occupations/{code}/summary/job_zone`. `code` is the zone, 1 to 5. */
export interface JobZone {
  code: number;
  title: string;
  education: string;
  related_experience: string;
  job_training: string;
  job_zone_examples: string;
  svp_range: string;
}

export type OutlookCategory = 'Bright' | 'Average' | 'Below Average';

/**
 * `/mnm/careers/{code}/job_outlook`. Salary figures are BLS OES estimates in
 * dollars; when an estimate exceeds the published maximum the service sends
 * the `_over` field instead of the base one.
 */
export interface JobOutlook {
  outlook: { category: OutlookCategory | string; description: string };
  bright_outlook?: BrightOutlookCategory[];
  salary: {
    soc_code: string;
    annual_10th_percentile?: number;
    annual_10th_percentile_over?: number;
    annual_median?: number;
    annual_median_over?: number;
    annual_90th_percentile?: number;
    annual_90th_percentile_over?: number;
    hourly_10th_percentile?: number;
    hourly_10th_percentile_over?: number;
    hourly_median?: number;
    hourly_median_over?: number;
    hourly_90th_percentile?: number;
    hourly_90th_percentile_over?: number;
  };
}

/** Resources served under `/online/occupations/{code}/details/`. */
export type DetailsResource =
  | 'abilities'
  | 'apprenticeship'
  | 'detailed_work_activities'
  | 'education'
  | 'interests'
  | 'job_zone'
  | 'knowledge'
  | 'military_career_summaries'
  | 'professional_associations'
  | 'related_occupations'
  | 'skills'
  | 'tasks'
  | 'technology_skills'
  | 'work_activities'
  | 'work_context'
  | 'work_styles';

/** One element of a details report. Which score field is present depends on the resource. */
export interface DetailElement {
  id: string;
  name: string;
  description?: string;
  related?: string;
  /** Skills, knowledge, abilities, work activities, work styles: 0 to 100. */
  importance?: number;
  /** Work context: 0 to 100 standardized context rating. */
  context?: number;
  /** Interests: 0 to 100. */
  occupational_interest?: number;
  /** Work context: the response categories behind the rating. */
  response?: Array<{ percentage_of_respondents: number; description: string }>;
  [extra: string]: unknown;
}

export interface DetailsPage extends Page {
  element: DetailElement[];
}

export interface DetailsOptions {
  /** `importance` (the default for scored resources) or `name`; work_context accepts `context`. */
  sort?: string;
  /** First index to return; default 1. */
  start?: number;
  /** Last index to return. Default 500, which is every element of any scored resource in one page. */
  end?: number;
  /** Follow `next` links until the report is exhausted. Default true. */
  all?: boolean;
}

/** RIASEC profile of an occupation from `/online/occupations/{code}/details/interests`. */
export interface OccupationInterests {
  /** 0 to 100 per letter, when all six came back. */
  scores: RiasecScores | null;
  /** Three-letter Holland code from `scores`, when available. */
  hollandCode: string | null;
  elements: DetailElement[];
}

/** Everything `occupationSummary` fetches, with per-part failures kept rather than thrown. */
export interface OccupationSummary {
  occupation: Occupation;
  jobZone: JobZone | null;
  outlook: JobOutlook | null;
  interests: OccupationInterests | null;
  /** The error behind each null above, by part name. */
  errors: Partial<Record<'jobZone' | 'outlook' | 'interests', Error>>;
}

interface RawQuestionPage extends Page {
  question: Array<{ index: number; area: string; text: string }>;
  answer_option: Array<{ value: number; name: string }>;
}

interface RawResults {
  careers?: string;
  result?: Array<{ href?: string; code: string; title?: string; description?: string; score: number }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OnetClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly userAgent: string | undefined;
  private readonly timeoutMs: number;
  private readonly rateLimitRetries: number;
  private readonly rateLimitDelayMs: number;
  private readonly maxPages: number;

  constructor(options: OnetClientOptions) {
    if (!options.apiKey || typeof options.apiKey !== 'string') {
      throw new TypeError('OnetClient needs an apiKey (services.onetcenter.org, My Account)');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? ONET_API_BASE).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.userAgent = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.rateLimitRetries = options.rateLimitRetries ?? 1;
    this.rateLimitDelayMs = Math.max(RATE_LIMIT_RETRY_DELAY_MS, options.rateLimitDelayMs ?? RATE_LIMIT_RETRY_DELAY_MS);
    this.maxPages = options.maxPages ?? 50;
    if (typeof this.fetchImpl !== 'function') {
      throw new TypeError('No fetch available; pass one in options.fetch');
    }
  }

  /** Build an absolute URL for a service path and query. Undefined query values are omitted. */
  url(path: string, query?: Query): string {
    const u = new URL(this.baseUrl + '/' + path.replace(/^\/+/, ''));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  /**
   * GET any service path and return its JSON. The escape hatch for reports
   * this client has no typed method for; the typed methods all go through it.
   */
  async get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.getUrl<T>(this.url(path, query));
  }

  private async getUrl<T>(url: string): Promise<T> {
    const headers: Record<string, string> = { 'X-API-Key': this.apiKey, Accept: 'application/json' };
    if (this.userAgent) headers['User-Agent'] = this.userAgent;

    let response: Response | undefined;
    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = { method: 'GET', headers };
      if (this.timeoutMs > 0) init.signal = AbortSignal.timeout(this.timeoutMs);
      response = await this.fetchImpl(url, init);
      if (response.status !== 429 || attempt >= this.rateLimitRetries) break;
      await response.body?.cancel().catch(() => {});
      await sleep(this.rateLimitDelayMs);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let body: unknown = text;
      let detail = '';
      try {
        body = JSON.parse(text);
        const err = (body as { error?: unknown }).error;
        if (typeof err === 'string') detail = `: ${err}`;
      } catch { /* not JSON; keep the text */ }
      throw new OnetApiError(`O*NET ${response.status} on ${url}${detail}`, response.status, url, body);
    }
    return (await response.json()) as T;
  }

  /**
   * Follow a paged report through its `next` links. Yields each page as
   * returned. A `next` that does not point at this client's base URL ends the
   * iteration rather than being followed.
   */
  async *pages<P extends Page>(path: string, query?: Query): AsyncGenerator<P, void, void> {
    let url: string | undefined = this.url(path, query);
    for (let count = 0; url; count++) {
      if (count >= this.maxPages) {
        throw new OnetApiError(`More than ${this.maxPages} pages for ${path}; raise maxPages or narrow the request`, 0, url, null);
      }
      const page: P = await this.getUrl<P>(url);
      yield page;
      const next: string | undefined = typeof page.next === 'string' ? page.next : undefined;
      url = next && next.startsWith(this.baseUrl + '/') ? next : undefined;
    }
  }

  // ---- My Next Move -------------------------------------------------------

  /** Keyword search over My Next Move careers (`/mnm/search`). Closest match first; 20 per page by default. */
  async search(keyword: string, options: { start?: number; end?: number } = {}): Promise<SearchPage> {
    if (!keyword.trim()) throw new TypeError('search keyword must not be empty');
    return this.get<SearchPage>('mnm/search', { keyword, start: options.start, end: options.end });
  }

  /** The top search hit for a title, or null when nothing matched. */
  async resolveCode(title: string): Promise<Career | null> {
    const page = await this.search(title, { end: 1 });
    return page.career[0] ?? null;
  }

  /** Outlook category, Bright Outlook categories and BLS salary figures (`/mnm/careers/{code}/job_outlook`). */
  async careerOutlook(code: string): Promise<JobOutlook> {
    return this.get<JobOutlook>(`mnm/careers/${assertOnetCode(code)}/job_outlook`);
  }

  /** Any other My Next Move career report (`knowledge`, `skills`, `abilities`, `personality`, `technology`, `education`, `check_out_my_state`, `explore_more`), untyped. */
  async careerReport<T = unknown>(code: string, resource: string): Promise<T> {
    return this.get<T>(`mnm/careers/${assertOnetCode(code)}/${encodeURIComponent(resource)}`);
  }

  // ---- O*NET OnLine -------------------------------------------------------

  /** Occupation overview (`/online/occupations/{code}/`): title, description, Bright Outlook categories, report links. */
  async occupation(code: string): Promise<Occupation> {
    return this.get<Occupation>(`online/occupations/${assertOnetCode(code)}/`);
  }

  /** Job Zone 1 to 5 with its education, experience and training text. */
  async jobZone(code: string): Promise<JobZone> {
    return this.get<JobZone>(`online/occupations/${assertOnetCode(code)}/summary/job_zone`);
  }

  /** Any summary report, untyped (`/online/occupations/{code}/summary/{resource}`). */
  async summary<T = unknown>(code: string, resource: string): Promise<T> {
    return this.get<T>(`online/occupations/${assertOnetCode(code)}/summary/${encodeURIComponent(resource)}`);
  }

  /**
   * A details report's elements (`/online/occupations/{code}/details/{resource}`),
   * all pages collected unless `all: false`.
   */
  async details(code: string, resource: DetailsResource | string, options: DetailsOptions = {}): Promise<DetailElement[]> {
    const path = `online/occupations/${assertOnetCode(code)}/details/${encodeURIComponent(resource)}`;
    const query: Query = { sort: options.sort, start: options.start ?? 1, end: options.end ?? 500 };
    const elements: DetailElement[] = [];
    for await (const page of this.pages<DetailsPage>(path, query)) {
      elements.push(...(page.element ?? []));
      if (options.all === false) break;
    }
    return elements;
  }

  skills(code: string): Promise<DetailElement[]> { return this.details(code, 'skills'); }
  knowledge(code: string): Promise<DetailElement[]> { return this.details(code, 'knowledge'); }
  abilities(code: string): Promise<DetailElement[]> { return this.details(code, 'abilities'); }
  workActivities(code: string): Promise<DetailElement[]> { return this.details(code, 'work_activities'); }
  workStyles(code: string): Promise<DetailElement[]> { return this.details(code, 'work_styles'); }
  workContext(code: string): Promise<DetailElement[]> { return this.details(code, 'work_context'); }

  /** RIASEC scores and Holland code from the interests details report. */
  async interests(code: string): Promise<OccupationInterests> {
    const elements = await this.details(code, 'interests');
    const scores = riasecFromInterestElements(elements);
    return { scores, hollandCode: scores ? hollandCodeFromScores(scores) : null, elements };
  }

  /**
   * The occupation overview plus job zone, outlook and interests fetched in
   * parallel. The overview is required (its error throws); the other three
   * degrade to null with their error recorded in `errors`, since a missing
   * wage row is not a reason to lose the occupation.
   */
  async occupationSummary(code: string): Promise<OccupationSummary> {
    const valid = assertOnetCode(code);
    const [occupation, jobZone, outlook, interests] = await Promise.all([
      this.occupation(valid),
      this.jobZone(valid).then((v) => ({ v, e: null as Error | null }), (e: Error) => ({ v: null, e })),
      this.careerOutlook(valid).then((v) => ({ v, e: null as Error | null }), (e: Error) => ({ v: null, e })),
      this.interests(valid).then((v) => ({ v, e: null as Error | null }), (e: Error) => ({ v: null, e })),
    ]);
    const errors: OccupationSummary['errors'] = {};
    if (jobZone.e) errors.jobZone = jobZone.e;
    if (outlook.e) errors.outlook = outlook.e;
    if (interests.e) errors.interests = interests.e;
    return { occupation, jobZone: jobZone.v, outlook: outlook.v, interests: interests.v, errors };
  }

  // ---- Interest Profiler --------------------------------------------------

  /**
   * The Interest Profiler question set: the 60-item form or the 30-item
   * Mini-IP, followed through pagination. Throws if the service returns a
   * different number of questions than the form declares, since a partial
   * set cannot be scored.
   */
  async interestProfilerQuestions(form: InterestProfilerForm = 60): Promise<InterestProfilerQuestionSet> {
    const path = form === 30 ? 'mnm/interestprofiler/questions_30' : 'mnm/interestprofiler/questions';
    const questions: InterestProfilerQuestion[] = [];
    let answerOptions: InterestProfilerAnswerOption[] = [];
    for await (const page of this.pages<RawQuestionPage>(path, { start: 1, end: form })) {
      if (!Array.isArray(page.question) || !Array.isArray(page.answer_option)) {
        throw new OnetApiError(`Malformed Interest Profiler page from ${path}`, 0, this.url(path), page);
      }
      answerOptions = page.answer_option.map((o) => ({ value: o.value, name: o.name }));
      for (const q of page.question) {
        questions.push({ index: q.index, area: q.area as RiasecArea, text: q.text });
      }
    }
    if (questions.length !== form) {
      throw new OnetApiError(`Expected ${form} Interest Profiler questions, got ${questions.length}`, 0, this.url(path), null);
    }
    return { form, questions, answerOptions, itemSetVersion: computeItemSetVersion(questions) };
  }

  /**
   * Score a completed answer set with O*NET's hosted scorer
   * (`/mnm/interestprofiler/results`). `answers` is positional (answers[0] is
   * question 1) or the digit string itself; `form` says which form it came
   * from, and the length is checked against it before anything is sent.
   */
  async interestProfilerResults(answers: readonly number[] | string, form: InterestProfilerForm = 60): Promise<InterestProfilerResult> {
    const answerString = answersToString(answers, form);
    const raw = await this.get<RawResults>('mnm/interestprofiler/results', { answers: answerString });
    if (!Array.isArray(raw.result)) {
      throw new OnetApiError('Malformed Interest Profiler results: no result list', 0, this.url('mnm/interestprofiler/results'), raw);
    }
    const result: InterestProfilerAreaResult[] = raw.result.map((r) => {
      const item: InterestProfilerAreaResult = {
        code: r.code as RiasecArea,
        title: r.title ?? '',
        description: r.description ?? '',
        score: r.score,
      };
      if (r.href) item.href = r.href;
      return item;
    });
    const scores = {} as Record<RiasecArea, number>;
    for (const area of RIASEC_AREAS) {
      const hit = result.find((r) => r.code === area);
      if (!hit || typeof hit.score !== 'number') {
        throw new OnetApiError(`Malformed Interest Profiler results: no score for ${area}`, 0, this.url('mnm/interestprofiler/results'), raw);
      }
      scores[area] = hit.score;
    }
    const out: InterestProfilerResult = { scores, result };
    if (typeof raw.careers === 'string') out.careers = raw.careers;
    return out;
  }
}
