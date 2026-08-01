import { useCallback, useEffect, useState } from 'react';
import { X, LogIn, UserPlus, LogOut, Loader2, User as UserIcon } from 'lucide-react';
import { useUiStore } from '../uiStore';
import { getAuthStatus, login, logout, register } from '../api/client';

type Mode = 'signIn' | 'register';

/**
 * Sign in, register, sign out.
 *
 * Accounts are additive here, never a gate. There is no login wall: an anonymous visitor
 * has always been able to design, save and share, and still can. Signing in exists to make
 * that work reachable from a second browser, and signing out returns to the anonymous
 * session rather than an empty screen.
 *
 * The thing worth getting right is the hand-off. Designs made before signing up move to
 * the account — the server does it on both register and login — and this panel says how
 * many moved, because silently absorbing someone's work is unnerving even when it's the
 * behaviour they wanted.
 */
export function AccountPanel() {
  const open = useUiStore((s) => s.accountOpen);
  const toggle = useUiStore((s) => s.toggleAccount);
  const account = useUiStore((s) => s.account);
  const setAccount = useUiStore((s) => s.setAccount);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getAuthStatus()
      .then((s) => live && setAvailable(s.available))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, [open]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const fn = mode === 'register' ? register : login;
        const { user, adoptedDesigns } = await fn(email, password);
        setAccount(user);
        setPassword('');
        setNotice(
          adoptedDesigns > 0
            ? `Signed in. ${adoptedDesigns} design${adoptedDesigns === 1 ? '' : 's'} you made here ${
                adoptedDesigns === 1 ? 'is' : 'are'
              } now saved to your account.`
            : 'Signed in.',
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [mode, email, password, setAccount],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await logout();
      setAccount(null);
      setNotice('Signed out. You can keep designing — this browser gets its own space again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  }, [setAccount]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={toggle}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            <UserIcon size={14} className="text-sky-300" />
            {account ? 'Your account' : mode === 'register' ? 'Create an account' : 'Sign in'}
          </h2>
          <button className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/90" onClick={toggle}>
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {available === false ? (
            <p className="text-[11px] leading-relaxed text-white/50">
              Accounts need a database. Set <code className="rounded bg-white/10 px-1">DATABASE_URL</code> on the
              API to enable them. Everything else works without one — your designs are saved to this browser.
            </p>
          ) : account ? (
            <>
              <p className="mb-3 text-sm text-white/70">
                Signed in as <span className="text-white">{account.email}</span>
              </p>
              <p className="mb-4 text-[11px] leading-relaxed text-white/40">
                Your designs follow this account, so they're reachable from any browser you sign in on.
              </p>
              <button
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/20 disabled:opacity-40"
                onClick={signOut}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Sign out
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label className="mb-1 block text-[11px] text-white/45" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-3 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-400/60"
              />

              <label className="mb-1 block text-[11px] text-white/45" htmlFor="account-password">
                Password
              </label>
              <input
                id="account-password"
                type="password"
                /* Tells a password manager which flow this is, so it offers to save on
                   registration and to fill on sign-in rather than guessing. */
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-400/60"
              />
              {mode === 'register' && (
                <p className="mt-1 text-[10px] text-white/35">At least 10 characters. Length beats punctuation.</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500/85 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : mode === 'register' ? (
                  <UserPlus size={14} />
                ) : (
                  <LogIn size={14} />
                )}
                {mode === 'register' ? 'Create account' : 'Sign in'}
              </button>

              <button
                type="button"
                className="mt-2 w-full text-[11px] text-white/45 hover:text-white/70"
                onClick={() => {
                  setMode(mode === 'register' ? 'signIn' : 'register');
                  setError(null);
                }}
              >
                {mode === 'register' ? 'Already have an account? Sign in' : 'No account yet? Create one'}
              </button>

              <p className="mt-3 text-[10px] leading-snug text-white/30">
                Designs you've already made in this browser move to your account when you sign in.
              </p>
            </form>
          )}

          {error && <p className="mt-3 rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">{error}</p>}
          {notice && <p className="mt-3 rounded bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-200">{notice}</p>}
        </div>
      </div>
    </div>
  );
}
