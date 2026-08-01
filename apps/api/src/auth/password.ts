/**
 * Password hashing.
 *
 * `scrypt` from `node:crypto` rather than bcrypt or argon2: both of those are native
 * addons, and this repo has consistently preferred the standard library where it is
 * genuinely adequate (see the hand-written ZIP writer for the same call). scrypt is a
 * memory-hard KDF and an accepted choice; what matters far more than the family is that
 * the parameters are real, the salt is per-password, and the comparison is constant-time.
 *
 * Parameters are stored *inside* each hash, so they can be raised later without
 * invalidating existing passwords — an old hash keeps verifying with its own cost, and
 * `needsRehash` says when to quietly upgrade it on the next successful login.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * `promisify` collapses scrypt's overloads and drops the options argument, so the
 * parameters below would be silently ignored — the hash would still succeed, just at
 * Node's defaults. Wrapping it by hand keeps the cost settings load-bearing.
 */
const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived),
    );
  });

/**
 * N = 2^15 costs roughly 32 MB and ~100 ms per hash.
 *
 * OWASP would prefer 2^17. That is 128 MB *per concurrent login*, which on the 1 GiB
 * free-tier container this is meant to run on turns a handful of simultaneous sign-ins
 * into an OOM — a denial of service dressed up as diligence. 2^15 with a rate limit on
 * the login route is the better trade here; raise `SCRYPT_COST` if you deploy somewhere
 * with room, and existing hashes will upgrade themselves as people sign in.
 */
const DEFAULT_COST = 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

const cost = (): number => {
  const raw = Number(process.env.SCRYPT_COST);
  return Number.isInteger(raw) && raw >= 12 && raw <= 20 ? raw : DEFAULT_COST;
};

/** `scrypt$N$r$p$salt$key`, all base64url. Self-describing so cost can change over time. */
export async function hashPassword(password: string, costOverride?: number): Promise<string> {
  const n = 2 ** (costOverride ?? cost());
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: n,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    // Node's default maxmem (32 MB) is *just* under what N=2^15 needs, so without this
    // the hash throws rather than running slowly — an obscure failure at the worst moment.
    maxmem: 256 * 1024 * 1024,
  });
  return [
    "scrypt",
    n,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, key] = parts;
  const parsed = {
    n: Number(n),
    r: Number(r),
    p: Number(p),
    salt: Buffer.from(salt!, "base64url"),
    key: Buffer.from(key!, "base64url"),
  };
  if (!Number.isInteger(parsed.n) || !Number.isInteger(parsed.r) || !Number.isInteger(parsed.p)) return null;
  if (parsed.salt.length === 0 || parsed.key.length === 0) return null;
  return parsed;
}

/**
 * Verify a password against a stored hash. Never throws on a malformed hash — a corrupted
 * row should read as "wrong password", not as a 500 that tells an attacker the row exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const key = await scrypt(password.normalize("NFKC"), parsed.salt, parsed.key.length, {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
      maxmem: 256 * 1024 * 1024,
    });
    // Constant-time: a byte-by-byte early exit leaks how much of the key was right.
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  } catch {
    return false;
  }
}

/** True when `stored` was made with a weaker cost than we now use. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.n < 2 ** cost() || parsed.r !== BLOCK_SIZE || parsed.p !== PARALLELISM;
}

/**
 * A throwaway hash to verify against when the email is unknown.
 *
 * Without it, "no such user" returns in a millisecond while "wrong password" takes ~100 ms,
 * and that gap is a reliable oracle for which email addresses have accounts. Burning the
 * same work on a miss removes the signal.
 */
let dummyHash: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash.then((h) => verifyPassword(password, h));
}

/**
 * Password rules, kept deliberately short.
 *
 * Length is the only requirement that reliably correlates with strength; composition rules
 * ("one uppercase, one symbol") mostly produce `Password1!` and push people toward reuse.
 * The upper bound exists because scrypt's cost is paid on the server: without it, a
 * megabyte-long password is a free CPU-exhaustion request.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
