'use client';

import { useState, useEffect } from 'react';
import { WikiService } from '@/features/wiki/services/wiki-service';
import { useApiS3 } from '@/hooks/use-auth';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { BookOpen, Search, FileText } from 'lucide-react';

interface WikiListProps {
  pages: string[];
  onSelectPage: (pageName: string) => void;
  onPagesLoaded: (pages: string[]) => void;
}

export function WikiList({ pages, onSelectPage, onPagesLoaded }: WikiListProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPages, setFilteredPages] = useState<string[]>([]);
  const apiS3 = useApiS3();

  useEffect(() => {
    if (apiS3) {
      loadPages();
    }
  }, [apiS3]);

  useEffect(() => {
    const filtered = pages.filter(page =>
      page.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredPages(filtered);
  }, [pages, searchQuery]);

  const loadPages = async () => {
    if (!apiS3) return;

    setIsLoading(true);
    try {
      const wikiService = new WikiService(apiS3);
      const wikiPages = await wikiService.listPages();
      onPagesLoaded(wikiPages);
    } catch (error) {
      console.error('Error loading wiki pages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-lg">Loading wiki pages...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search wiki pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Wiki Pages Grid */}
      {filteredPages.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery ? 'No pages found' : 'No wiki pages yet'}
          </h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery 
              ? `No pages match "${searchQuery}"`
              : 'Create your first wiki page to get started.'
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPages.map((pageName) => (
            <WikiPageCard
              key={pageName}
              pageName={pageName}
              onSelect={() => onSelectPage(pageName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface WikiPageCardProps {
  pageName: string;
  onSelect: () => void;
}

function WikiPageCard({ pageName, onSelect }: WikiPageCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={onSelect}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate">{pageName}</h3>
            <p className="text-sm text-muted-foreground">Wiki page</p>
          </div>
        </div>
      </div>
    </Card>
  );
}