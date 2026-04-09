import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        <p className="text-8xl font-bold text-blue-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-white mb-3">
          找不到這個頁面
        </h1>
        <p className="text-gray-400 mb-8">
          你要找的頁面可能已被移除、更名，或暫時無法使用。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            回到首頁
          </Link>
          <Link
            href="/directory"
            className="px-6 py-3 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-colors"
          >
            瀏覽品牌目錄
          </Link>
        </div>
        <div className="mt-12 flex items-center justify-center gap-6 text-sm text-gray-500">
          <Link href="/blog" className="hover:text-white transition-colors">
            Blog
          </Link>
          <Link href="/cases" className="hover:text-white transition-colors">
            成功案例
          </Link>
          <Link href="/guide" className="hover:text-white transition-colors">
            使用指南
          </Link>
          <Link href="/news" className="hover:text-white transition-colors">
            AI News
          </Link>
        </div>
      </div>
    </div>
  );
}
