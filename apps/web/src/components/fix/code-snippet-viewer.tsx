'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeSnippetViewerProps {
  code: string;
  language: string;
  className?: string;
}

export function CodeSnippetViewer({
  code,
  language,
  className,
}: CodeSnippetViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn('overflow-hidden rounded-lg', className)}>
      {/* Top bar */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-xs font-medium text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-200"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>已複製</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>複製</span>
            </>
          )}
        </button>
      </div>
      {/* Code block */}
      <div className="bg-gray-900 p-4 overflow-x-auto">
        <pre className="text-sm leading-relaxed">
          <code className="text-gray-100">{code}</code>
        </pre>
      </div>
    </div>
  );
}
