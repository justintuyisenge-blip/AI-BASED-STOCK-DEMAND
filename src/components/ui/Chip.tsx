import React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'active' | 'error';
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantClass =
    variant === 'default' ? '' : `ui-chip--${variant}`;

  return (
    <span className={`ui-chip ${variantClass} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
};

