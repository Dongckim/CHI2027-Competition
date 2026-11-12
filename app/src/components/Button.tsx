import type { ButtonHTMLAttributes } from 'react';

// 44px high. primary = filled (inverse colours), secondary = outlined. `onDark` flips both for use on a dark card.
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; onDark?: boolean };

export function Button({ variant = 'primary', onDark = false, className = '', ...rest }: Props) {
  const look = variant === 'primary'
    ? onDark ? 'bg-on-inverse text-inverse' : 'bg-inverse text-on-inverse'
    : onDark ? 'border border-on-inverse text-on-inverse' : 'border border-border-strong text-text';
  return <button type="button" className={`min-h-touch rounded-button px-4 text-small font-semibold ${look} ${className}`} {...rest} />;
}
