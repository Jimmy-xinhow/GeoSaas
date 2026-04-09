export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-pulse space-y-4 max-w-3xl w-full px-6">
        <div className="h-8 bg-white/10 rounded w-3/4" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
        <div className="h-64 bg-white/10 rounded mt-8" />
      </div>
    </div>
  );
}
