'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@/hooks/use-auth';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (resp: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    },
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI load failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GSI load failed'));
    document.head.appendChild(script);
  });
}

interface Props {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  redirectTo?: string;
}

export default function GoogleSignInButton({ text = 'continue_with', redirectTo = '/dashboard' }: Props) {
  const router = useRouter();
  const googleLogin = useGoogleLogin();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    let cancelled = false;

    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
          callback: (resp) => {
            if (!resp.credential) {
              toast.error('Google 登入失敗：未取得憑證');
              return;
            }
            googleLogin.mutate(resp.credential, {
              onSuccess: () => {
                toast.success('登入成功');
                router.push(redirectTo);
              },
              onError: (err: unknown) => {
                const message =
                  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                  'Google 登入失敗，請稍後再試';
                toast.error(message);
              },
            });
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          width: 320,
          locale: 'zh-TW',
        });
        setReady(true);
      })
      .catch(() => {
        toast.error('無法載入 Google 登入元件');
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, googleLogin, redirectTo, router, text]);

  if (!clientId) {
    return (
      <button
        type="button"
        disabled
        className="flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm text-muted-foreground"
      >
        Google 登入尚未設定
      </button>
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div ref={containerRef} aria-label="Google 登入按鈕" />
      {!ready && (
        <span className="text-sm text-muted-foreground">載入中…</span>
      )}
    </div>
  );
}
