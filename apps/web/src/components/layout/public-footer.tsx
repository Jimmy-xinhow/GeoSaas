import Link from 'next/link';
import EmailLink from '@/components/shared/email-link';

export default function PublicFooter() {
  return (
    <footer className="border-t border-white/5 bg-gray-950 py-8 text-sm text-gray-600">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-center sm:flex-row sm:text-left">
        <p>&copy; {new Date().getFullYear()} Geovault</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Legal links">
          <Link href="/privacy" className="hover:text-white transition-colors">
            隱私權政策
          </Link>
          <Link href="/terms" className="hover:text-white transition-colors">
            服務條款
          </Link>
          <EmailLink className="hover:text-white transition-colors" />
        </nav>
      </div>
    </footer>
  );
}
