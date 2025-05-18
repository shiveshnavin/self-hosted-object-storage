
"use client";

import type { FileSystemItem } from '@/lib/file-system';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Folder, File as FileIcon, Trash2, KeyRound, UploadCloud, ArrowLeft, Copy, Home, RefreshCw } from 'lucide-react';
import path from 'path-browserify'; // Using path-browserify for client-side path manipulation

interface GeneratedTokenInfo {
  accessToken: string;
  pathPrefix: string;
  expiresAt: string; // Can be ISO string or "Never Expires"
  accessUrlPreview: string;
}

export default function FileBrowserClient() {
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadPathPrefix, setUploadPathPrefix] = useState('');
  
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [tokenPathPrefix, setTokenPathPrefix] = useState('');
  const [tokenExpiresInHours, setTokenExpiresInHours] = useState<number>(24);
  const [generatedTokenInfo, setGeneratedTokenInfo] = useState<GeneratedTokenInfo | null>(null);

  const [itemToDelete, setItemToDelete] = useState<FileSystemItem | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);

  const fetchFiles = useCallback(async (p: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/list-files?path=${encodeURIComponent(p)}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const data: FileSystemItem[] = await response.json();
      setItems(data);
      setCurrentPath(p);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [fetchFiles]); // Only fetchFiles and currentPath are stable dependencies initially

  const handleNavigate = (item: FileSystemItem) => {
    if (item.type === 'folder') {
      fetchFiles(item.path);
    }
  };

  const handleGoUp = () => {
    if (currentPath === '') return;
    const parentPath = path.dirname(currentPath);
    fetchFiles(parentPath === '.' ? '' : parentPath);
  };
  
  const handleGoHome = () => {
    fetchFiles('');
  };

  const handleRefresh = () => {
    fetchFiles(currentPath);
  };

  const openUploadDialog = () => {
    setUploadPathPrefix(currentPath.endsWith('/') || currentPath === '' ? currentPath : currentPath + '/');
    setIsUploadDialogOpen(true);
  };

  const handleUpload = async () => {
    if (!fileToUpload) {
      toast({ title: 'No file selected', variant: 'destructive' });
      return;
    }

    let targetPath = path.join(uploadPathPrefix, fileToUpload.name).replace(/\\/g, '/');
    
    // First, generate a token for the uploadPathPrefix (if it's a directory) or for the target file itself
    let tokenForUpload: string;
    try {
      const tokenResponse = await fetch('/api/admin/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathPrefix: uploadPathPrefix || '/', expiresInHours: 1 }), // Short-lived token for upload
      });
      if (!tokenResponse.ok) throw new Error('Failed to generate upload token');
      const tokenData = await tokenResponse.json();
      tokenForUpload = tokenData.accessToken;
    } catch (error: any) {
      toast({ title: 'Upload Error', description: `Token generation failed: ${error.message}`, variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const uploadResponse = await fetch(`/api/files/${tokenForUpload}/${targetPath}`, {
        method: 'PATCH',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      toast({ title: 'Success', description: `${fileToUpload.name} uploaded.` });
      fetchFiles(currentPath); // Refresh list
      setIsUploadDialogOpen(false);
      setFileToUpload(null);
    } catch (error: any) {
      toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
    }
  };
  
  const openGenerateTokenDialog = (item?: FileSystemItem) => {
    const prefix = item ? item.path : currentPath;
    setTokenPathPrefix(prefix.endsWith('/') || prefix === '' || (item && item.type === 'folder') ? prefix : prefix + '/');
    setGeneratedTokenInfo(null);
    setTokenExpiresInHours(24); // Reset to default when opening dialog
    setIsTokenDialogOpen(true);
  };

  const handleGenerateToken = async () => {
    try {
      const response = await fetch('/api/admin/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathPrefix: tokenPathPrefix, expiresInHours: tokenExpiresInHours }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate token');
      }
      const data: GeneratedTokenInfo = await response.json();
      setGeneratedTokenInfo(data);
      toast({ title: 'Token Generated', description: `Token for ${data.pathPrefix} created.` });
    } catch (error: any) {
      toast({ title: 'Token Generation Error', description: error.message, variant: 'destructive' });
    }
  };

  const openConfirmDeleteDialog = (item: FileSystemItem) => {
    setItemToDelete(item);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      const response = await fetch('/api/admin/delete-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemToDelete.path }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete item');
      }
      toast({ title: 'Success', description: `${itemToDelete.name} deleted.` });
      fetchFiles(currentPath); // Refresh
      setIsConfirmDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (error: any) {
      toast({ title: 'Delete Error', description: error.message, variant: 'destructive' });
    }
  };

  const formatBytes = (bytes: number | undefined, decimals = 2) => {
    if (bytes === undefined) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast({ title: 'Copied!', description: 'Content copied to clipboard.' }))
      .catch(() => toast({ title: 'Error', description: 'Failed to copy.', variant: 'destructive' }));
  };

  return (
    <div className="container mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-primary">FileHaven Admin</h1>
        <p className="text-muted-foreground">Manage your files and pre-authenticated URLs.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <Button onClick={handleGoHome} variant="outline" size="icon" disabled={isLoading}><Home /></Button>
        <Button onClick={handleGoUp} variant="outline" size="icon" disabled={currentPath === '' || isLoading}><ArrowLeft /></Button>
        <Button onClick={handleRefresh} variant="outline" size="icon" disabled={isLoading}><RefreshCw className={isLoading ? 'animate-spin' : ''} /></Button>
        <Input type="text" value={currentPath || '/'} readOnly className="flex-grow min-w-[200px] bg-muted" />
        <Button onClick={openUploadDialog} className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isLoading}><UploadCloud className="mr-2" /> Upload File</Button>
        <Button onClick={() => openGenerateTokenDialog()} variant="outline" disabled={isLoading}><KeyRound className="mr-2" /> Generate Token</Button>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <Card className="shadow-lg">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                      This folder is empty.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell>
                      {item.type === 'folder' ? <Folder className="text-primary" /> : <FileIcon className="text-muted-foreground" />}
                    </TableCell>
                    <TableCell>
                      <Button variant="link" onClick={() => handleNavigate(item)} className="p-0 h-auto text-foreground hover:text-primary">
                        {item.name}
                      </Button>
                    </TableCell>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell>{formatBytes(item.size)}</TableCell>
                    <TableCell>{item.lastModified ? new Date(item.lastModified).toLocaleString() : 'N/A'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button onClick={() => openGenerateTokenDialog(item)} variant="ghost" size="icon" title="Generate Token">
                        <KeyRound className="h-4 w-4 text-accent" />
                      </Button>
                      <Button onClick={() => openConfirmDeleteDialog(item)} variant="ghost" size="icon" title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>Select a file to upload. It will be placed in the specified path.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="uploadPathPrefix">Target Path Prefix</Label>
              <Input id="uploadPathPrefix" value={uploadPathPrefix} onChange={(e) => setUploadPathPrefix(e.target.value)} placeholder="e.g., images/avatars/ (ends with / for folder)" />
               <p className="text-xs text-muted-foreground">File will be uploaded to: {uploadPathPrefix}{fileToUpload?.name || '[filename]'}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fileUpload">File</Label>
              <Input id="fileUpload" type="file" onChange={(e) => setFileToUpload(e.target.files ? e.target.files[0] : null)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleUpload} disabled={!fileToUpload || !uploadPathPrefix.trim()} className="bg-accent hover:bg-accent/90">Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Token Dialog */}
      <Dialog open={isTokenDialogOpen} onOpenChange={(isOpen) => { setIsTokenDialogOpen(isOpen); if (!isOpen) setGeneratedTokenInfo(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Pre-authenticated Token</DialogTitle>
            <DialogDescription>Create a token for accessing files under a specific path prefix. Use 0 hours for a non-expiring token.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="tokenPathPrefix">Path Prefix</Label>
              <Input id="tokenPathPrefix" value={tokenPathPrefix} onChange={(e) => setTokenPathPrefix(e.target.value)} placeholder="e.g., documents/projectA/" />
              <p className="text-xs text-muted-foreground">Token will grant access to this path and its contents. For a folder, end with '/'. For a specific file, provide the full file path.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tokenExpires">Expires In (hours)</Label>
              <Input id="tokenExpires" type="number" value={tokenExpiresInHours} onChange={(e) => setTokenExpiresInHours(Number(e.target.value))} min="0" />
               <p className="text-xs text-muted-foreground">Enter 0 for a token that never expires.</p>
            </div>
          </div>
          {generatedTokenInfo && (
            <div className="mt-4 p-3 bg-muted rounded-md space-y-2">
              <p className="text-sm font-semibold">Token Generated Successfully:</p>
              <div>
                <Label className="text-xs">Access Token:</Label>
                <div className="flex items-center gap-2">
                  <Input type="text" readOnly value={generatedTokenInfo.accessToken} className="text-xs truncate" />
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(generatedTokenInfo.accessToken)}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div>
                 <Label className="text-xs">Effective Path Prefix:</Label>
                 <Input type="text" readOnly value={generatedTokenInfo.pathPrefix} className="text-xs" />
              </div>
              <div>
                <Label className="text-xs">Example Access URL Base:</Label>
                 <div className="flex items-center gap-2">
                  <Input type="text" readOnly value={`${window.location.origin}/api/files/${generatedTokenInfo.accessToken}/${generatedTokenInfo.pathPrefix}`} className="text-xs truncate" />
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(`${window.location.origin}/api/files/${generatedTokenInfo.accessToken}/${generatedTokenInfo.pathPrefix}`)}><Copy className="h-4 w-4" /></Button>
                </div>
                 <p className="text-xs text-muted-foreground">Append specific file names to this base URL to access them. E.g., .../{generatedTokenInfo.pathPrefix}<strong>yourfile.txt</strong></p>
              </div>
              <p className="text-xs">Expires At: {generatedTokenInfo.expiresAt === 'Never Expires' ? 'Never Expires' : new Date(generatedTokenInfo.expiresAt).toLocaleString()}</p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
            <Button onClick={handleGenerateToken} disabled={!tokenPathPrefix.trim()} className="bg-accent hover:bg-accent/90">Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{itemToDelete?.name}&quot;?
              {itemToDelete?.type === 'folder' && " This will delete all its contents."} This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleDelete} variant="destructive">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Added Shadcn components used in this file for completeness if they were not scaffolded.
// Assuming these are already available via @/components/ui
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
