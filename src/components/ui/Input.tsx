import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-ink">
          {typeof label === 'string' && label.trimEnd().endsWith('*') ? (
            <>
              {label.trimEnd().slice(0, -1).trimEnd()}{' '}
              <span className="text-red-500">*</span>
            </>
          ) : (
            label
          )}
        </label>
      )}
      <input
        ref={ref} id={inputId}
        className={cn(error && '!border-red-400', className)}
        {...rest}
      />
      {error ? <p className="text-xs text-red-600">{error}</p>
             : hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
});
