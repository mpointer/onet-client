import { describe, it, expect, vi } from 'vitest';
import { OnetClient, OnetApiError, InvalidOnetCodeError, ONET_API_BASE } from '../src/index.js';
import { client, json } from './helpers.js';

const BASE = ONET_API_BASE;

describe('request basics', () => {
  it('requires an API key', () => {
    expect(() => new OnetClient({ apiKey: '' })).toThrow(TypeError);
  });

  it('sends X-API-Key and Accept on a GET, never the key in the query', async () => {
    const { client: c, calls } = client({ '/online/occupations/17-2051.00/': () => json({ code: '17-2051.00', title: 'Civil Engineers', description: 'd', tags: {} }) });
    await c.occupation('17-2051.00');
    expect(calls).toHaveLength(1);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('test-key');
    expect(headers['Accept']).toBe('application/json');
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.url.search).toBe('');
    expect(calls[0]!.url.origin).toBe(BASE);
  });

  it('sends User-Agent when configured and a timeout signal by default', async () => {
    const { client: c, calls } = client({ '/mnm/search': () => json({ start: 1, end: 1, total: 1, career: [] }) }, { userAgent: 'my-app/1.0' });
    await c.search('welder');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('my-app/1.0');
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws OnetApiError with the service message on a 422', async () => {
    const { client: c } = client({ '/mnm/search': () => json({ error: "must have required property 'keyword'" }, 422) });
    const err = await c.get('mnm/search').catch((e) => e);
    expect(err).toBeInstanceOf(OnetApiError);
    expect((err as OnetApiError).status).toBe(422);
    expect((err as OnetApiError).message).toContain("must have required property 'keyword'");
    expect((err as OnetApiError).body).toEqual({ error: "must have required property 'keyword'" });
  });

  it('throws OnetApiError with the raw text when the error body is not JSON', async () => {
    const { client: c } = client({ '/online/occupations/99-9999.99/': () => new Response('Not Found', { status: 404 }) });
    const err = await c.occupation('99-9999.99').catch((e) => e);
    expect(err).toBeInstanceOf(OnetApiError);
    expect((err as OnetApiError).status).toBe(404);
    expect((err as OnetApiError).body).toBe('Not Found');
  });

  it('retries a 429 once after the documented delay, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const { client: c, calls } = client({
        '/online/occupations/17-2051.00/summary/job_zone': () => (n++ === 0 ? new Response('', { status: 429 }) : json({ code: 4, title: 'Job Zone Four' })),
      });
      const p = c.jobZone('17-2051.00');
      await vi.advanceTimersByTimeAsync(199);
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      const zone = await p;
      expect(zone.code).toBe(4);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up on a second 429 and surfaces it', async () => {
    vi.useFakeTimers();
    try {
      const { client: c, calls } = client({ '/online/occupations/17-2051.00/summary/job_zone': () => new Response('', { status: 429 }) });
      const p = c.jobZone('17-2051.00').catch((e) => e);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await p;
      expect(err).toBeInstanceOf(OnetApiError);
      expect((err as OnetApiError).status).toBe(429);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never lowers the 429 delay below the service minimum', () => {
    const c = new OnetClient({ apiKey: 'k', rateLimitDelayMs: 5 });
    expect((c as unknown as { rateLimitDelayMs: number }).rateLimitDelayMs).toBe(200);
  });

  it('url() drops undefined query values and tolerates a leading slash', () => {
    const c = new OnetClient({ apiKey: 'k' });
    expect(c.url('/mnm/search', { keyword: 'a b', start: undefined, end: 5 })).toBe(`${BASE}/mnm/search?keyword=a+b&end=5`);
  });
});

describe('code validation', () => {
  it.each(['../../ws/database/rows', '17-2051', '17-2051.0', 'not a code', ''])('refuses %j as a path parameter before any request', async (bad) => {
    const { client: c, calls } = client({});
    await expect(c.occupation(bad)).rejects.toBeInstanceOf(InvalidOnetCodeError);
    await expect(c.jobZone(bad)).rejects.toBeInstanceOf(InvalidOnetCodeError);
    await expect(c.careerOutlook(bad)).rejects.toBeInstanceOf(InvalidOnetCodeError);
    await expect(c.details(bad, 'skills')).rejects.toBeInstanceOf(InvalidOnetCodeError);
    expect(calls).toHaveLength(0);
  });

  it('trims surrounding whitespace off a code', async () => {
    const { client: c, calls } = client({ '/online/occupations/17-2051.00/': () => json({ code: '17-2051.00', title: 't', description: '', tags: {} }) });
    await c.occupation(' 17-2051.00 ');
    expect(calls[0]!.url.pathname).toBe('/online/occupations/17-2051.00/');
  });
});

describe('My Next Move', () => {
  const searchPage = {
    start: 1, end: 2, total: 61,
    next: `${BASE}/mnm/search?keyword=architect&start=3&end=4`,
    career: [
      { href: `${BASE}/mnm/careers/17-1011.00/`, code: '17-1011.00', title: 'Architects', tags: { bright_outlook: true } },
      { href: `${BASE}/mnm/careers/17-1012.00/`, code: '17-1012.00', title: 'Landscape Architects', tags: {} },
    ],
  };

  it('search passes keyword, start and end and returns the page', async () => {
    const { client: c, calls } = client({ '/mnm/search': () => json(searchPage) });
    const page = await c.search('architect', { start: 1, end: 2 });
    expect(calls[0]!.url.searchParams.get('keyword')).toBe('architect');
    expect(calls[0]!.url.searchParams.get('end')).toBe('2');
    expect(page.total).toBe(61);
    expect(page.career[0]!.code).toBe('17-1011.00');
  });

  it('search refuses an empty keyword', async () => {
    const { client: c } = client({});
    await expect(c.search('   ')).rejects.toThrow(TypeError);
  });

  it('resolveCode asks for one hit and returns it, or null', async () => {
    const { client: c, calls } = client({ '/mnm/search': (u) => json(u.searchParams.get('keyword') === 'zzzz' ? { start: 1, end: 0, total: 0, career: [] } : searchPage) });
    expect(await c.resolveCode('architect')).toMatchObject({ code: '17-1011.00', title: 'Architects' });
    expect(calls[0]!.url.searchParams.get('end')).toBe('1');
    expect(await c.resolveCode('zzzz')).toBeNull();
  });

  it('careerOutlook returns outlook, bright outlook categories and salary', async () => {
    const body = {
      outlook: { category: 'Bright', description: 'New job opportunities are very likely in the future.' },
      bright_outlook: [{ href: `${BASE}/mnm/bright_outlook/grow`, code: 'grow', title: 'Grow Rapidly' }],
      salary: { soc_code: '49-9021', annual_10th_percentile: 37720, annual_median: 59810, annual_90th_percentile: 94600 },
    };
    const { client: c } = client({ '/mnm/careers/49-9021.00/job_outlook': () => json(body) });
    const outlook = await c.careerOutlook('49-9021.00');
    expect(outlook.outlook.category).toBe('Bright');
    expect(outlook.bright_outlook?.[0]?.code).toBe('grow');
    expect(outlook.salary.annual_median).toBe(59810);
  });

  it('careerReport reaches any other mnm section', async () => {
    const { client: c, calls } = client({ '/mnm/careers/49-9021.00/technology': () => json({ category: [] }) });
    await c.careerReport('49-9021.00', 'technology');
    expect(calls[0]!.url.pathname).toBe('/mnm/careers/49-9021.00/technology');
  });
});

describe('O*NET OnLine reports', () => {
  it('occupation returns the overview including bright_outlook from the record itself', async () => {
    const { client: c } = client({
      '/online/occupations/17-2051.00/': () => json({
        code: '17-2051.00', title: 'Civil Engineers', description: 'Perform engineering duties...', tags: { bright_outlook: true },
        bright_outlook: [{ code: 'grow', title: 'Grow Rapidly' }],
        summary_contents: [{ href: `${BASE}/online/occupations/17-2051.00/summary/job_zone`, title: 'Job Zone' }],
      }),
    });
    const occ = await c.occupation('17-2051.00');
    expect(occ.title).toBe('Civil Engineers');
    expect(occ.bright_outlook?.map((b) => b.code)).toEqual(['grow']);
  });

  it('summary reaches any summary resource', async () => {
    const { client: c, calls } = client({ '/online/occupations/17-2051.00/summary/interests': () => json({ interest_code: 'RIC', element: [] }) });
    const r = await c.summary<{ interest_code: string }>('17-2051.00', 'interests');
    expect(r.interest_code).toBe('RIC');
    expect(calls[0]!.url.pathname).toBe('/online/occupations/17-2051.00/summary/interests');
  });

  it('details asks for one big page and collects every page the service still splits', async () => {
    const page1 = {
      start: 1, end: 2, total: 3,
      next: `${BASE}/online/occupations/17-2051.00/details/skills?start=3&end=4`,
      element: [
        { id: '2.A.1.b', name: 'Active Listening', description: '...', importance: 75 },
        { id: '2.B.2.i', name: 'Complex Problem Solving', description: '...', importance: 72 },
      ],
    };
    const page2 = { start: 3, end: 3, total: 3, prev: `${BASE}/online/occupations/17-2051.00/details/skills?start=1&end=2`, element: [{ id: '2.A.1.a', name: 'Reading Comprehension', importance: 72 }] };
    const { client: c, calls } = client({
      '/online/occupations/17-2051.00/details/skills': (u) => json(u.searchParams.get('start') === '3' ? page2 : page1),
    });
    const skills = await c.skills('17-2051.00');
    expect(skills.map((s) => s.name)).toEqual(['Active Listening', 'Complex Problem Solving', 'Reading Comprehension']);
    expect(calls[0]!.url.searchParams.get('start')).toBe('1');
    expect(calls[0]!.url.searchParams.get('end')).toBe('500');
    expect(calls[1]!.url.searchParams.get('start')).toBe('3');
  });

  it('details with all: false returns the first page only', async () => {
    const page1 = { start: 1, end: 1, total: 2, next: `${BASE}/online/occupations/17-2051.00/details/skills?start=2&end=2`, element: [{ id: 'a', name: 'A' }] };
    const { client: c, calls } = client({ '/online/occupations/17-2051.00/details/skills': () => json(page1) });
    const skills = await c.details('17-2051.00', 'skills', { all: false, end: 1 });
    expect(skills).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('does not follow a next link that leaves the configured base, and throws rather than return a partial report', async () => {
    const page1 = { start: 1, end: 1, total: 2, next: 'https://evil.example/online/occupations/17-2051.00/details/skills?start=2', element: [{ id: 'a', name: 'A' }] };
    const { client: c, calls } = client({ '/online/occupations/17-2051.00/details/skills': () => json(page1) });
    await expect(c.skills('17-2051.00')).rejects.toThrow(/stopped at 1 of 2/);
    expect(calls).toHaveLength(1);
  });

  it('rejects a resource name that is not a plain word, before any request', async () => {
    const { client: c, calls } = client({});
    await expect(c.summary('17-2051.00', '..')).rejects.toThrow(TypeError);
    await expect(c.careerReport('17-2051.00', '.')).rejects.toThrow(TypeError);
    await expect(c.details('17-2051.00', 'skills/../x')).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it('throws OnetApiError when a 200 body is not JSON', async () => {
    const { client: c } = client({ '/online/occupations/17-2051.00/': () => new Response('<html>portal</html>', { status: 200 }) });
    await expect(c.occupation('17-2051.00')).rejects.toBeInstanceOf(OnetApiError);
  });

  it('stops a self-referential next chain at maxPages instead of looping', async () => {
    const page = { start: 1, end: 1, total: 99, next: `${BASE}/online/occupations/17-2051.00/details/skills?start=1&end=1`, element: [{ id: 'a', name: 'A' }] };
    const { client: c } = client({ '/online/occupations/17-2051.00/details/skills': () => json(page) }, { maxPages: 3 });
    await expect(c.skills('17-2051.00')).rejects.toThrow(/More than 3 pages/);
  });

  it('work_context elements carry context instead of importance', async () => {
    const { client: c } = client({
      '/online/occupations/17-2051.00/details/work_context': () => json({
        start: 1, end: 1, total: 1,
        element: [{ id: '4.C.1.a.2.l', name: 'E-Mail', description: 'How often do you use electronic mail in this job?', context: 100, response: [{ percentage_of_respondents: 100, description: 'Every day' }] }],
      }),
    });
    const [el] = await c.workContext('17-2051.00');
    expect(el?.context).toBe(100);
    expect(el?.importance).toBeUndefined();
    expect(el?.response?.[0]?.description).toBe('Every day');
  });

  it('interests derives RIASEC scores and a Holland code from occupational_interest', async () => {
    const { client: c } = client({
      '/online/occupations/17-2051.00/details/interests': () => json({
        start: 1, end: 6, total: 6,
        element: [
          { id: '1.B.1.a', name: 'Realistic', occupational_interest: 91 },
          { id: '1.B.1.b', name: 'Investigative', occupational_interest: 69 },
          { id: '1.B.1.f', name: 'Conventional', occupational_interest: 55 },
          { id: '1.B.1.e', name: 'Enterprising', occupational_interest: 40 },
          { id: '1.B.1.d', name: 'Social', occupational_interest: 20 },
          { id: '1.B.1.c', name: 'Artistic', occupational_interest: 10 },
        ],
      }),
    });
    const r = await c.interests('17-2051.00');
    expect(r.scores).toEqual({ R: 91, I: 69, A: 10, S: 20, E: 40, C: 55 });
    expect(r.hollandCode).toBe('RIC');
    expect(r.elements).toHaveLength(6);
  });

  it('interests reports null scores when an area is missing rather than guessing', async () => {
    const { client: c } = client({
      '/online/occupations/17-2051.00/details/interests': () => json({ start: 1, end: 2, total: 2, element: [{ id: '1.B.1.a', name: 'Realistic', occupational_interest: 91 }, { id: '1.B.1.b', name: 'Investigative', occupational_interest: 69 }] }),
    });
    const r = await c.interests('17-2051.00');
    expect(r.scores).toBeNull();
    expect(r.hollandCode).toBeNull();
    expect(r.elements).toHaveLength(2);
  });
});

describe('occupationSummary', () => {
  const occ = { code: '17-2051.00', title: 'Civil Engineers', description: 'd', tags: {} };

  it('fetches the four reports in parallel and degrades the optional ones to null', async () => {
    const { client: c, calls } = client({
      '/online/occupations/17-2051.00/': () => json(occ),
      '/online/occupations/17-2051.00/summary/job_zone': () => json({ code: 4, title: 'Job Zone Four' }),
      '/mnm/careers/17-2051.00/job_outlook': () => json({ error: 'no data' }, 422),
      '/online/occupations/17-2051.00/details/interests': () => json({ start: 1, end: 0, total: 0, element: [] }),
    });
    const s = await c.occupationSummary('17-2051.00');
    expect(s.occupation.title).toBe('Civil Engineers');
    expect(s.jobZone?.code).toBe(4);
    expect(s.outlook).toBeNull();
    expect(s.errors.outlook).toBeInstanceOf(OnetApiError);
    expect(s.interests?.scores).toBeNull();
    expect(s.errors.interests).toBeUndefined();
    expect(calls).toHaveLength(4);
  });

  it('throws when the occupation itself is unknown', async () => {
    const { client: c } = client({
      '/online/occupations/99-9999.00/': () => json({ error: 'unknown code' }, 422),
      '/online/occupations/99-9999.00/summary/job_zone': () => json({ code: 1 }),
      '/mnm/careers/99-9999.00/job_outlook': () => json({ outlook: {}, salary: {} }),
      '/online/occupations/99-9999.00/details/interests': () => json({ element: [] }),
    });
    await expect(c.occupationSummary('99-9999.00')).rejects.toBeInstanceOf(OnetApiError);
  });
});

describe('Interest Profiler', () => {
  const q = (index: number, area = 'realistic') => ({ index, area, text: `Question ${index}` });
  const options = [{ value: 1, name: 'Strongly Dislike' }, { value: 2, name: 'Dislike' }, { value: 3, name: 'Unsure' }, { value: 4, name: 'Like' }, { value: 5, name: 'Strongly Like' }];

  it('follows pagination for the 30-item form and checks the count', async () => {
    const { client: c, calls } = client({
      '/mnm/interestprofiler/questions_30': (u) => {
        const start = Number(u.searchParams.get('start') ?? '1');
        if (start === 1) {
          return json({ start: 1, end: 12, total: 30, next: `${BASE}/mnm/interestprofiler/questions_30?start=13&end=24`, answer_option: options, question: Array.from({ length: 12 }, (_, i) => q(i + 1)) });
        }
        if (start === 13) {
          return json({ start: 13, end: 24, total: 30, next: `${BASE}/mnm/interestprofiler/questions_30?start=25&end=30`, answer_option: options, question: Array.from({ length: 12 }, (_, i) => q(i + 13)) });
        }
        return json({ start: 25, end: 30, total: 30, answer_option: options, question: Array.from({ length: 6 }, (_, i) => q(i + 25, 'artistic')) });
      },
    });
    const set = await c.interestProfilerQuestions(30);
    expect(set.form).toBe(30);
    expect(set.questions).toHaveLength(30);
    expect(set.questions[29]).toEqual({ index: 30, area: 'artistic', text: 'Question 30' });
    expect(set.answerOptions).toHaveLength(5);
    expect(set.itemSetVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(calls[0]!.url.searchParams.get('end')).toBe('30');
  });

  it('uses the 60-item path by default', async () => {
    const { client: c, calls } = client({
      '/mnm/interestprofiler/questions': () => json({ start: 1, end: 60, total: 60, answer_option: options, question: Array.from({ length: 60 }, (_, i) => q(i + 1)) }),
    });
    const set = await c.interestProfilerQuestions();
    expect(set.form).toBe(60);
    expect(calls[0]!.url.pathname).toBe('/mnm/interestprofiler/questions');
  });

  it('throws rather than returning a partial question set', async () => {
    const { client: c } = client({
      '/mnm/interestprofiler/questions_30': () => json({ start: 1, end: 12, total: 30, answer_option: options, question: Array.from({ length: 12 }, (_, i) => q(i + 1)) }),
    });
    await expect(c.interestProfilerQuestions(30)).rejects.toThrow(/Expected 30/);
  });

  it('throws on a malformed page', async () => {
    const { client: c } = client({ '/mnm/interestprofiler/questions_30': () => json({ start: 1, end: 30, total: 30, question: 'nope' }) });
    await expect(c.interestProfilerQuestions(30)).rejects.toThrow(/Malformed/);
  });

  it('scores a positional answer array through the hosted scorer', async () => {
    const results = {
      careers: `${BASE}/mnm/interestprofiler/careers?realistic=27&investigative=13&artistic=23&social=25&enterprising=14&conventional=14`,
      result: [
        { href: `${BASE}/mnm/interestprofiler/interests/realistic`, code: 'realistic', title: 'Realistic', description: 'r', score: 27 },
        { code: 'investigative', title: 'Investigative', description: 'i', score: 13 },
        { code: 'artistic', title: 'Artistic', description: 'a', score: 23 },
        { code: 'social', title: 'Social', description: 's', score: 25 },
        { code: 'enterprising', title: 'Enterprising', description: 'e', score: 14 },
        { code: 'conventional', title: 'Conventional', description: 'c', score: 14 },
      ],
    };
    const { client: c, calls } = client({ '/mnm/interestprofiler/results': () => json(results) });
    const answers = Array.from({ length: 30 }, (_, i) => (i % 5) + 1);
    const r = await c.interestProfilerResults(answers, 30);
    expect(calls[0]!.url.searchParams.get('answers')).toBe(answers.join(''));
    expect(r.scores).toEqual({ realistic: 27, investigative: 13, artistic: 23, social: 25, enterprising: 14, conventional: 14 });
    expect(r.careers).toContain('realistic=27');
    expect(r.result[0]?.href).toContain('/interests/realistic');
  });

  it('rejects a wrong-length or out-of-range answer set before any request', async () => {
    const { client: c, calls } = client({});
    await expect(c.interestProfilerResults([1, 2, 3], 30)).rejects.toThrow(/exactly 30/);
    await expect(c.interestProfilerResults(Array(30).fill(6), 30)).rejects.toThrow(/1 to 5/);
    await expect(c.interestProfilerResults('1'.repeat(30), 60)).rejects.toThrow(/exactly 60/);
    expect(calls).toHaveLength(0);
  });

  it('throws when the scorer omits an area rather than returning a partial score', async () => {
    const { client: c } = client({ '/mnm/interestprofiler/results': () => json({ result: [{ code: 'realistic', score: 12 }] }) });
    await expect(c.interestProfilerResults('3'.repeat(30), 30)).rejects.toThrow(/no score for investigative/);
  });
});
