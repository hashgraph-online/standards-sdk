import * as React from 'react';
import { cn } from '../../lib/utils';

export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-lg border border-gray-100 bg-white p-4 shadow',
      className,
    )}
    {...props}
  />
);
