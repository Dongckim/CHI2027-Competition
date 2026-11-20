import type { AnchorHTMLAttributes, ComponentPropsWithRef } from 'react';

// 44px high. primary = filled (inverse colours), secondary = outlined. `onDark` flips both for use on a dark card.
// outline = outlined in the text colour, 16px (Figma v3 05–07: "+ Add", "Question").
// size lg = 48px, radius 10, 16px: the bottom buttons of 04, 06, 07 (Show [n] results, Add to my day, Prepare a question).
// ButtonLink looks the same but goes somewhere (Directions, Catch up, Question).
type Look = { variant?: 'primary' | 'secondary' | 'outline'; onDark?: boolean; size?: 'md' | 'lg' };
const look = ({ variant = 'primary', onDark = false, size = 'md' }: Look) => `inline-flex items-center justify-center px-4 font-semibold ${size === 'lg' ? 'min-h-12 rounded-row text-body' : variant === 'outline' ? 'min-h-touch rounded-row text-body' : 'min-h-touch rounded-button text-small'} ${variant === 'primary'
  ? onDark ? 'bg-on-inverse text-inverse' : 'bg-inverse text-on-inverse'
  : variant === 'outline' ? 'border border-text text-text'
  : onDark ? 'border border-on-inverse text-on-inverse' : 'border border-border-strong text-text'}`;

export function Button({ variant, onDark, size, className = '', ...rest }: ComponentPropsWithRef<'button'> & Look) { // ref: React 19 passes it as a prop
  return <button type="button" className={`${look({ variant, onDark, size })} ${className}`} {...rest} />;
}
export function ButtonLink({ variant, onDark, size, className = '', ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Look) {
  return <a className={`${look({ variant, onDark, size })} ${className}`} {...rest} />;
}
