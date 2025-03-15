
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { databases } from '@/services/db';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { toast } = useToast();
  const [isExportingData, setIsExportingData] = useState(false);
  
  const exportData = async () => {
    setIsExportingData(true);
    try {
      // Get all data from PouchDB
      const articles = await databases.articles.allDocs({ include_docs: true });
      const highlights = await databases.highlights.allDocs({ include_docs: true });
      const tags = await databases.tags.allDocs({ include_docs: true });
      
      // Create a JSON object with all data
      const exportData = {
        articles: articles.rows.map(row => row.doc),
        highlights: highlights.rows.map(row => row.doc),
        tags: tags.rows.map(row => row.doc),
        exportDate: new Date().toISOString()
      };
      
      // Convert to JSON string
      const dataStr = JSON.stringify(exportData, null, 2);
      
      // Create a download link
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bondwise-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export Complete',
        description: 'Your data has been exported successfully.',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'There was an error exporting your data.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingData(false);
    }
  };

  return (
    <div className="container py-8 max-w-3xl mx-auto">
      <div className="flex items-center mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold ml-2">Settings</h1>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dark-mode">Dark Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Coming soon
                </p>
              </div>
              <Switch id="dark-mode" disabled />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="font-size">Larger Text</Label>
                <p className="text-sm text-muted-foreground">
                  Coming soon
                </p>
              </div>
              <Switch id="font-size" disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sync">Sync (Coming Soon)</Label>
                <p className="text-sm text-muted-foreground">
                  Enable syncing between devices
                </p>
              </div>
              <Switch id="sync" disabled />
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Export Data</h3>
              <p className="text-sm text-muted-foreground">
                Download all your articles and highlights
              </p>
              <Button 
                onClick={exportData} 
                disabled={isExportingData}
              >
                {isExportingData ? 'Exporting...' : 'Export Data'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">BondWise</h3>
              <p className="text-sm text-muted-foreground">
                Version 0.1.0 (MVP)
              </p>
              <p className="text-sm text-muted-foreground">
                A local-first read-it-later application for power readers.
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Button variant="outline" className="gap-2">
                <HelpCircle className="h-4 w-4" />
                Help & Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
