import React from 'react';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';

interface ComingSoonPageProps {
  title: string;
  description: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({
  title,
  description,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1 className="text-headline-sm">{title}</h1>
        <p
          className="text-body-sm"
          style={{
            color: 'var(--color-secondary)',
            marginTop: '4px',
          }}
        >
          {description}
        </p>
      </div>

      <Card style={{ padding: 'var(--space-md)' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-sm)',
          }}
        >
          <Chip variant="active">Coming soon</Chip>
          <p
            className="text-body-sm"
            style={{ color: 'var(--color-secondary)' }}
          >
            This module will be built in the upcoming stage. Stage 1 focuses on
            the foundation, database, role-based access control, layout, and
            12-month historical demo dataset.
          </p>
        </div>
      </Card>
    </div>
  );
};

