import { cn } from '@/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn(
      'h-7 w-7 animate-spin rounded-full border-2 border-surface-muted border-t-navy',
      className,
    )} />
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
