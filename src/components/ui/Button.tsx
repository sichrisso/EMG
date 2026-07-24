import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, icon, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-bold transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30',
        size === 'sm' && 'h-9 px-4 text-sm',
        size === 'md' && 'h-11 px-6 text-sm',
        size === 'lg' && 'h-12 px-8 text-base',
        variant === 'primary'   && 'bg-navy text-white shadow-sm hover:bg-navy-deep hover:shadow-md active:scale-[.98]',
        variant === 'secondary' && 'border border-surface-border bg-white text-ink hover:border-navy/40 hover:bg-surface-soft',
        variant === 'ghost'     && 'text-navy hover:bg-navy-light',
        variant === 'danger'    && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
});
