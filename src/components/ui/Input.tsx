import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  id,
  className = '',
  ...props
}) => {
  return (
    <div className="ui-input-field">
      {label && (
        <label htmlFor={id} className="ui-input-label text-label-md">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`ui-input ${error ? 'ui-input--error' : ''} ${className}`.trim()}
        {...props}
      />
      {error && <span className="ui-input-error text-label-sm">{error}</span>}
    </div>
  );
};

