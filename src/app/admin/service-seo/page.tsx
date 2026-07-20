"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, PackageSearch, Layers } from "lucide-react";
import type { AreaServiceSeoSetting, FirestoreCity, FirestoreArea, FirestoreService } from '@/types/firestore';
import AreaServiceSeoForm, { type AreaServiceSeoFormData } from '@/components/admin/AreaServiceSeoForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, where, query } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getAdminServices, getCities, getAreas, getAreaServiceSeoSettings } from '@/lib/webServerUtils';
import { getCache, setCache } from '@/lib/client-cache';

export default function ServiceSeoPage() {
  const [settings, setSettings] = useState<AreaServiceSeoSetting[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [areas, setAreas] = useState<FirestoreArea[]>([]);
  const [services, setServices] = useState<FirestoreService[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<AreaServiceSeoSetting | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const serviceSeoRef = collection(db, "areaServiceSeoSettings");

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      if (!forceRefresh) {
        const cachedCities = getCache<FirestoreCity[]>('admin-cities-for-service-seo', true);
        const cachedAreas = getCache<FirestoreArea[]>('admin-areas-for-service-seo', true);
        const cachedServices = getCache<FirestoreService[]>('admin-services-for-service-seo', true);
        const cachedSettings = getCache<AreaServiceSeoSetting[]>('admin-service-seo-settings', true);

        if (cachedCities && cachedAreas && cachedServices && cachedSettings) {
          setCities(cachedCities);
          setAreas(cachedAreas);
          setServices(cachedServices);
          setSettings(cachedSettings);
          setIsLoading(false);
          return;
        }
      }

      // Fetch fresh data from Server Actions (statically compiled / cached on server)
      const [fetchedCities, fetchedAreas, fetchedServices, fetchedSettings] = await Promise.all([
        getCities(),
        getAreas(),
        getAdminServices(),
        getAreaServiceSeoSettings()
      ]);

      setCities(fetchedCities);
      setAreas(fetchedAreas);
      setServices(fetchedServices);
      setSettings(fetchedSettings);

      // Save to client memory cache
      setCache('admin-cities-for-service-seo', fetchedCities, true);
      setCache('admin-areas-for-service-seo', fetchedAreas, true);
      setCache('admin-services-for-service-seo', fetchedServices, true);
      setCache('admin-service-seo-settings', fetchedSettings, true);

    } catch (error) {
      console.error("Error loading Service-wise SEO data:", error);
      toast({ title: "Error", description: "Failed to load location, service, or override parameters.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSetting = () => {
    setEditingSetting(null);
    setIsFormOpen(true);
  };

  const handleEditSetting = (setting: AreaServiceSeoSetting) => {
    setEditingSetting(setting);
    setIsFormOpen(true);
  };

  const handleDeleteSetting = async (id: string) => {
    setIsSubmitting(true);
    try {
      const setting = settings.find(s => s.id === id);
      await deleteDoc(doc(serviceSeoRef, id));
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (setting?.citySlug && setting?.areaSlug && setting?.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: setting.citySlug, areaSlug: setting.areaSlug, serviceSlug: setting.serviceSlug }, false);
      }
      toast({ title: "Success", description: "SEO override deleted successfully." });
      await fetchData(true);
    } catch (error) {
      toast({ title: "Error", description: "Could not delete SEO override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (setting: AreaServiceSeoSetting) => {
    setIsSubmitting(true);
    try {
      const updatedStatus = !setting.isActive;
      await updateDoc(doc(serviceSeoRef, setting.id!), {
        isActive: updatedStatus,
        updatedAt: Timestamp.now()
      });
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (setting.citySlug && setting.areaSlug && setting.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: setting.citySlug, areaSlug: setting.areaSlug, serviceSlug: setting.serviceSlug }, updatedStatus);
      }
      toast({ title: "Success", description: `SEO configuration ${updatedStatus ? 'activated' : 'deactivated'} successfully.` });
      await fetchData(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update active status.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: AreaServiceSeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const area = areas.find(a => a.id === data.areaId);
    const service = services.find(s => s.id === data.serviceId);

    if (!city || !area || !service) {
      toast({ title: "Error", description: "Selected City, Area, or Service parameters not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<AreaServiceSeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
      cityId: data.cityId,
      cityName: city.name,
      citySlug: city.slug,
      areaId: data.areaId,
      areaName: area.name,
      areaSlug: area.slug,
      serviceId: data.serviceId,
      serviceName: service.name,
      serviceSlug: service.slug,
      slug: data.slug || `${city.slug}/${area.slug}/service/${service.slug}`,
      h1_title: data.h1_title,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
      seo_content: data.seo_content,
      faqs: data.faqs,
      isActive: data.isActive,
    };

    try {
      if (data.id) {
        await updateDoc(doc(serviceSeoRef, data.id), { ...payload, updatedAt: Timestamp.now() });
      } else {
        // Enforce uniqueness constraints
        const q = query(serviceSeoRef, where("areaId", "==", data.areaId), where("serviceId", "==", data.serviceId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          toast({ title: "Duplicate Entry", description: "An SEO configuration for this area and service already exists.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        await addDoc(serviceSeoRef, { ...payload, createdAt: Timestamp.now() });
      }
      
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (payload.citySlug && payload.areaSlug && payload.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: payload.citySlug, areaSlug: payload.areaSlug, serviceSlug: payload.serviceSlug }, payload.isActive);
      }
      toast({ title: "Success", description: "Local Service SEO configurations saved successfully." });
      setIsFormOpen(false);
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save settings override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted || isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Layers className="mr-2 h-6 w-6 text-primary" /> Service-wise Local SEO Overrides
            </CardTitle>
            <CardDescription>
              Create dedicated local SEO landing pages linking to specific services in targeted areas (e.g. Bed dismantling in Whitefield).
            </CardDescription>
          </div>
          <PermissionGuard moduleId="seo_overrides" action="create">
            <Button onClick={handleAddSetting} disabled={isSubmitting || cities.length === 0 || services.length === 0}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Page
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
          {settings.length === 0 ? (
            <div className="text-center py-12">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No Service-wise Area SEO overrides found.</p>
              <PermissionGuard moduleId="seo_overrides" action="create">
                <Button onClick={handleAddSetting} className="mt-4" variant="outline">
                  Create First Override
                </Button>
              </PermissionGuard>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Target Service</TableHead>
                  <TableHead>URL Path</TableHead>
                  <TableHead>H1 Heading</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-semibold">{setting.cityName}</TableCell>
                    <TableCell>{setting.areaName}</TableCell>
                    <TableCell className="text-primary font-medium">{setting.serviceName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">/{setting.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>
                      {setting.h1_title || "Not set"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch 
                        checked={setting.isActive !== false} 
                        onCheckedChange={() => handleToggleActive(setting)} 
                        disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGuard moduleId="seo_overrides" action="write">
                          <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </PermissionGuard>
                        <PermissionGuard moduleId="seo_overrides" action="delete">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the localized SEO config for "{setting.serviceName}" in "{setting.areaName}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSetting(setting.id!)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
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

      {/* Add / Edit Form Overlay Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSetting ? `Edit local SEO Config: ${editingSetting.serviceName}` : "Create Localized Service SEO Page"}</DialogTitle>
            <DialogDescription>
              Configure meta tags, long-form content, and answers that target search traffic for a specific service in a specific local area.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <AreaServiceSeoForm
              onSubmit={handleFormSubmit}
              initialData={editingSetting}
              existingSettings={settings}
              cities={cities}
              areas={areas}
              services={services}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
