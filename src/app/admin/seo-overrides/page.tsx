"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, PackageSearch, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CityCategorySeoSetting, AreaCategorySeoSetting, FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import CityCategorySeoForm, { type CityCategorySeoFormData } from '@/components/admin/CityCategorySeoForm';
import AreaCategorySeoForm, { type AreaCategorySeoFormData } from '@/components/admin/AreaCategorySeoForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where, getDoc } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getCache, setCache } from '@/lib/client-cache';
import { getAdminCategories, getCities, getAreas, getCityCategorySeoSettings, getAreaCategorySeoSettings } from '@/lib/webServerUtils';

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

export default function SeoOverridesPage() {
  const [activeTab, setActiveTab] = useState<string>("city-category");
  const [cityCategorySettings, setCityCategorySettings] = useState<CityCategorySeoSetting[]>([]);
  const [areaCategorySettings, setAreaCategorySettings] = useState<AreaCategorySeoSetting[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [areas, setAreas] = useState<FirestoreArea[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<CityCategorySeoSetting | AreaCategorySeoSetting | null>(null);
  const [formType, setFormType] = useState<'cityCategory' | 'areaCategory' | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const cityCatSeoRef = collection(db, "cityCategorySeoSettings");
  const areaCatSeoRef = collection(db, "areaCategorySeoSettings");

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // --- SmartSync: Version Checking ---
      let remoteVersion = 0;
      if (!forceRefresh) {
        try {
          const versionDocRef = doc(db, "appConfiguration", "cacheVersions");
          const versionSnap = await getDoc(versionDocRef);
          if (versionSnap.exists()) {
            remoteVersion = versionSnap.data().seoSettings || 0;
          }
        } catch (e) { console.warn("Failed to fetch cache versions:", e); }

        const localVersionKey = 'admin-seo-overrides-full-version';
        const localVersion = parseInt(localStorage.getItem(localVersionKey) || "0");
        const cachedCats = getCache<FirestoreCategory[]>('admin-cats-for-seo', true);
        const cachedCities = getCache<FirestoreCity[]>('admin-cities-for-seo', true);
        const cachedAreas = getCache<FirestoreArea[]>('admin-areas-for-seo', true);
        const cachedCitySeo = getCache<CityCategorySeoSetting[]>('admin-city-category-seo', true);
        const cachedAreaSeo = getCache<AreaCategorySeoSetting[]>('admin-area-category-seo', true);

        if (cachedCats && cachedCities && cachedAreas && cachedCitySeo && cachedAreaSeo && remoteVersion <= localVersion) {
          setCategories(cachedCats);
          setCities(cachedCities);
          setAreas(cachedAreas);
          setCityCategorySettings(cachedCitySeo);
          setAreaCategorySettings(cachedAreaSeo);
          setIsLoading(false);
          return;
        }
      }

      // Use Server-Side Cache + Client-Side Cache
      const [fetchedCats, fetchedCities, fetchedAreas, fetchedCitySeo, fetchedAreaSeo] = await Promise.all([
        getAdminCategories(),
        getCities(),
        getAreas(),
        getCityCategorySeoSettings(),
        getAreaCategorySeoSettings()
      ]);

      setCategories(fetchedCats);
      setCities(fetchedCities);
      setAreas(fetchedAreas);
      setCityCategorySettings(fetchedCitySeo);
      setAreaCategorySettings(fetchedAreaSeo);

      // Update local cache
      if (!forceRefresh) {
        setCache('admin-cats-for-seo', fetchedCats, true);
        setCache('admin-cities-for-seo', fetchedCities, true);
        setCache('admin-areas-for-seo', fetchedAreas, true);
        setCache('admin-city-category-seo', fetchedCitySeo, true);
        setCache('admin-area-category-seo', fetchedAreaSeo, true);
        localStorage.setItem('admin-seo-overrides-full-version', remoteVersion.toString());
      }
    } catch (error) {
      console.error("Error fetching SEO override data:", error);
      toast({ title: "Error", description: "Could not load SEO override data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSetting = (type: 'cityCategory' | 'areaCategory') => {
    setEditingSetting(null);
    setFormType(type);
    setIsFormOpen(true);
  };

  const handleEditSetting = (setting: CityCategorySeoSetting | AreaCategorySeoSetting, type: 'cityCategory' | 'areaCategory') => {
    setEditingSetting(setting);
    setFormType(type);
    setIsFormOpen(true);
  };

  const handleDeleteSetting = async (id: string, type: 'cityCategory' | 'areaCategory') => {
    setIsSubmitting(true);
    const collectionRef = type === 'cityCategory' ? cityCatSeoRef : areaCatSeoRef;
    try {
      const setting = type === 'cityCategory' 
        ? cityCategorySettings.find(s => s.id === id)
        : areaCategorySettings.find(s => s.id === id);
      await deleteDoc(doc(collectionRef, id));
      await triggerRefresh('seo-settings');
      
      if (setting) {
        const city = cities.find(c => c.id === setting.cityId);
        const category = categories.find(c => c.id === setting.categoryId);
        if (type === 'cityCategory') {
          if (city?.slug && category?.slug) {
            await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, false);
          }
        } else {
          const area = areas.find(a => a.id === (setting as AreaCategorySeoSetting).areaId);
          if (city?.slug && area?.slug && category?.slug) {
            await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, false);
          }
        }
      }
      
      toast({ title: "Success", description: "SEO override deleted successfully." });
      await fetchData(true); // Force refresh
    } catch (error) {
      toast({ title: "Error", description: "Could not delete SEO override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (setting: CityCategorySeoSetting | AreaCategorySeoSetting, type: 'cityCategory' | 'areaCategory') => {
    setIsSubmitting(true);
    const collectionRef = type === 'cityCategory' ? cityCatSeoRef : areaCatSeoRef;
    try {
        await updateDoc(doc(collectionRef, setting.id!), { isActive: !setting.isActive, updatedAt: Timestamp.now() });
        await triggerRefresh('seo-settings');
        
        const city = cities.find(c => c.id === setting.cityId);
        const category = categories.find(c => c.id === setting.categoryId);
        if (type === 'cityCategory') {
          if (city?.slug && category?.slug) {
            await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, !setting.isActive);
          }
        } else {
          const area = areas.find(a => a.id === (setting as AreaCategorySeoSetting).areaId);
          if (city?.slug && area?.slug && category?.slug) {
            await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, !setting.isActive);
          }
        }
        
        toast({ title: "Success", description: "Status updated."});
        await fetchData(true);
    } catch (error) {
        toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleCityCategoryFormSubmit = async (data: CityCategorySeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const category = categories.find(c => c.id === data.categoryId);
    if (!city || !category) {
      toast({ title: "Error", description: "Selected city or category not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const basePayload: Omit<CityCategorySeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
        cityId: data.cityId,
        cityName: city.name,
        categoryId: data.categoryId,
        categoryName: category.name,
        slug: data.slug || generateSeoSlug([city.slug, category.slug]),
        h1_title: data.h1_title,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        meta_keywords: data.meta_keywords,
        seo_content: data.seo_content,
        faqs: data.faqs,
        imageHint: data.imageHint,
        isActive: data.isActive,
    };

    try {
      if (data.id) { 
        await updateDoc(doc(cityCatSeoRef, data.id), { ...basePayload, updatedAt: Timestamp.now() });
      } else { 
        const q = query(cityCatSeoRef, where("cityId", "==", data.cityId), where("categoryId", "==", data.categoryId));
        const snap = await getDocs(q);
        if (!snap.empty) {
           toast({ title: "Duplicate Entry", description: "An SEO override for this city and category already exists.", variant: "destructive"});
           setIsSubmitting(false); return;
        }
        await addDoc(cityCatSeoRef, { ...basePayload, createdAt: Timestamp.now() });
      }
      await triggerRefresh('seo-settings');
      if (city.slug && category.slug) {
        await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, basePayload.isActive);
      }
      toast({ title: "Success", description: "City-Category SEO setting saved." });
      setIsFormOpen(false); 
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save setting.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAreaCategoryFormSubmit = async (data: AreaCategorySeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const area = areas.find(a => a.id === data.areaId);
    const category = categories.find(c => c.id === data.categoryId);
    if (!city || !area || !category) {
      toast({ title: "Error", description: "Selected city, area, or category not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const basePayload: Omit<AreaCategorySeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
      cityId: data.cityId, cityName: city.name, areaId: data.areaId, areaName: area.name,
      categoryId: data.categoryId, categoryName: category.name,
      slug: data.slug || generateSeoSlug([city.slug, area.slug, category.slug]),
      h1_title: data.h1_title, meta_title: data.meta_title, meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
      seo_content: data.seo_content,
      faqs: data.faqs,
      imageHint: data.imageHint, isActive: data.isActive,
    };

    try {
      if (data.id) { 
        await updateDoc(doc(areaCatSeoRef, data.id), { ...basePayload, updatedAt: Timestamp.now() });
      } else { 
        const q = query(areaCatSeoRef, where("areaId", "==", data.areaId), where("categoryId", "==", data.categoryId));
        const snap = await getDocs(q);
        if (!snap.empty) {
           toast({ title: "Duplicate Entry", description: "An SEO override for this area and category already exists.", variant: "destructive"});
           setIsSubmitting(false); return;
        }
        await addDoc(areaCatSeoRef, { ...basePayload, createdAt: Timestamp.now() });
      }
      await triggerRefresh('seo-settings');
      if (city.slug && area.slug && category.slug) {
        await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, basePayload.isActive);
      }
      toast({ title: "Success", description: "Area-Category SEO setting saved." });
      setIsFormOpen(false); 
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save setting.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };


  if (!isMounted || isLoading) {
    return (
      <div className="space-y-6">
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4 mt-2" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Zap className="mr-2 h-6 w-6 text-primary" />Advanced SEO Overrides</CardTitle>
          <CardDescription>Manage specific SEO settings for City-Category and Area-Category combinations.</CardDescription>
        </CardHeader>
      </Card>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="city-category">City-Category SEO</TabsTrigger>
          <TabsTrigger value="area-category">Area-Category SEO</TabsTrigger>
        </TabsList>
        <TabsContent value="city-category">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>City-Category Specific Settings</CardTitle><CardDescription>Overrides for /[city]/category/[categorySlug] pages.</CardDescription></div>
              <PermissionGuard moduleId="seo_overrides" action="create">
                <Button onClick={() => handleAddSetting('cityCategory')} disabled={isSubmitting || cities.length === 0 || categories.length === 0}><PlusCircle className="mr-2 h-4 w-4"/>Add New</Button>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
              {cityCategorySettings.length === 0 ? (
                 <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No City-Category SEO overrides found.</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>City</TableHead><TableHead>Category</TableHead><TableHead>Slug Segment</TableHead><TableHead>H1 Title</TableHead><TableHead className="text-center">Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cityCategorySettings.map(setting => (
                      <TableRow key={setting.id}>
                        <TableCell>{setting.cityName}</TableCell><TableCell>{setting.categoryName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{setting.slug}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>{setting.h1_title || "Not set"}</TableCell>
                        <TableCell className="text-center"><Switch checked={setting.isActive} onCheckedChange={() => handleToggleActive(setting, 'cityCategory')} disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}/></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <PermissionGuard moduleId="seo_overrides" action="write">
                              <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting, 'cityCategory')} disabled={isSubmitting}><Edit className="h-4 w-4"/></Button>
                            </PermissionGuard>
                            <PermissionGuard moduleId="seo_overrides" action="delete">
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Delete Confirmation</AlertDialogTitle><AlertDialogDescription>Delete SEO override for {setting.cityName} - {setting.categoryName}?</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSetting(setting.id!, 'cityCategory')} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="area-category">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Area-Category Specific Settings</CardTitle><CardDescription>Overrides for /[city]/[area]/[categorySlug] pages.</CardDescription></div>
              <PermissionGuard moduleId="seo_overrides" action="create">
                <Button onClick={() => handleAddSetting('areaCategory')} disabled={isSubmitting || cities.length === 0 || areas.length === 0 || categories.length === 0}><PlusCircle className="mr-2 h-4 w-4"/>Add New</Button>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
            {areaCategorySettings.length === 0 ? (
                <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No Area-Category SEO overrides found.</p></div>
            ) : (
                <Table>
                    <TableHeader><TableRow><TableHead>City</TableHead><TableHead>Area</TableHead><TableHead>Category</TableHead><TableHead>Slug Segment</TableHead><TableHead>H1 Title</TableHead><TableHead className="text-center">Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                    {areaCategorySettings.map(setting => (
                        <TableRow key={setting.id}>
                        <TableCell>{setting.cityName}</TableCell><TableCell>{setting.areaName}</TableCell><TableCell>{setting.categoryName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{setting.slug}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>{setting.h1_title || "Not set"}</TableCell>
                        <TableCell className="text-center"><Switch checked={setting.isActive} onCheckedChange={() => handleToggleActive(setting, 'areaCategory')} disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}/></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <PermissionGuard moduleId="seo_overrides" action="write">
                              <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting, 'areaCategory')} disabled={isSubmitting}><Edit className="h-4 w-4"/></Button>
                            </PermissionGuard>
                            <PermissionGuard moduleId="seo_overrides" action="delete">
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Delete Confirmation</AlertDialogTitle><AlertDialogDescription>Delete SEO override for {setting.areaName} - {setting.categoryName}?</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSetting(setting.id!, 'areaCategory')} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) { setEditingSetting(null); setFormType(null); } }}}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-3 pb-4 border-b">
            <DialogTitle>{editingSetting ? 'Edit' : 'Add New'} {formType === 'cityCategory' ? 'City-Category' : 'Area-Category'} SEO Setting</DialogTitle>
            <DialogDescription>Fill in the details for the SEO override.</DialogDescription>
          </DialogHeader>
          <div className="p-3">
            {cities.length === 0 || categories.length === 0 || (formType === 'areaCategory' && areas.length === 0) ? (
                 <div className="py-8 text-center"><PackageSearch className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-destructive">Cannot add settings: Cities, Categories (and Areas for area-specific) must exist first.</p></div>
            ) : formType === 'cityCategory' ? (
              <CityCategorySeoForm
                onSubmit={handleCityCategoryFormSubmit}
                initialData={editingSetting as CityCategorySeoSetting | null}
                existingSettings={cityCategorySettings}
                cities={cities}
                categories={categories}
                onCancel={() => { setIsFormOpen(false); setEditingSetting(null); setFormType(null); }}
                isSubmitting={isSubmitting}
              />
            ) : formType === 'areaCategory' ? (
              <AreaCategorySeoForm
                onSubmit={handleAreaCategoryFormSubmit}
                initialData={editingSetting as AreaCategorySeoSetting | null}
                existingSettings={areaCategorySettings}
                cities={cities}
                areas={areas}
                categories={categories}
                onCancel={() => { setIsFormOpen(false); setEditingSetting(null); setFormType(null); }}
                isSubmitting={isSubmitting}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
