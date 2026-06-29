'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface VideoPreviewModalProps {
  videoId: string | null;
  adId: string;
  thumbnailUrl: string;
  adName: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ adId, thumbnailUrl, adName, onClose }: VideoPreviewModalProps) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adId) {
      setError('No ad ID available');
      setLoading(false);
      return;
    }

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/video?ad_id=${adId}`);
        const data = await res.json();
        if (data.preview_html) {
          setPreviewHtml(data.preview_html);
        } else {
          setError(data.error || 'Preview not available');
        }
      } catch {
        setError('Failed to load preview');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [adId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.15)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          <div className="min-w-0 flex-1 mr-3">
            <div className="text-sm font-medium text-slate-200 truncate" title={adName}>
              {adName.replace(/^TSH\d+_/, '')}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(248,113,113,0.15)' }}
          >
            <X size={16} className="text-red-400" />
          </button>
        </div>

        {/* Preview content */}
        <div className="relative" style={{ minHeight: '400px', maxHeight: '75vh', overflow: 'auto' }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-purple-400 animate-spin" />
              <span className="text-xs text-slate-400">Loading preview...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
              {thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnailUrl} alt={adName} className="w-32 h-32 object-cover rounded-lg opacity-50" />
              )}
              <span className="text-xs text-slate-400 text-center">{error}</span>
            </div>
          ) : previewHtml ? (
            <div 
              className="w-full"
              style={{ 
                background: '#fff',
                minHeight: '400px',
              }}
            >
              <iframe
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ 
                  minHeight: '500px',
                  height: '65vh',
                }}
                sandbox="allow-scripts allow-same-origin allow-popups"
                title="Ad Preview"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
