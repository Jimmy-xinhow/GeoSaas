'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface EmailLinkProps {
  className?: string;
  children?: ReactNode;
}

const EMAIL_USER = 'service';
const EMAIL_DOMAIN = 'xinhow.com.tw';
const FALLBACK_TEXT = `${EMAIL_USER} [at] ${EMAIL_DOMAIN}`;

export default function EmailLink({ className, children }: EmailLinkProps) {
  const [email, setEmail] = useState('');

  useEffect(() => {
    setEmail(`${EMAIL_USER}@${EMAIL_DOMAIN}`);
  }, []);

  if (!email) {
    return <span className={className}>{children ?? FALLBACK_TEXT}</span>;
  }

  return (
    <a href={`mailto:${email}`} className={className}>
      {children ?? email}
    </a>
  );
}
