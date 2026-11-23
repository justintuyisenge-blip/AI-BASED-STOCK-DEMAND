import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = '',
}) => {
  return (
    <div className={`ui-markdown ${className}`.trim()}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
};

