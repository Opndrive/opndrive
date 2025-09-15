import { BYOS3ApiProvider } from '@opndrive/s3-api';

export interface WikiPage {
  name: string;
  path: string;
  content: string;
  lastModified: Date;
  size: number;
}

export class WikiService {
  private api: BYOS3ApiProvider;
  private wikiPrefix = 'wiki/';

  constructor(api: BYOS3ApiProvider) {
    this.api = api;
  }

  /**
   * List all wiki pages
   */
  async listPages(): Promise<string[]> {
    try {
      const directory = await this.api.fetchDirectoryStructure(this.wikiPrefix, 1000);
      const pages = directory.files
        .filter(file => file.Key?.endsWith('.md'))
        .map(file => {
          const key = file.Key!;
          const fileName = key.replace(this.wikiPrefix, '');
          return fileName.replace('.md', '');
        });
      
      return pages;
    } catch (error) {
      console.error('Error listing wiki pages:', error);
      return [];
    }
  }

  /**
   * Get a wiki page content
   */
  async getPage(pageName: string): Promise<WikiPage | null> {
    try {
      const fileName = `${pageName}.md`;
      const filePath = `${this.wikiPrefix}${fileName}`;
      
      // Get file metadata
      const metadata = await this.api.fetchMetadata(filePath);
      if (!metadata) {
        return null;
      }

      // Download file content
      const content = await this.api.downloadFile({ 
        key: filePath
      });
      
      const textContent = typeof content === 'string' ? content : 
                         content instanceof Blob ? await content.text() :
                         content instanceof Buffer ? content.toString('utf-8') :
                         new TextDecoder().decode(content);

      return {
        name: pageName,
        path: filePath,
        content: textContent,
        lastModified: metadata.LastModified || new Date(),
        size: metadata.ContentLength || 0,
      };
    } catch (error) {
      console.error(`Error getting wiki page ${pageName}:`, error);
      return null;
    }
  }

  /**
   * Save a wiki page
   */
  async savePage(pageName: string, content: string): Promise<boolean> {
    try {
      const fileName = `${pageName}.md`;
      const filePath = `${this.wikiPrefix}${fileName}`;
      
      // Get presigned URL
      const presignedUrl = await this.api.uploadWithPreSignedUrl({
        key: filePath,
        expiresInSeconds: 300, // 5 minutes
      });

      if (!presignedUrl) {
        throw new Error('Failed to get presigned URL');
      }

      // Upload the content
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: content,
        headers: {
          'Content-Type': 'text/markdown',
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error(`Error saving wiki page ${pageName}:`, error);
      return false;
    }
  }

  /**
   * Delete a wiki page
   */
  async deletePage(pageName: string): Promise<boolean> {
    try {
      const filePath = `${this.wikiPrefix}${pageName}.md`;
      await this.api.deleteFile(filePath);
      return true;
    } catch (error) {
      console.error(`Error deleting wiki page ${pageName}:`, error);
      return false;
    }
  }

  /**
   * Rename a wiki page
   */
  async renamePage(oldName: string, newName: string): Promise<boolean> {
    try {
      const oldPath = `${this.wikiPrefix}${oldName}.md`;
      const newPath = `${this.wikiPrefix}${newName}.md`;
      
      await this.api.moveFile({
        oldKey: oldPath,
        newKey: newPath,
      });

      return true;
    } catch (error) {
      console.error(`Error renaming wiki page from ${oldName} to ${newName}:`, error);
      return false;
    }
  }

  /**
   * Search wiki pages
   */
  async searchPages(query: string): Promise<string[]> {
    try {
      const pages = await this.listPages();
      return pages.filter(page => 
        page.toLowerCase().includes(query.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching wiki pages:', error);
      return [];
    }
  }
}