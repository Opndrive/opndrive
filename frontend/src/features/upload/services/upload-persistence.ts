/**
 * Upload Persistence Service
 *
 * Handles persistent storage of upload state and file metadata
 * Uses IndexedDB for robust client-side persistence
 */

interface UploadMetadata {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled' | 'paused';
  error?: string;
  destination: string;
  extension?: string;
  uploadedFiles?: number;
  totalFiles?: number;
  createdAt: number;
  updatedAt: number;
  // File-specific metadata for reconstruction
  fileMetadata?: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  // Folder-specific metadata
  folderMetadata?: {
    fileList: Array<{
      name: string;
      size: number;
      type: string;
      lastModified: number;
      webkitRelativePath: string;
    }>;
  };
}

class UploadPersistenceService {
  private dbName = 'opndrive-uploads';
  private version = 1;
  private storeName = 'uploads';
  private db: IDBDatabase | null = null;
  private fileCache = new Map<string, File[]>();

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  async saveUpload(
    id: string,
    metadata: Omit<UploadMetadata, 'id' | 'createdAt' | 'updatedAt'>,
    files?: File[]
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const uploadMetadata: UploadMetadata = {
      ...metadata,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Cache files separately (not in IndexedDB due to serialization issues)
    if (files && files.length > 0) {
      this.fileCache.set(id, files);

      // Store file metadata for reconstruction
      if (metadata.type === 'file' && files[0]) {
        uploadMetadata.fileMetadata = {
          name: files[0].name,
          size: files[0].size,
          type: files[0].type,
          lastModified: files[0].lastModified,
        };
      } else if (metadata.type === 'folder') {
        uploadMetadata.folderMetadata = {
          fileList: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            webkitRelativePath: file.webkitRelativePath || '',
          })),
        };
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(uploadMetadata);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async updateUpload(id: string, updates: Partial<UploadMetadata>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getUpload(id);
    if (!existing) throw new Error(`Upload ${id} not found`);

    const updated: UploadMetadata = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(updated);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getUpload(id: string): Promise<UploadMetadata | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllUploads(): Promise<UploadMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async getUploadFiles(id: string): Promise<File[] | null> {
    return this.fileCache.get(id) || null;
  }

  async deleteUpload(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Remove from file cache
    this.fileCache.delete(id);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearCompleted(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const uploads = await this.getAllUploads();
    const completedIds = uploads
      .filter(
        (upload) =>
          upload.status === 'completed' ||
          upload.status === 'error' ||
          upload.status === 'cancelled'
      )
      .map((upload) => upload.id);

    const promises = completedIds.map((id) => this.deleteUpload(id));
    await Promise.all(promises);
  }

  async getActiveUploads(): Promise<UploadMetadata[]> {
    const uploads = await this.getAllUploads();
    return uploads.filter(
      (upload) =>
        upload.status === 'uploading' || upload.status === 'pending' || upload.status === 'paused'
    );
  }

  // Clean up old uploads (older than 7 days)
  async cleanup(): Promise<void> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const uploads = await this.getAllUploads();

    const oldUploads = uploads.filter(
      (upload) =>
        upload.updatedAt < sevenDaysAgo &&
        (upload.status === 'completed' ||
          upload.status === 'error' ||
          upload.status === 'cancelled')
    );

    const promises = oldUploads.map((upload) => this.deleteUpload(upload.id));
    await Promise.all(promises);
  }
}

export const uploadPersistence = new UploadPersistenceService();
export type { UploadMetadata };
