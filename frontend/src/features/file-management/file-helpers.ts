import type { FileItem } from '@/features/dashboard/types/file';

export const createFileItem = (
  id: string,
  name: string,
  extension: string,
  options?: {
    size?: FileItem['size'];
    lastModified?: Date;
    lastOpened?: Date;
    owner?: { id: string; name: string; email: string; avatar?: string };
    location?: { type: 'my-drive' | 'shared-with-me' | 'folder'; path: string; folderId?: string };
    isShared?: boolean;
    reasonSuggested?: string;
    thumbnail?: string;
  }
): FileItem => {
  return {
    id,
    name,
    extension,
    size: options?.size || {
      value: Math.floor(Math.random() * 1000000),
      unit: 'B',
    },
    lastModified: options?.lastModified || new Date(),
    lastOpened: options?.lastOpened,
    owner: options?.owner || {
      id: '1',
      name: 'me',
      email: 'user@example.com',
    },
    location: options?.location || {
      type: 'my-drive',
      path: 'My Drive',
    },
    isShared: options?.isShared || false,
    reasonSuggested: options?.reasonSuggested || 'Recently accessed',
    thumbnail: options?.thumbnail,
  };
};

// Mock suggested files data
export const mockSuggestedFiles: FileItem[] = [
  createFileItem('f1', 'Project Proposal.pdf', 'pdf', {
    reasonSuggested: 'Recently opened',
    isShared: true,
    owner: { id: '2', name: 'John Doe', email: 'john@example.com' },
  }),
  createFileItem('f2', 'Budget Spreadsheet.xlsx', 'xlsx', {
    reasonSuggested: 'Frequently accessed',
    location: { type: 'shared-with-me', path: 'Shared with me' },
  }),
  createFileItem('f3', 'Presentation.pptx', 'pptx', {
    reasonSuggested: 'Modified yesterday',
    isShared: true,
  }),
  createFileItem('f4', 'Meeting Notes.docx', 'docx', {
    reasonSuggested: 'Recently created',
  }),
  createFileItem('f5', 'Design Assets.zip', 'zip', {
    reasonSuggested: 'Shared with team',
    isShared: true,
    owner: { id: '3', name: 'Jane Smith', email: 'jane@example.com' },
  }),
  createFileItem('f6', 'Code Review.js', 'js', {
    reasonSuggested: 'Recently modified',
    location: { type: 'folder', path: 'Projects/Web', folderId: 'proj-web' },
  }),
  createFileItem('f7', 'Product Image.png', 'png', {
    reasonSuggested: 'Recently viewed',
    isShared: false,
  }),
  createFileItem('f8', 'Audio Recording.mp3', 'mp3', {
    reasonSuggested: 'Recently uploaded',
  }),
];
