'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Play, Loader2, Volume2, VolumeX } from 'lucide-react';

interface VideoPreviewModalProps {
  videoId: string | null;
  thumbnailUrl: string;
  adName: string;
  onClose: () => void;
}

export default function VideoPreviewModal({ videoId, thumbnailUrl, adName, onClose }: VideoPreviewModalProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoId) {
      setError('No video ID available');
      setLoading(false);
      return;
    }

    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/video?id=${videoId}`);
        const data = await res.json();
        if (data.video_url) {
          setVideoUrl(data.video_url);
        } else {
          setError('Video URL not available');
        }
      } catch {
        setError('Failed to load video');
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

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

        {/* Video content */}
        <div className="relative" style={{ aspectRatio: '9/16', maxHeight: '70vh' }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-purple-400 animate-spin" />
              <span className="text-xs text-slate-400">Loading video...</span>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
              {thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnailUrl} alt={adName} className="absolute inset-0 w-full h-full object-cover opacity-30" />
              )}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <Play size={40} className="text-slate-500" />
                <span className="text-xs text-slate-400 text-center">{error}</span>
              </div>
            </div>
          ) : videoUrl ? (
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                autoPlay
                loop
                muted={muted}
                playsInline
                className="w-full h-full object-contain"
                style={{ background: '#000' }}
              />
              {/* Mute toggle */}
              <button
                onClick={() => setMuted(!muted)}
                className="absolute bottom-3 right-3 p-2 rounded-full transition-all"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {muted ? (
                  <VolumeX size={16} className="text-white" />
                ) : (
                  <Volume2 size={16} className="text-white" />
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
