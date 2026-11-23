import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'link';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      className={`ui-btn ui-btn--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};

