import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';


export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cloud px-6 pt-14 text-center">
      <p className="text-5xl font-black text-navy">404</p>
      <p className="mt-2 text-lg font-bold text-ink">This page doesn't exist.</p>
      <p className="mt-1 text-sm text-ink-muted">The link may be old, or the page may have moved.</p>
      <Link to="/home" className="mt-6">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
