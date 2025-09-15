'use client';

import { useState, useEffect } from 'react';
import { WikiService, WikiPage } from '@/features/wiki/services/wiki-service';
import { useApiS3 } from '@/hooks/use-auth';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card } from '@/shared/components/ui/card';
import { ArrowLeft, Save, Eye, Edit, Trash2 } from 'lucide-react';

interface WikiEditorProps {
  pageName: string | null;
  onBack: () => void;
  onPageCreated: (pageName: string) => void;
}

export function WikiEditor({ pageName, onBack, onPageCreated }: WikiEditorProps) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const [newPageName, setNewPageName] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const apiS3 = useApiS3();

  const isNewPage = !pageName;
  const currentPageName = pageName || newPageName;

  useEffect(() => {
    if (pageName && apiS3) {
      loadPage();
    }
  }, [pageName, apiS3]);

  const loadPage = async () => {
    if (!apiS3 || !pageName) return;

    setIsLoading(true);
    try {
      const wikiService = new WikiService(apiS3);
      const wikiPage = await wikiService.getPage(pageName);
      if (wikiPage) {
        setPage(wikiPage);
        setContent(wikiPage.content);
      }
    } catch (error) {
      console.error('Error loading wiki page:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePage = async () => {
    if (!apiS3 || !currentPageName.trim()) return;

    setIsSaving(true);
    setSaveMessage('');
    
    try {
      const wikiService = new WikiService(apiS3);
      const success = await wikiService.savePage(currentPageName.trim(), content);
      
      if (success) {
        setSaveMessage('Page saved successfully!');
        if (isNewPage) {
          onPageCreated(currentPageName.trim());
        } else {
          // Reload the page to get updated metadata
          await loadPage();
        }
        
        // Clear the success message after 3 seconds
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('Failed to save page. Please try again.');
      }
    } catch (error) {
      console.error('Error saving wiki page:', error);
      setSaveMessage('Failed to save page. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePage = async () => {
    if (!apiS3 || !pageName || !confirm(`Are you sure you want to delete "${pageName}"?`)) return;

    try {
      const wikiService = new WikiService(apiS3);
      const success = await wikiService.deletePage(pageName);
      if (success) {
        onBack();
      }
    } catch (error) {
      console.error('Error deleting wiki page:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-lg">Loading page...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Wiki
          </Button>
          
          {isNewPage && (
            <Input
              placeholder="Page name..."
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              className="w-64"
            />
          )}
          
          {!isNewPage && (
            <h1 className="text-2xl font-bold">{pageName}</h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPreview(!isPreview)}
          >
            {isPreview ? <Edit className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {isPreview ? 'Edit' : 'Preview'}
          </Button>
          
          {!isNewPage && (
            <Button variant="outline" size="sm" onClick={deletePage}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          
          <Button 
            onClick={savePage} 
            disabled={isSaving || (!isNewPage && !currentPageName.trim())}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          saveMessage.includes('success') 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* Editor/Preview */}
      <Card className="min-h-96">
        {isPreview ? (
          <div className="p-6">
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap font-sans">{content || 'No content to preview.'}</pre>
            </div>
          </div>
        ) : (
          <div className="p-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Write your ${isNewPage ? 'new page' : 'page'} content here...

# Page Title

This is a **markdown** page. You can use:

- Lists
- **Bold** and *italic* text
- [Links](https://example.com)
- \`code\`

## Sections

Add your content here...`}
              className="w-full h-96 p-6 border-none outline-none resize-none font-mono text-sm"
              style={{ minHeight: '24rem' }}
            />
          </div>
        )}
      </Card>

      {/* Page Info */}
      {page && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Last modified: {page.lastModified.toLocaleString()}</p>
          <p>Size: {(page.size / 1024).toFixed(1)} KB</p>
        </div>
      )}
    </div>
  );
}