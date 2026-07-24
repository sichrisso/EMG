import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  first_name: z.string().optional(),
  last_name:  z.string().optional(),
  email:      z.string().email('Enter a valid email'),
  password:   z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

/**
 * Single auth card: Google OAuth or email + password.
 * Sign-in is the default tab; sign-up is one click away. There is no email
 * verification wait, accounts are live immediately (compensated by CAPTCHA
 * and rate limits configured in the Supabase dashboard).
 */
export function EntryAuthCard() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Someone who clicked "Become a mentor" before signing in should land on the
  // application form afterwards, not on a generic dashboard.
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/home';
  const { register, handleSubmit, getValues, formState: { errors } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });
  const [notice, setNotice] = useState<string | null>(null);

  // "Forgot password?" sends Supabase's reset email to whatever address is in
  // the field, no separate screen needed for a launch-size product.
  const forgotPassword = async () => {
    setError(null);
    setNotice(null);
    const email = getValues('email');
    if (!email) { setError('Type your email above first, then tap Forgot password.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) setError(error.message);
    else setNotice(`Reset link sent to ${email}, check your inbox.`);
  };

  const signInWithGoogle = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  };

  const onSubmit = async (v: FormValues) => {
    setError(null);
    if (mode === 'signup' && !v.first_name?.trim()) {
      setError('Please tell us your first name.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: {
            data: {
              first_name: v.first_name?.trim() ?? '',
              last_name:  v.last_name?.trim() ?? '',
              role: 'mentee', // everyone starts as a student; mentors apply in-app
            },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: v.email,
          password: v.password,
        });
        if (error) throw error;
      }
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-3xl bg-white p-8 shadow-modal">
      {/* Cap emblem */}
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold-soft">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#334155"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 10 12 5 2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
          <path d="M22 10v6" />
        </svg>
      </div>
      <h1 className="mt-4 text-center text-2xl font-black text-ink">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-center text-sm text-ink-muted">
        {mode === "signin"
          ? "Pick up where you left off."
          : "Free. Takes 20 seconds."}
      </p>

      <Button
        onClick={signInWithGoogle}
        variant="secondary"
        className="mt-6 w-full"
      >
        <span className="flex items-center justify-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
            />
          </svg>
          Continue with Google
        </span>
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
        <div className="h-px flex-1 bg-surface-border" /> or with email{" "}
        <div className="h-px flex-1 bg-surface-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              {...register("first_name")}
              error={errors.first_name?.message}
            />
            <Input
              label="Last name"
              {...register("last_name")}
              error={errors.last_name?.message}
            />
          </div>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          {...register("email")}
          error={errors.email?.message}
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            className="!pr-11"
            {...register("password")}
            error={errors.password?.message}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-[34px] text-ink-subtle transition hover:text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {mode === "signin" && (
          <div className="flex items-center justify-between pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-surface-border accent-navy"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={forgotPassword}
              className="text-sm font-bold text-navy hover:underline"
            >
              Forgot password?
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && (
          <p className="text-sm font-semibold text-emerald-600">{notice}</p>
        )}
        <Button
          type="submit"
          disabled={busy}
          className="w-full !bg-gold  hover:!bg-gold-dark"
        >
          {busy
            ? "One moment…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>

      <button
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
          setNotice(null);
        }}
        className="mt-5 w-full text-center text-sm text-ink-muted"
      >
        {mode === "signin" ? (
          <>
            New here?{" "}
            <span className="font-bold text-navy hover:underline">
              Create an account
            </span>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <span className="font-bold text-navy hover:underline">
              Sign in
            </span>
          </>
        )}
      </button>
    </div>
  );
}
