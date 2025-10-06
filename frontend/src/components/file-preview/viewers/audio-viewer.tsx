'use client';

import type React from 'react';

import { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  AlertCircle,
  Clock,
  Headphones,
  Music,
  AudioLines,
  Ban,
} from 'lucide-react';
import type { PreviewableFile } from '@/types/file-preview';
import { getContentTypeForS3 } from '@/config/file-extensions';
import { FaPause, FaPlay } from 'react-icons/fa6';
import { PreviewLoading } from '../preview-loading';
import { useAuthGuard } from '@/hooks/use-auth-guard';

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
  const [showWaves, setShowWaves] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  const getFileSize = (): number => {
    const fileWithSizeProps = file as PreviewableFile & {
      Size?: number;
      ContentLength?: number;
    };

    const size = file.size || fileWithSizeProps.Size || fileWithSizeProps.ContentLength || 0;
    return typeof size === 'number' ? size : 0;
  };

  useEffect(() => {
    const loadAudio = async () => {
      try {
        setLoading(true);
        setError(null);

        setFileSize(getFileSize());

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

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking && !timeUpdateIntervalRef.current) {
      const audioCurrentTime = audioRef.current.currentTime;
      setCurrentTime(audioCurrentTime);
    }
  };

  const startTimeUpdates = () => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
    }
    timeUpdateIntervalRef.current = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused && !isSeeking) {
        const currentAudioTime = audioRef.current.currentTime;
        setCurrentTime(currentAudioTime);
      }
    }, 100);
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
    const time = Number.parseFloat(e.target.value);
    if (audioRef.current && !isNaN(time)) {
      setCurrentTime(time);
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
    const newVolume = Number.parseFloat(e.target.value);
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
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
    setIsSeeking(false);
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
      if (isPlaying) {
        startTimeUpdates();
      }
    }
  };

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

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center animated-bg">
        <div className="glass-card rounded-3xl p-12 flex flex-col items-center space-y-6 max-w-md mx-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-t-transparent border-primary rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-primary/30 rounded-full animate-spin animation-delay-150"></div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-medium text-foreground">Loading your music</p>
            <p className="text-sm text-muted-foreground">Preparing audio experience...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center animated-bg">
        <div className="glass-card rounded-3xl p-12 text-center space-y-6 max-w-md mx-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-destructive/20">
              <AlertCircle size={48} className="text-destructive" />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-foreground">Oops! Something went wrong</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={handleRetry}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-all duration-200 glow-effect"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col animated-bg">
      <div className="glass-card border-b border-border/50 backdrop-blur-xl">
        <div className="flex items-center justify-between p-2 sm:p-3 md:p-4 lg:p-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1 sm:p-1.5 md:p-2 rounded-full bg-primary/20">
              <Music size={14} className="sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary" />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1">
            <button
              onClick={handleRestart}
              className="p-1.5 sm:p-2 rounded-full bg-secondary hover:bg-control-hover text-secondary-foreground transition-all duration-200 hover:scale-105"
              title="Restart"
            >
              <RotateCcw size={12} className="sm:w-[14px] sm:h-[14px] md:w-[16px] md:h-[16px]" />
            </button>

            <button
              onClick={handleMuteToggle}
              className="p-1.5 sm:p-2 rounded-full bg-secondary hover:bg-control-hover text-secondary-foreground transition-all duration-200 hover:scale-105"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <VolumeX size={12} className="sm:w-[14px] sm:h-[14px] md:w-[16px] md:h-[16px]" />
              ) : (
                <Volume2 size={12} className="sm:w-[14px] sm:h-[14px] md:w-[16px] md:h-[16px]" />
              )}
            </button>

            <button
              onClick={() => setShowWaves(!showWaves)}
              className="p-1.5 sm:p-2 rounded-full bg-secondary hover:bg-control-hover text-secondary-foreground transition-all duration-200 hover:scale-105"
              title={showWaves ? 'Hide Waves' : 'Show Waves'}
            >
              <div className="w-[12px] h-[12px] sm:w-[14px] sm:h-[14px] md:w-[16px] md:h-[16px] flex items-center justify-center">
                {showWaves ? <AudioLines /> : <Ban />}
              </div>
            </button>

            <div className="hidden sm:flex items-center gap-2 md:gap-3 ml-2">
              <span className="text-xs md:text-sm text-muted-foreground hidden lg:block">
                Volume
              </span>
              <div className="w-12 sm:w-16 md:w-20 lg:w-24 relative">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="modern-slider w-full"
                  style={{
                    background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${volume * 100}%, var(--volume-track) ${volume * 100}%, var(--volume-track) 100%)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 md:p-5 lg:p-6">
        <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl">
          <div className="flex justify-center mb-4 sm:mb-6 md:mb-6 lg:mb-8">
            <div className="relative">
              {isPlaying && showWaves && (
                <div className={`audio-waves ${!showWaves ? 'hidden' : ''}`}>
                  <div className="wave-ring"></div>
                  <div className="wave-ring"></div>
                  <div className="wave-ring"></div>
                  <div className="wave-ring"></div>
                  <div className="wave-ring"></div>
                </div>
              )}
              <div className="glass-card p-3 sm:p-4 md:p-5 lg:p-6 rounded-full float-animation">
                <div className="p-2 sm:p-3 md:p-4 lg:p-5 rounded-full bg-gradient-to-br from-primary to-primary/80 glow-effect">
                  <Headphones
                    size={28}
                    className="sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 text-primary-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mb-4 sm:mb-6 md:mb-6 lg:mb-8 space-y-1 sm:space-y-2 md:space-y-2 px-4">
            <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-semibold text-foreground text-balance leading-tight">
              {file.name.replace(/\.[^/.]+$/, '')}
            </h1>
            <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-3 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1 sm:gap-2">
                <Clock size={14} className="sm:w-4 sm:h-4" />
                {duration ? formatTime(duration) : '--:--'}
              </span>
              <span>•</span>
              <span>
                {fileSize > 0 ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Unknown size'}
              </span>
            </div>
          </div>

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

          <div className="space-y-2 sm:space-y-3 md:space-y-4 px-4">
            <div className="space-y-1 sm:space-y-1.5">
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
                className="modern-slider w-full"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%, var(--progress-track) ${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%, var(--progress-track) 100%)`,
                }}
              />

              <div className="flex justify-between items-center text-xs sm:text-sm text-muted-foreground">
                <span className="font-mono">{formatTime(currentTime)}</span>
                <span className="font-mono">{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handlePlayPause}
                className="relative p-2.5 sm:p-3 md:p-3.5 lg:p-4 rounded-full bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-2xl hover:shadow-primary/50 transition-all duration-300 hover:scale-105 glow-effect group"
                title={isPlaying ? 'Pause' : 'Play'}
                style={{
                  boxShadow: `var(--player-glow), 0 8px 32px rgba(0, 0, 0, 0.15)`,
                }}
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 flex items-center justify-center">
                  {isPlaying ? (
                    <FaPause
                      size={12}
                      className="sm:text-sm md:text-base lg:text-lg group-hover:scale-110 transition-transform"
                    />
                  ) : (
                    <FaPlay
                      size={12}
                      className="sm:text-sm md:text-base lg:text-lg ml-0.5 sm:ml-1 group-hover:scale-110 transition-transform"
                    />
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card border-t border-border/50 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 md:p-4 lg:p-6 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1 sm:gap-2">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-primary animate-pulse"></div>
              <span className="hidden sm:inline">Audio Player Active</span>
              <span className="sm:hidden">Active</span>
            </span>
            <span className="hidden md:block">•</span>
            <span className="hidden md:block">High Quality Playback</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <span className="hidden sm:inline">Bitrate: Auto</span>
            <span className="hidden sm:inline">•</span>
            <span>Format: {file.name.split('.').pop()?.toUpperCase() || 'Audio'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
