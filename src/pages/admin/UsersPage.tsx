import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { assertUpdated } from '@/lib/safeUpdate';
import { useAuth } from '@/features/auth/hooks/useAuth';

/*
 * Users, every account on the platform, searchable, with admin management.
 * Admins can see full profiles (RLS allows it); granting or revoking admin
 * writes profiles.is_admin, which the database only lets admins touch.
 */

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_admin: boolean;
  avatar_url: string | null;
  country: string | null;
  created_at: string;
  mentor: { status: string } | null;
}

const PAGE = 25;

export default function UsersPage() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE);

  const { data: users = [], isLoading } = useQuery({
    queryKey: qk.admin('users'),
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, is_admin, avatar_url, country, created_at, mentor:mentor_profiles!mentor_profiles_user_id_fkey(status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // The one-to-one mentor join arrives array-shaped through PostgREST.
      return (data ?? []).map((u: Record<string, unknown>) => ({
        ...u,
        mentor: Array.isArray(u.mentor) ? (u.mentor[0] ?? null) : u.mentor,
      })) as UserRow[];
    },
  });

  // Deleting an account removes the auth.users row, which cascades to their
  // profile, applications, requests and files. Irreversible, hence two prompts.
  const deleteUser = useMutation({
    mutationFn: async (u: UserRow) => {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: u.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('users') }),
  });

  const setAdmin = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      await assertUpdated(
        supabase.from('profiles').update({ is_admin: value }).eq('id', id).select('id'),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin('users') }),
  });

  if (isLoading) return <PageSpinner />;

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? users.filter(u =>
        [u.first_name, u.last_name, u.email, u.country ?? '']
          .join(' ').toLowerCase().includes(needle))
    : users;
  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">Users</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {users.length} account{users.length === 1 ? '' : 's'} total
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE); }}
          placeholder="Search name, email, or country…"
          className="!w-72 !py-2.5 !text-sm"
        />
      </div>

      <div className="mt-5 space-y-2">
        {visible.map(u => {
          const isSelf = u.id === userId;
          return (
            <article key={u.id} className="card flex flex-wrap items-center gap-3 p-4">
              {u.avatar_url ? (
                <img referrerPolicy="no-referrer" src={u.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-xs font-black text-white">
                  {u.first_name.charAt(0) || '?'}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-bold text-ink">
                    {u.first_name} {u.last_name}{isSelf && ' (you)'}
                  </p>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    u.role === 'mentor' ? 'bg-navy-light text-navy' : 'bg-surface-muted text-ink-muted',
                  )}>
                    {u.role}
                  </span>
                  {u.mentor?.status === 'pending' && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      mentor application pending
                    </span>
                  )}
                  {u.is_admin && (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold text-gold-dark">
                      admin
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-ink-muted">
                  {u.email}
                  {u.country ? ` · ${u.country}` : ''}
                  {' · joined '}{new Date(u.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Admin management: never against your own account */}
              {!isSelf && (
                <>
                  <Button size="sm" variant="secondary" disabled={setAdmin.isPending}
                    onClick={() => {
                      const granting = !u.is_admin;
                      if (confirm(granting
                        ? `Make ${u.first_name} an admin? They will see everything admins see.`
                        : `Remove admin access from ${u.first_name}?`))
                        setAdmin.mutate({ id: u.id, value: granting });
                    }}>
                    {u.is_admin ? 'Remove admin' : 'Make admin'}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={deleteUser.isPending}
                    className="!text-red-600 hover:!bg-red-50"
                    onClick={() => {
                      if (!confirm(`Delete ${u.first_name} ${u.last_name}'s account?\n\nThis erases their applications, requests, and uploaded documents. It cannot be undone.`)) return;
                      if (!confirm('Last check, permanently delete this account?')) return;
                      deleteUser.mutate(u);
                    }}>
                    Delete
                  </Button>
                </>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-surface-border bg-white p-8 text-center text-sm text-ink-muted">
            No users match that search.
          </p>
        )}
      </div>

      {filtered.length > visibleCount && (
        <div className="mt-5 text-center">
          <Button variant="secondary" onClick={() => setVisibleCount(c => c + PAGE)}>
            Load more ({filtered.length - visibleCount} remaining)
          </Button>
        </div>
      )}
      {(setAdmin.isError || deleteUser.isError) && (
        <p className="mt-3 text-xs text-red-600">
          {((setAdmin.error ?? deleteUser.error) as Error).message}
        </p>
      )}
    </div>
  );
}
