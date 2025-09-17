'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, RotateCcw, AlertCircle, Clock, Headphones } from 'lucide-react';
import { useApiS3 } from '@/hooks/use-auth';
import { PreviewableFile } from '@/types/file-preview';
import { getContentTypeForS3 } from '@/config/file-extensions';
import { FaPause, FaPlay } from 'react-icons/fa6';

interface AudioViewerProps {
  file: PreviewableFile;
}

export function AudioViewer({ file }: AudioViewerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fileSize, setFileSize] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiS3 = useApiS3();

  // Get file size from various possible properties
  const getFileSize = (): number => {
    // Define the expected shape of file with possible size properties
    const fileWithSizeProps = file as PreviewableFile & {
      Size?: number;
      ContentLength?: number;
    };

    // Try different property names that might contain the file size
    const size = file.size || fileWithSizeProps.Size || fileWithSizeProps.ContentLength || 0;

    return typeof size === 'number' ? size : 0;
  };

  // Load audio file
  useEffect(() => {
    const loadAudio = async () => {
      try {
        if (!apiS3) return;
        setLoading(true);
        setError(null);

        // Set file size
        setFileSize(getFileSize());

        // Get the file key (handle both Key and key properties)
        const fileKey = (file as PreviewableFile & { Key?: string }).Key || file.key || file.name;

        if (!fileKey) {
          throw new Error('No file key found');
        }

        const url = await apiS3.getSignedUrl({
          key: fileKey,
          expiryInSeconds: 3600,
          isPreview: true,
          responseContentType: getContentTypeForS3(fileKey),
        });

        setAudioUrl(url);
        setLoading(false);
      } catch (err: unknown) {
        console.error('Error loading audio:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load audio file';
        setError(errorMessage);
        setLoading(false);
      }
    };

    loadAudio();
  }, [file, apiS3]);

  // Audio event handlers
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleTimeUpdate = () => {
    // Only update from native timeupdate when not using our custom interval
    if (audioRef.current && !isSeeking && !timeUpdateIntervalRef.current) {
      const audioCurrentTime = audioRef.current.currentTime;
      setCurrentTime(audioCurrentTime);
    }
  };

  // Start/stop frequent time updates when playing/pausing
  const startTimeUpdates = () => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
    }
    timeUpdateIntervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused && !isSeeking) {
        const currentAudioTime = audioRef.current.currentTime;
        setCurrentTime(currentAudioTime);
      }
    }, 100); // Update every 100ms for smooth progress
  };

  const stopTimeUpdates = () => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        stopTimeUpdates();
      } else {
        audioRef.current.play();
        startTimeUpdates();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    startTimeUpdates();
  };

  const handlePause = () => {
    setIsPlaying(false);
    stopTimeUpdates();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current && !isNaN(time)) {
      setCurrentTime(time); // Update UI immediately for responsive feel
      audioRef.current.currentTime = time;
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    stopTimeUpdates();
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    if (isPlaying && !audioRef.current?.paused) {
      startTimeUpdates();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleMuteToggle = () => {
    if (audioRef.current) {
      audioRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const handleSeeked = () => {
    // Update current time after seeking is complete and clear seeking state
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
    setIsSeeking(false);
    // Restart time updates if audio is playing
    if (isPlaying && audioRef.current && !audioRef.current.paused) {
      startTimeUpdates();
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    stopTimeUpdates();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handleRestart = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      // If audio was playing, ensure time updates continue
      if (isPlaying) {
        startTimeUpdates();
      }
    }
  };

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      stopTimeUpdates();
    };
  }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRetry = () => {
    setError(null);
    setAudioUrl(null);
    setLoading(true);
  };

  // Loading state
  if (loading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <div className="flex flex-col items-center space-y-4">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{
              borderColor: 'var(--primary)',
            }}
          />
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Loading audio...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <div className="text-center space-y-4">
          <AlertCircle
            size={48}
            style={{
              color: 'var(--destructive)',
              margin: '0 auto',
            }}
          />
          <div className="space-y-2">
            <p className="text-lg font-medium">Failed to load audio</p>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {/* Audio Controls Header */}
      <div
        className="flex items-center justify-center gap-1 sm:gap-2 p-2 sm:p-3 border-b flex-wrap"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={handleRestart}
          className="p-2 sm:p-2.5 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{
            backgroundColor: 'var(--secondary)',
            color: 'var(--secondary-foreground)',
          }}
          title="Restart"
        >
          <RotateCcw size={16} className="sm:w-5 sm:h-5" />
        </button>

        <button
          onClick={handleMuteToggle}
          className="p-2 sm:p-2.5 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{
            backgroundColor: 'var(--secondary)',
            color: 'var(--secondary-foreground)',
          }}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <VolumeX size={16} className="sm:w-5 sm:h-5" />
          ) : (
            <Volume2 size={16} className="sm:w-5 sm:h-5" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm whitespace-nowrap">Volume:</span>
          <div className="relative w-20 sm:w-24">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-1 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${volume * 100}%, var(--secondary) ${volume * 100}%, var(--secondary) 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Audio Player */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Audio Icon */}
          <div className="flex justify-center">
            <div
              className="p-8 rounded-full"
              style={{
                backgroundColor: 'var(--secondary)',
                color: 'var(--secondary-foreground)',
              }}
            >
              <Headphones size={64} />
            </div>
          </div>

          {/* File Name */}
          <div className="text-center">
            <h3 className="text-lg sm:text-xl font-medium mb-2">{file.name}</h3>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Audio File
            </p>
          </div>

          {/* Audio Element */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeeked}
              onEnded={handleEnded}
              onError={() => {
                setError('Failed to load audio file');
                stopTimeUpdates();
              }}
              style={{ display: 'none' }}
            />
          )}

          {/* Audio Controls */}
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <style jsx>{`
                .audio-progress {
                  -webkit-appearance: none;
                  appearance: none;
                  background: transparent;
                  cursor: pointer;
                  outline: none;
                }

                .audio-progress::-webkit-slider-track {
                  height: 6px;
                  border-radius: 3px;
                  background: transparent;
                }

                .audio-progress::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  height: 18px;
                  width: 18px;
                  border-radius: 50%;
                  background: var(--primary);
                  border: 3px solid var(--background);
                  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                  cursor: pointer;
                  transition: all 0.15s ease;
                  margin-top: -6px;
                }

                .audio-progress::-webkit-slider-thumb:hover {
                  transform: scale(1.15);
                  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
                }

                .audio-progress::-webkit-slider-thumb:active {
                  transform: scale(1.1);
                }

                .audio-progress::-moz-range-track {
                  height: 6px;
                  border-radius: 3px;
                  border: none;
                  background: transparent;
                }

                .audio-progress::-moz-range-thumb {
                  height: 18px;
                  width: 18px;
                  border-radius: 50%;
                  background: var(--primary);
                  border: 3px solid var(--background);
                  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                  cursor: pointer;
                  transition: all 0.15s ease;
                }

                .audio-progress::-moz-range-thumb:hover {
                  transform: scale(1.15);
                  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
                }
              `}</style>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                onTouchStart={handleSeekStart}
                onTouchEnd={handleSeekEnd}
                className="audio-progress w-full h-2 rounded-lg"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%, var(--muted) ${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%, var(--muted) 100%)`,
                }}
              />
              <div
                className="flex justify-between text-xs"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {formatTime(currentTime)}
                </span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Play/Pause Button */}
            <div className="flex justify-center">
              <button
                onClick={handlePlayPause}
                className="p-3 sm:p-3 rounded-full hover:bg-opacity-80 cursor-pointer transition-all shadow-lg"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                    <FaPause size={20} className="sm:w-6 sm:h-6" />
                  </div>
                ) : (
                  <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                    <FaPlay size={20} className="sm:w-6 sm:h-6" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer with file info */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 border-t text-xs sm:text-sm gap-1 sm:gap-0"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
          color: 'var(--muted-foreground)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
          <span>Duration: {duration ? formatTime(duration) : 'Unknown'}</span>
          <span>Size: {fileSize > 0 ? `${(fileSize / 1024).toFixed(1)} MB` : 'Unknown'}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
          <span className="hidden sm:inline">Audio controls available</span>
          <span className="sm:hidden text-xs">Tap to control playback</span>
        </div>
      </div>
    </div>
  );
}
