/**
 * O*NET-SOC code helpers.
 *
 * An O*NET-SOC detail code is `NN-NNNN.NN`: the 2018 SOC code plus a two
 * digit detail suffix (`.00` for the SOC occupation itself, `.01` onwards
 * for O*NET's finer splits). The Web Services reject anything else with a
 * 422, and every path parameter in this client is validated against this
 * shape before a request is built, so a value lifted from a request body
 * (`../../ws/database/rows`) can never walk out of the intended path with the
 * API key attached.
 */

/** A bare O*NET-SOC detail code, `NN-NNNN.NN`. */
export const ONET_CODE_RE = /^\d{2}-\d{4}\.\d{2}$/;

/** True when `value` is a well-formed O*NET-SOC detail code. Surrounding whitespace is not tolerated. */
export function isOnetCode(value: unknown): value is string {
  return typeof value === 'string' && ONET_CODE_RE.test(value);
}

export class InvalidOnetCodeError extends TypeError {
  constructor(public readonly value: unknown) {
    super(`Not an O*NET-SOC code (expected NN-NNNN.NN): ${JSON.stringify(value)}`);
    this.name = 'InvalidOnetCodeError';
  }
}

/**
 * Trim and validate a code for use as a path parameter. Whitespace is
 * trimmed first because the WHATWG URL parser silently strips tab, CR and
 * LF from a URL string, so an untrimmed code with a trailing newline used to
 * resolve fine until it was percent-encoded, after which it 404ed.
 */
export function assertOnetCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : value;
  if (!isOnetCode(code)) throw new InvalidOnetCodeError(value);
  return code;
}

/**
 * Map a 6-digit SOC code (`15-1252`, as BLS publishes it) to the O*NET-SOC
 * detail code that names the same occupation (`15-1252.00`). A value that
 * already carries a detail suffix passes through unchanged.
 *
 * This is the `.00` convention, not a fan-out: an occupation whose only
 * O*NET-SOC detail codes are `.01` and up (nurse practitioners, `29-1171.00`
 * exists but several SOC occupations do not have a `.00` row) will not match.
 * Use the official O*NET-SOC to SOC crosswalk when that matters.
 */
export function socToOnetCode(soc: string): string {
  const trimmed = soc.trim();
  if (/\.\d+$/.test(trimmed)) return trimmed;
  return `${trimmed}.00`;
}

/** The SOC part of an O*NET-SOC code: `15-1252.00` to `15-1252`. */
export function onetToSocCode(onetCode: string): string {
  return assertOnetCode(onetCode).slice(0, 7);
}

/**
 * Validate a report resource name for use as a path segment. Resource names
 * are lowercase words joined by underscores; `encodeURIComponent` leaves `.`
 * and `..` alone, and the URL parser would resolve those as dot segments.
 */
export function assertResource(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new TypeError(`Not a report resource name: ${JSON.stringify(value)}`);
  return value;
}
