import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

// 44px high. primary = filled (inverse colours), secondary = outlined. `onDark` flips both for use on a dark card.
// ButtonLink looks the same but goes somewhere (Directions, Catch up, Question).
type Look = { variant?: 'primary' | 'secondary'; onDark?: boolean };
const look = ({ variant = 'primary', onDark = false }: Look) => `inline-flex min-h-touch items-center justify-center rounded-button px-4 text-small font-semibold ${variant === 'primary'
  ? onDark ? 'bg-on-inverse text-inverse' : 'bg-inverse text-on-inverse'
  : onDark ? 'border border-on-inverse text-on-inverse' : 'border border-border-strong text-text'}`;

export function Button({ variant, onDark, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & Look) {
  return <button type="button" className={`${look({ variant, onDark })} ${className}`} {...rest} />;
}
export function ButtonLink({ variant, onDark, className = '', ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Look) {
  return <a className={`${look({ variant, onDark })} ${className}`} {...rest} />;
}
