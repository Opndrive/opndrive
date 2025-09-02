'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaArchive, FaFilm, FaHeadphones } from 'react-icons/fa';
import { FaFilePdf } from 'react-icons/fa6';
import { LuFile, LuFileSpreadsheet, LuFileText } from 'react-icons/lu';
import { MdPhotoAlbum, MdPhotoLibrary } from 'react-icons/md';

export interface Option {
  value: string;
  label: string;
  icon?: string;
}

interface DropdownProps {
  placeholder?: string;
  options: Option[];
  value: string | null;
  onChange: (v: string) => void;
  showIcons?: boolean;
  id?: string;
}

let globalOpenDropdown: string | null = null;
const globalDropdownCallbacks = new Map<string, () => void>();

export const Dropdown = ({
  placeholder,
  options,
  value,
  onChange,
  showIcons = true,
  id = Math.random().toString(36),
}: DropdownProps) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const closeThisDropdown = () => {
      setOpen(false);
    };

    globalDropdownCallbacks.set(id, closeThisDropdown);
    return () => {
      globalDropdownCallbacks.delete(id);
    };
  }, [id]);

  const updateMenuPosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const opensUp = spaceBelow < 240;
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: opensUp ? undefined : rect.bottom + 4,
        bottom: opensUp ? window.innerHeight - rect.top + 4 : undefined,
        zIndex: 9999,
      });
    }
  };

  useEffect(() => {
    if (open) {
      updateMenuPosition();

      const handleScroll = () => {
        updateMenuPosition();
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);

      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      const isOutsideButton = btnRef.current && !btnRef.current.contains(target);
      const isOutsideMenu = menuRef.current && !menuRef.current.contains(target);

      if (open && isOutsideButton && isOutsideMenu) {
        setOpen(false);
        if (globalOpenDropdown === id) {
          globalOpenDropdown = null;
        }
      }
    };

    if (open) {
      document.addEventListener('mousedown', handler, true);
    }

    return () => {
      document.removeEventListener('mousedown', handler, true);
    };
  }, [open, id]);

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (open) {
      setOpen(false);
      globalOpenDropdown = null;
    } else {
      if (globalOpenDropdown && globalOpenDropdown !== id) {
        const closeCallback = globalDropdownCallbacks.get(globalOpenDropdown);
        if (closeCallback) {
          closeCallback();
        }
      }

      setOpen(true);
      globalOpenDropdown = id;
    }
  };

  const selectedOption = options.find((o) => o.value === value);

  const DropdownMenu = (
    <ul
      ref={menuRef}
      style={menuStyle}
      className="custom-scrollbar animate-in fade-in-5 z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <li
          key={opt.value}
          onClick={() => {
            onChange(opt.value);
            setOpen(false);
            globalOpenDropdown = null;
          }}
          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
        >
          {showIcons && opt.icon && (
            <div className="h-4 w-4 flex-shrink-0">
              {opt.icon === 'photo' && <MdPhotoLibrary />}
              {opt.icon === 'file-pdf' && <FaFilePdf />}
              {opt.icon === 'file-text' && <LuFileText />}
              {opt.icon === 'file-spreadsheet' && <LuFileSpreadsheet />}
              {opt.icon === 'file-presentation' && <MdPhotoAlbum />}
              {opt.icon === 'headphones' && <FaHeadphones />}
              {opt.icon === 'film' && <FaFilm />}
              {opt.icon === 'archive' && <FaArchive />}
              {opt.icon === 'file' && <LuFile />}
            </div>
          )}
          <span className="truncate">{opt.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded border border-border bg-input px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <span className="truncate text-foreground">{selectedOption?.label || placeholder}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isMounted && open && createPortal(DropdownMenu, document.body)}
    </>
  );
};
