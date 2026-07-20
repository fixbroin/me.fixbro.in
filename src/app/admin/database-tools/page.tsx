// src/app/admin/database-tools/page.tsx
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, UploadCloud, Download, Loader2, AlertTriangle, Image as ImageIcon, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { triggerRefresh } from '@/lib/revalidateUtils';
export default function DatabaseToolsPage() {
  const { toast } = useToast();
  const showToast = toast;
  
  const [isExportingDb, setIsExportingDb] = useState(false);
  const [isImportingDb, setIsImportingDb] = useState(false);
  const [dbFile, setDbFile] = useState<File | null>(null);

  const [isExportingImages, setIsExportingImages] = useState(false);
  const [isImportingImages, setIsImportingImages] = useState(false);
  const [imagesFile, setImagesFile] = useState<File | null>(null);

  const handleExportDb = async () => {
    setIsExportingDb(true);
    showToast({ title: "Exporting Database", description: "Generating your backup file..." });

    try {
      const response = await fetch('/api/admin/database/export');
      if (!response.ok) throw new Error("Database export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `database-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({ title: "Export Successful", description: "Database backup downloaded successfully." });
    } catch (error) {
      console.error(error);
      showToast({ title: "Export Failed", description: (error as Error).message || "Could not export database.", variant: "destructive" });
    } finally {
      setIsExportingDb(false);
    }
  };

  const handleImportDb = async () => {
    if (!dbFile) return;
    setIsImportingDb(true);
    showToast({ title: "Importing Database", description: "Wiping existing tables and restoring data..." });

    try {
      const formData = new FormData();
      formData.append('file', dbFile);

      const response = await fetch('/api/admin/database/import', {
        method: 'POST',
        body: formData
      });

      const resText = await response.text();
      let resJson: any = {};
      try {
        resJson = JSON.parse(resText);
      } catch {
        if (resText.includes('413') || resText.toLowerCase().includes('too large')) {
          throw new Error("File too large for Nginx (max 1MB). Increase client_max_body_size in Nginx.");
        }
        throw new Error("Server returned HTML error page instead of JSON.");
      }

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "Database import failed");
      }

      await triggerRefresh('global-cache');
      showToast({ title: "Import Successful", description: `Restored ${resJson.count || 0} table records successfully.` });
      setDbFile(null);
      const fileInput = document.getElementById('db-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error(error);
      showToast({ title: "Import Failed", description: (error as Error).message || "Could not import database.", variant: "destructive" });
    } finally {
      setIsImportingDb(false);
    }
  };

  const handleExportImages = async () => {
    setIsExportingImages(true);
    showToast({ title: "Backing Up Images", description: "Compressing public/uploads folder into a ZIP..." });

    try {
      const response = await fetch('/api/admin/images/export');
      if (!response.ok) throw new Error("Images backup failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `images-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({ title: "Backup Successful", description: "Images zip backup downloaded successfully." });
    } catch (error) {
      console.error(error);
      showToast({ title: "Backup Failed", description: (error as Error).message || "Could not backup images.", variant: "destructive" });
    } finally {
      setIsExportingImages(false);
    }
  };

  const handleImportImages = async () => {
    if (!imagesFile) return;
    setIsImportingImages(true);
    showToast({ title: "Restoring Images", description: "Extracting ZIP archive and restoring directories..." });

    try {
      const formData = new FormData();
      formData.append('file', imagesFile);

      const response = await fetch('/api/admin/images/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Images import failed");
      }

      showToast({ title: "Restore Successful", description: "All images and folder structures restored successfully." });
      setImagesFile(null);
      const fileInput = document.getElementById('images-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error(error);
      showToast({ title: "Restore Failed", description: (error as Error).message || "Could not restore images.", variant: "destructive" });
    } finally {
      setIsImportingImages(false);
    }
  };

  const [isMigratingFirebase, setIsMigratingFirebase] = useState(false);

  const handleMigrateFirebase = async () => {
    setIsMigratingFirebase(true);
    showToast({ title: "Migrating Data", description: "Fetching documents from Firebase Firestore and merging into MySQL..." });

    try {
      const res = await fetch('/api/admin/database/migrate-firebase-to-mysql', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Migration failed");
      }

      await triggerRefresh('global-cache');
      showToast({ title: "Migration Complete!", description: data.message || "All Firebase data merged into MySQL!" });
    } catch (err) {
      console.error(err);
      showToast({ title: "Migration Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsMigratingFirebase(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" /> Database & Images Management Tools
        </h1>
        <p className="text-muted-foreground text-sm">
          Export, import, merge, and backup your MySQL database, images archive, and Firebase data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FIREBASE MIGRATION CARD */}
        <Card className="md:col-span-2 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center text-lg text-primary">
              <Database className="mr-2 h-5 w-5" /> Merge Firebase Data to MySQL
            </CardTitle>
            <CardDescription>
              Copy and merge all collections and documents from your Firebase Firestore directly into your local MySQL database tables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50/50 border-blue-100 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-300">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertTitle>Full Data Synchronization</AlertTitle>
              <AlertDescription>
                This process reads all existing categories, services, subcategories, bookings, users, settings, slides, and FAQs from Firebase Firestore and writes them into your MySQL tables.
              </AlertDescription>
            </Alert>
            <PermissionGuard moduleId="database_tools" action="write">
              <Button
                onClick={handleMigrateFirebase}
                disabled={isMigratingFirebase}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-6 text-base"
              >
                {isMigratingFirebase ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Database className="mr-2 h-5 w-5" />}
                {isMigratingFirebase ? "Migrating All Firebase Data to MySQL..." : "Migrate & Merge All Firebase Data to MySQL"}
              </Button>
            </PermissionGuard>
          </CardContent>
        </Card>

        {/* DATABASE EXPORT & IMPORT CARD */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Database className="mr-2 h-5 w-5 text-primary" /> Database Export & Restore
            </CardTitle>
            <CardDescription>
              Export your MySQL tables to a JSON backup or restore from a previously exported backup file.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 flex-grow">
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>JSON Backup File</AlertTitle>
              <AlertDescription>
                Exports all MySQL tables and JSON records into a single structured backup file.
              </AlertDescription>
            </Alert>

            <div className="p-4 border border-dashed rounded-lg flex flex-col items-center justify-center space-y-3 bg-muted/20">
              <Database className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">Export complete MySQL database snapshot.</p>
              <Button onClick={handleExportDb} disabled={isExportingDb} variant="secondary" size="sm" className="w-full">
                {isExportingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExportingDb ? "Exporting..." : "Download Database Backup (.json)"}
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Restore Database</Label>
              <Alert className="py-2 bg-yellow-50 border-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-xs">
                  Restoring will overwrite matching table records with data from the uploaded file.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Input 
                  id="db-file-input" 
                  type="file" 
                  accept=".json" 
                  onChange={(e) => setDbFile(e.target.files?.[0] || null)} 
                  disabled={isImportingDb}
                  className="cursor-pointer"
                />
              </div>
              <PermissionGuard moduleId="database_tools" action="write">
                <Button 
                  onClick={handleImportDb} 
                  disabled={isImportingDb || !dbFile} 
                  variant="destructive"
                  className="w-full"
                >
                  {isImportingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isImportingDb ? "Restoring..." : "Restore Database"}
                </Button>
              </PermissionGuard>
            </div>
          </CardContent>
        </Card>

        {/* IMAGES BACKUP CARD */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <ImageIcon className="mr-2 h-5 w-5 text-emerald-500" /> Images Backup & Restore
            </CardTitle>
            <CardDescription>
              Backup your uploaded media assets folder or extract a restore file.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 flex-grow">
            <Alert className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
              <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">ZIP File Restoration</AlertTitle>
              <AlertDescription className="text-emerald-700/80 dark:text-emerald-400/80">
                Packs/extracts files under <code className="text-[11px] font-mono bg-emerald-100/50 px-1 py-0.5 rounded dark:bg-emerald-900/50">public/uploads</code>. Recreates matching subdirectory paths.
              </AlertDescription>
            </Alert>

            <div className="p-4 border border-dashed rounded-lg flex flex-col items-center justify-center space-y-3 bg-muted/20">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">Export public/uploads folder structure.</p>
              <Button onClick={handleExportImages} disabled={isExportingImages} variant="secondary" size="sm" className="w-full">
                {isExportingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExportingImages ? "Creating Zip..." : "Download Images Backup (.zip)"}
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Restore from Archive</Label>
              <Alert className="py-2 bg-yellow-50 border-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-xs">
                  Existing images with matching filenames will be overwritten.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Input 
                  id="images-file-input" 
                  type="file" 
                  accept=".zip" 
                  onChange={(e) => setImagesFile(e.target.files?.[0] || null)} 
                  disabled={isImportingImages}
                  className="cursor-pointer"
                />
              </div>
              <PermissionGuard moduleId="database_tools" action="write">
                <Button 
                  onClick={handleImportImages} 
                  disabled={isImportingImages || !imagesFile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isImportingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isImportingImages ? "Uploading & Restoring..." : "Restore Images Archive"}
                </Button>
              </PermissionGuard>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
