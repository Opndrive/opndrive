'use client';

import { useState } from 'react';
import { WikiList } from '@/features/wiki/components/wiki-list';
import { WikiEditor } from '@/features/wiki/components/wiki-editor';
import { Button } from '@/shared/components/ui/button';
import { Plus, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function WikiPage() {
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [wikiPages, setWikiPages] = useState<string[]>([]);
  const { userCreds } = useAuth();

  const handleCreateNew = () => {
    setSelectedPage(null);
    setIsCreating(true);
  };

  const handleSelectPage = (pageName: string) => {
    setSelectedPage(pageName);
    setIsCreating(false);
  };

  const handlePageCreated = (pageName: string) => {
    setWikiPages(prev => [...prev, pageName]);
    setSelectedPage(pageName);
    setIsCreating(false);
  };

  const handleBackToList = () => {
    setSelectedPage(null);
    setIsCreating(false);
  };

  if (!userCreds) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isCreating || selectedPage) {
    return (
      <WikiEditor
        pageName={selectedPage}
        onBack={handleBackToList}
        onPageCreated={handlePageCreated}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Wiki</h1>
            <p className="text-muted-foreground">
              Create and manage your knowledge base
            </p>
          </div>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="h-4 w-4" />
          New Page
        </Button>
      </div>

      <WikiList
        pages={wikiPages}
        onSelectPage={handleSelectPage}
        onPagesLoaded={setWikiPages}
      />
    </div>
  );
}