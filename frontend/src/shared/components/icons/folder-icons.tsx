import type React from 'react';
import { HiOutlineDotsVertical } from 'react-icons/hi';
import { FaFolder } from 'react-icons/fa';
import { MdFolderShared } from 'react-icons/md';

interface IconProps {
  className?: string;
  size?: number;
}

export const FolderIcon: React.FC<IconProps> = ({
  className: _className = '',
  size: _size = 20,
}) => <FaFolder size={24} className="text-primary " />;

export const SharedFolderIcon: React.FC<IconProps> = ({
  className: _className = '',
  size: _size = 20,
}) => <MdFolderShared size={24} className="text-primary " />;

export const MoreVerticalIcon: React.FC<IconProps> = ({
  className: _className = '',
  size: _size = 20,
}) => <HiOutlineDotsVertical size={18} />;
