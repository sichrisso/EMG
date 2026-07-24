/**
 * Under Row Level Security an UPDATE/DELETE on rows the caller cannot touch
 * does not error, it silently matches zero rows. Every mutation in the app
 * chains `.select('id')` and passes through this assertion so a blocked
 * write surfaces as an error instead of a fake success.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgResult<T> = { data: T[] | null; error: { message: string } | null };

export async function assertUpdated<T>(q: PromiseLike<PgResult<T>>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('Change was blocked, please refresh and try again.');
  }
  return data;
}
