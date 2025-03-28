import { useUser } from '@clerk/clerk-react';
import { AlertCircle, CheckCircle2, Cloud } from 'lucide-react';
import { useState } from 'react';
import { importCloudItems } from '../services/cloudSync';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';

export function CloudImportSection() {
  const { user } = useUser();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    status: 'success' | 'error' | null;
    count?: number;
  } | null>(null);
  
  const handleImport = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) {
      setResult({
        status: 'error',
        message: 'You need to be signed in with an email to import items'
      });
      return;
    }
    
    setImporting(true);
    setResult(null);
    
    try {
      const email = user.primaryEmailAddress.emailAddress;
      const clerkUserId = user.id;
      
      console.log(`Importing items for email: ${email}, clerkUserId: ${clerkUserId}`);
      const importedCount = await importCloudItems(email, clerkUserId);
      
      setResult({
        status: 'success',
        message: `Successfully imported ${importedCount} items from the extension.`,
        count: importedCount
      });
    } catch (error) {
      setResult({
        status: 'error',
        message: `Error importing items: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setImporting(false);
    }
  };
  
  if (!user) return null;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-5 w-5" />
          Extension Sync
        </CardTitle>
        <CardDescription>
          Import items saved with the BondWise browser extension
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          If you've saved articles using the BondWise browser extension, you can import them into your account.
          The extension should be configured with the same email address as your account ({user.primaryEmailAddress?.emailAddress}).
        </p>
        
        <Button 
          onClick={handleImport}
          disabled={importing}
          className="w-full sm:w-auto"
        >
          {importing ? 'Importing...' : 'Import from Extension'}
        </Button>
        
        {result && (
          <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            result.status === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {result.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <p>{result.message}</p>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground">
          <p>Don't have the extension yet? Download it from the Chrome Web Store to save articles while browsing.</p>
        </div>
      </CardContent>
    </Card>
  );
}
