'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Smartphone, Monitor } from 'lucide-react';

interface VideoPreviewModalProps {
  videoId: string | null;
  adId: string;
  thumbnailUrl: string;
  adName: string;
  onClose: () => void;
}

type PreviewFormat = 'MOBILE_FEED_STANDARD' | 'INSTAGRAM_STORY';

export default function VideoPreviewModal({ adId, thumbnailUrl, adName, onClose }: VideoPreviewModalProps) {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<PreviewFormat>('MOBILE_FEED_STANDARD');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adId) {
      setError('No ad ID available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/video?ad_id=${adId}&format=${format}`);
        const data = await res.json();
        if (data.preview_html) {
          // Extract iframe src from the preview HTML
          const srcMatch = data.preview_html.match(/src="([^"]+)"/);
          if (srcMatch) {
            setIframeSrc(srcMatch[1]);
          } else {
            setError('Could not parse preview');
          }
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
  }, [adId, format]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isStory = format === 'INSTAGRAM_STORY';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isStory ? '360px' : '420px',
          maxHeight: '90vh',
          background: 'linear-gradient(145deg, #1a1f35 0%, #0d1117 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0 0 60px rgba(139,92,246,0.15), 0 25px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ 
            background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.1) 100%)',
            borderBottom: '1px solid rgba(139,92,246,0.15)',
          }}
        >
          <div className="min-w-0 flex-1 mr-3">
            <div className="text-sm font-semibold text-slate-100 truncate" title={adName}>
              🎬 {adName.replace(/^TSH\d+_/, '')}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Ad Preview</div>
          </div>
          
          {/* Format switcher */}
          <div className="flex items-center gap-1 mr-3">
            <button
              onClick={() => setFormat('MOBILE_FEED_STANDARD')}
              className="p-1.5 rounded-md transition-all"
              title="Feed Preview"
              style={{
                background: !isStory ? 'rgba(139,92,246,0.25)' : 'rgba(148,163,184,0.1)',
                border: `1px solid ${!isStory ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
              }}
            >
              <Monitor size={14} className={!isStory ? 'text-purple-300' : 'text-slate-500'} />
            </button>
            <button
              onClick={() => setFormat('INSTAGRAM_STORY')}
              className="p-1.5 rounded-md transition-all"
              title="Story Preview"
              style={{
                background: isStory ? 'rgba(139,92,246,0.25)' : 'rgba(148,163,184,0.1)',
                border: `1px solid ${isStory ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
              }}
            >
              <Smartphone size={14} className={isStory ? 'text-purple-300' : 'text-slate-500'} />
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:scale-110"
            style={{ 
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.2)',
            }}
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>

        {/* Preview content */}
        <div 
          className="relative flex-1 overflow-hidden"
          style={{ 
            minHeight: isStory ? '580px' : '480px',
            background: '#000',
          }}
        >
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              {thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={thumbnailUrl} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div 
                  className="p-4 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.2)', backdropFilter: 'blur(8px)' }}
                >
                  <Loader2 size={28} className="text-purple-400 animate-spin" />
                </div>
                <span className="text-xs text-slate-400 font-medium">Loading preview...</span>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
              <div className="text-3xl">😕</div>
              <span className="text-sm text-slate-400 text-center">{error}</span>
            </div>
          ) : iframeSrc ? (
            <iframe
              src={iframeSrc}
              className="w-full h-full border-0"
              style={{ 
                minHeight: isStory ? '580px' : '480px',
                background: '#fff',
              }}
              allow="autoplay; encrypted-media"
              title="Ad Preview"
            />
          ) : null}
        </div>

        {/* Footer hint */}
        <div 
          className="px-4 py-2 text-center shrink-0"
          style={{ 
            background: 'rgba(15,22,41,0.8)',
            borderTop: '1px solid rgba(139,92,246,0.1)',
          }}
        >
          <span className="text-[10px] text-slate-500">
            Click outside or press ESC to close • Switch 📱/🖥 for different views
          </span>
        </div>
      </div>
    </div>
  );
}
