export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-pulse space-y-4 max-w-4xl w-full px-6">
        <div className="h-8 bg-white/10 rounded w-1/2" />
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="grid grid-cols-3 gap-4 mt-8">
          <div className="h-32 bg-white/10 rounded" />
          <div className="h-32 bg-white/10 rounded" />
          <div className="h-32 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}
