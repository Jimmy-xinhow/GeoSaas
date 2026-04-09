export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="animate-pulse space-y-4 max-w-3xl w-full px-6">
        <div className="h-6 bg-white/10 rounded w-1/4" />
        <div className="h-10 bg-white/10 rounded w-3/4 mt-4" />
        <div className="h-24 bg-white/10 rounded mt-6" />
        <div className="h-48 bg-white/10 rounded mt-4" />
      </div>
    </div>
  );
}
