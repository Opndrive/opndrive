'use client';

import React from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import { Files, Info } from 'lucide-react';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import type { FileExtension } from '@/config/file-extensions';

export type OperationType = 'upload' | 'delete' | 'download';

/**
 * One row of the operations panel.
 *
 * Every prop is a primitive or a stable callback, and that is the whole point.
 * The panel used to inline this markup inside a `.map()`, so a single progress
 * tick - one part of one file out of thousands - re-rendered every row's
 * subtree. React.memo can only help if what it compares is shallow-equal
 * between renders, which rules out passing the derived operation OBJECT: the
 * parent rebuilds that array on every tick, so each object is a fresh
 * reference even when nothing about it changed.
 *
 * Spreading the fields out means an untouched row compares equal and React
 * skips it entirely. The row that actually moved is the only one that
 * reconciles.
 */
export interface OperationRowProps {
  id: string;
  name: string;
  /** 'mixed' is a selection that is neither - see DeleteProgress['type']. */
  type: 'file' | 'folder' | 'mixed';
  /**
   * Names of what a counted card is actually operating on, one per line.
   *
   * Shown behind an info icon rather than on the card: eight of them inline
   * truncate to "main - Copy - Copy (2).json, mai...", which spends a whole
   * line saying less than the count above it already did.
   */
  detail?: string;
  operationType: OperationType;
  status: string;
  progress: number;
  extension?: FileExtension;
  error?: string;
  queuePosition?: number;
  totalFiles?: number;
  completedFiles?: number;
  isHovered: boolean;
  supportsPauseResume: boolean;
  onHoverChange: (id: string | null) => void;
  onCancel: (id: string, operationType: OperationType, isFolder: boolean) => void;
  onRemove: (id: string, operationType: OperationType) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

const CANCELLABLE = ['uploading', 'queued', 'deleting', 'paused', 'downloading', 'pending'];
const ACTIVE = ['uploading', 'queued', 'deleting', 'downloading', 'pending'];

const OperationRowInner: React.FC<OperationRowProps> = ({
  id,
  name,
  type,
  detail,
  operationType,
  status,
  progress,
  extension,
  error,
  queuePosition,
  totalFiles,
  completedFiles,
  isHovered,
  supportsPauseResume,
  onHoverChange,
  onCancel,
  onRemove,
  onPause,
  onResume,
}) => {
  const canCancel = CANCELLABLE.includes(status);
  const isActive = ACTIVE.includes(status);
  const isFileUpload = operationType === 'upload' && type === 'file';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition-colors duration-200"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (canCancel) {
          e.currentTarget.style.background = 'var(--secondary)';
          onHoverChange(id);
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        onHoverChange(null);
      }}
    >
      {/* File/Folder Icon */}
      <div className="flex-shrink-0">
        {type === 'folder' ? (
          <FolderIcon />
        ) : type === 'mixed' ? (
          // Files and folders together. Drawing either one alone would claim
          // something about the selection that is not true.
          <Files className="w-6 h-6" style={{ color: 'var(--muted-foreground)' }} />
        ) : (
          <FileIcon extension={extension} filename={name} className="w-6 h-6" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            className="text-xs font-medium truncate"
            title={name}
            style={{ color: 'var(--foreground)' }}
          >
            {name}
          </p>
          {detail ? (
            <AriaLabel
              label={detail}
              multiline
              className="aria-label-list"
              position="top"
              focusableWrapper
            >
              <Info
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--muted-foreground)' }}
                aria-label="Show all items"
              />
            </AriaLabel>
          ) : null}
        </div>
        {status === 'completed' && (
          // Muted, like the other two. A finished delete used to be painted the
          // same red as a cancelled or failed one, so a green tick sat next to
          // red text - and a real failure looked identical to a success.
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {operationType === 'upload'
              ? 'Upload complete'
              : operationType === 'delete'
                ? 'Delete complete'
                : 'Download complete'}
          </p>
        )}
        {status === 'cancelled' && (
          <p className="text-xs" style={{ color: '#ef4444' }}>
            {operationType === 'upload'
              ? 'Upload cancelled'
              : operationType === 'delete'
                ? 'Delete cancelled'
                : 'Download cancelled'}
          </p>
        )}
        {status === 'uploading' && (
          <p className="text-xs" style={{ color: 'var(--primary)' }}>
            Uploading...
          </p>
        )}
        {status === 'downloading' && (
          // With the percentage, which is the one thing the separate download
          // card said that this row did not. The ring beside it has always
          // shown the same figure as a shape; this puts a number on it.
          <p className="text-xs" style={{ color: 'var(--primary)' }}>
            Downloading... {Math.round(progress)}%
          </p>
        )}
        {status === 'pending' && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Starting...
          </p>
        )}
        {status === 'queued' && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {queuePosition ? `In queue (${queuePosition})` : 'Queued'}
          </p>
        )}
        {status === 'paused' && (
          <p className="text-xs" style={{ color: '#f59e0b' }}>
            Paused
          </p>
        )}
        {(status === 'failed' || status === 'error') && (
          // 'failed' is the status a delete actually reports; only uploads and
          // downloads use 'error'. Matching on 'error' alone meant a failed or
          // partly-failed delete rendered no reason at all - the summary naming
          // the objects that survived was written to the store and never shown.
          <p className="text-xs" style={{ color: '#ef4444' }}>
            {error || 'Failed'}
          </p>
        )}
        {totalFiles && completedFiles !== undefined && (
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {completedFiles} of {totalFiles}
          </p>
        )}
      </div>

      {/* Pause/Resume Buttons and Progress Circle */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {/* Pause/Resume Buttons for file uploads only - only in multipart mode */}
        {supportsPauseResume && isFileUpload && (isActive || status === 'paused') && (
          <div className="flex items-center">
            {/* Pause Button - always visible on mobile, hover-based on desktop */}
            {status === 'uploading' && (
              <AriaLabel label={`Pause upload of ${name}`} position="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPause(id);
                  }}
                  className={`w-7 h-7 rounded transition-colors duration-200 flex items-center justify-center ${
                    isHovered ? 'flex' : 'flex sm:hidden'
                  }`}
                  style={{
                    color: 'var(--muted-foreground)',
                    background: 'var(--accent)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </AriaLabel>
            )}

            {/* Resume Button - for paused files, near the progress circle */}
            {status === 'paused' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(id);
                }}
                className="w-7 h-7 rounded transition-colors duration-200 flex items-center justify-center"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                  e.currentTarget.style.border = '1px solid var(--border)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.border = 'none';
                }}
                title="Resume Upload"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Progress Circle */}
        <div className="relative">
          {isActive || status === 'paused' ? (
            <div className="relative w-6 h-6">
              {/* Progress Circle Background */}
              <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="var(--progress-track)"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke={
                    operationType === 'delete'
                      ? '#ef4444'
                      : operationType === 'download'
                        ? '#3b82f6'
                        : 'var(--primary)'
                  }
                  strokeWidth="2"
                  strokeDasharray={`${2 * Math.PI * 10}`}
                  strokeDashoffset={`${2 * Math.PI * 10 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>

              {/* Cancel Button on Hover for Paused Files */}
              {status === 'paused' && isFileUpload && isHovered && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // `isFileUpload` already established this is a file, so the
                    // isFolder argument is unconditionally false here.
                    onCancel(id, operationType, false);
                  }}
                  className="absolute inset-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                  }}
                  title="Cancel"
                >
                  <HiOutlineXMark
                    className="w-3 h-3"
                    style={{ color: 'var(--muted-foreground)' }}
                  />
                </button>
              )}

              {/* Cancel Button on Hover for non-paused active operations */}
              {isHovered && canCancel && status !== 'paused' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(id, operationType, type === 'folder');
                  }}
                  className="absolute inset-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <HiOutlineXMark
                    className="w-3 h-3"
                    style={{ color: 'var(--muted-foreground)' }}
                  />
                </button>
              )}
            </div>
          ) : status === 'completed' ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: '#22c55e' }}
                >
                  <svg className="w-2.5 h-2.5" fill="white" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
              <button
                onClick={() => onRemove(id, operationType)}
                className="p-1 rounded transition-colors duration-200"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <HiOutlineXMark className="w-3 h-3" />
              </button>
            </div>
          ) : status === 'cancelled' || status === 'error' || status === 'failed' ? (
            // A settled row that did not succeed, which until now meant no
            // control at all: the chain ran active, then completed, then
            // cancelled, and anything that had gone wrong fell past all three
            // to null. So the one row a reader most wants rid of was the only
            // one with nothing to press. ('failed' is what a delete reports;
            // uploads and downloads say 'error'.)
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRemove(id, operationType)}
                className="p-1 rounded transition-colors duration-200"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Remove from list"
              >
                <HiOutlineXMark className="w-3 h-3" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const OperationRow = React.memo(OperationRowInner);
OperationRow.displayName = 'OperationRow';
