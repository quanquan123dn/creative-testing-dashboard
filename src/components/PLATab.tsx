'use client';

export default function PLATab() {
  return (
    <div className="flex flex-col items-center justify-center py-32 fade-in-up">
      <div className="glass-card p-12 text-center max-w-md">
        <div className="text-5xl mb-4">🖼️</div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">Test PLA</h2>
        <p className="text-sm mb-6" style={{ color: '#64748b' }}>
          Product Listing Ads testing dashboard is coming soon.
          The flow and data will be configured once your PLA campaign is ready.
        </p>
        <div className="px-4 py-2 rounded-lg inline-block text-xs font-medium" style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          color: '#60a5fa'
        }}>
          Coming Soon
        </div>
      </div>
    </div>
  );
}
