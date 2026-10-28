import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function Button({ children, className = '', variant = 'secondary', ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-white text-zinc-950 hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-400',
    secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'bg-transparent text-zinc-300 hover:bg-zinc-800',
  };
  return (
    <button
      className={`ui-motion inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
