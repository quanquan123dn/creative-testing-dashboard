'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';

interface VideoPreviewModalProps {
  videoId: string | null;
  adId: string;
  thumbnailUrl: string;
  adName: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ videoId, adId, thumbnailUrl, adName, onClose }: VideoPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'embed' | 'preview'>('embed');

  useEffect(() => {
    if (!videoId && !adId) {
      setError('No video data available');
      setLoading(false);
      return;
    }

    // Try Facebook video embed first (clean video only)
    if (videoId) {
      const embedUrl = `https://www.facebook.com/plugins/video.php?href=https://www.facebook.com/watch/?v=${videoId}&show_text=false&autoplay=true&mute=0`;
      setPreviewUrl(embedUrl);
      setLoading(false);
    } else {
      setError('No video ID');
      setLoading(false);
    }
  }, [videoId, adId]);

  // Fallback to Ad Preview
  useEffect(() => {
    if (mode !== 'preview' || !adId) return;
    
    setLoading(true);
    setError(null);

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/video?ad_id=${adId}&format=MOBILE_FEED_STANDARD`);
        const data = await res.json();
        if (data.preview_html) {
          let html = data.preview_html;
          html = html.replace(/width="\d+"/, 'width="100%"');
          html = html.replace(/height="\d+"/, 'height="100%"');
          html = html.replace('<iframe', '<iframe style="border:none;width:100%;height:100%;min-height:500px;"');
          setPreviewUrl(null);
          setError(null);
          // Store HTML in a data attribute approach
          const container = document.getElementById('preview-container');
          if (container) container.innerHTML = html;
        } else {
          setError('Preview not available');
        }
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [mode, adId]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '400px',
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
          id="preview-container"
          style={{ 
            minHeight: '500px',
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
                <span className="text-xs text-slate-400 font-medium">Loading...</span>
              </div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
              {thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={thumbnailUrl} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover opacity-30"
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="text-2xl">🎬</div>
                <span className="text-xs text-slate-400 text-center">{error}</span>
                {videoId && (
                  <a
                    href={`https://www.facebook.com/watch/?v=${videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: 'rgba(59,130,246,0.2)',
                      color: '#93c5fd',
                      border: '1px solid rgba(59,130,246,0.3)',
                    }}
                  >
                    <ExternalLink size={12} />
                    Open on Facebook
                  </a>
                )}
              </div>
            </div>
          ) : previewUrl && mode === 'embed' ? (
            <iframe
              src={previewUrl}
              className="w-full border-0"
              style={{ 
                minHeight: '500px',
                height: '65vh',
                background: '#000',
              }}
              allow="autoplay; encrypted-media; fullscreen"
              title="Video Preview"
            />
          ) : null}
        </div>

        {/* Footer */}
        <div 
          className="px-4 py-2 text-center shrink-0"
          style={{ 
            background: 'rgba(15,22,41,0.8)',
            borderTop: '1px solid rgba(139,92,246,0.1)',
          }}
        >
          <span className="text-[10px] text-slate-500">
            Press ESC to close
          </span>
        </div>
      </div>
    </div>
  );
}
