import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageSpinner } from '@/components/ui/Spinner';

/**
 * OAuth return handler. detectSessionInUrl stores the session; we redirect
 * when the auth event confirms it, no timers, no full page reloads.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) navigate('/home', { replace: true });
      if (event === 'SIGNED_OUT') navigate('/', { replace: true });
    });
    // Fallback for refreshes on this page when the session already exists.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/home', { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return <PageSpinner />;
}
