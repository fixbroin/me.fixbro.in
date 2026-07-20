
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, MapPin, CheckCircle, XCircle, PackageSearch } from "lucide-react";
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import AreaForm from '@/components/admin/AreaForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp, where, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export default function AdminAreasPage() {
  const { adminPermissions } = useAuth();
  const [areas, setAreas] = useState<FirestoreArea[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<FirestoreArea | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const areasCollectionRef = collection(db, "areas");
  const citiesCollectionRef = collection(db, "cities");

  const fetchCitiesAndAreas = async () => {
    setIsLoading(true);
    try {
      const citiesQuery = query(citiesCollectionRef, orderBy("name", "asc"), limit(100));
      const citiesSnapshot = await getDocs(citiesQuery);
      const fetchedCities = citiesSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCity));
      setCities(fetchedCities);

      const areasQuery = query(areasCollectionRef, orderBy("name", "asc"), limit(500));
      const areasSnapshot = await getDocs(areasQuery);
      const fetchedAreas = areasSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreArea));
      setAreas(fetchedAreas);

    } catch (error) {
      console.error("Error fetching cities or areas: ", error);
      toast({ title: "Error", description: "Could not fetch required data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCitiesAndAreas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddArea = () => {
    setEditingArea(null);
    setIsFormOpen(true);
  };

  const handleEditArea = (area: FirestoreArea) => {
    setEditingArea(area);
    setIsFormOpen(true);
  };

  const handleDeleteArea = async (areaId: string) => {
    setIsSubmitting(true);
    try {
      // Call Google Indexing API before deleting from Firestore so we can resolve its slugs
      await submitToGoogleIndexing('area', areaId, false);
      
      await deleteDoc(doc(db, "areas", areaId));
      setAreas(areas.filter(area => area.id !== areaId));
      toast({ title: "Success", description: "Area deleted successfully." });

      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
    } catch (error) {
      console.error("Error deleting area: ", error);
      toast({ title: "Error", description: "Could not delete area.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreArea, 'id' | 'createdAt' | 'updatedAt' | 'cityName'> & { id?: string }) => {
    setIsSubmitting(true);
    const parentCity = cities.find(c => c.id === data.cityId);
    if (!parentCity) {
        toast({ title: "Error", description: "Parent city not found.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const payload: Omit<FirestoreArea, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      slug: data.slug || "",
      cityId: data.cityId,
      cityName: parentCity.name,
      isActive: data.isActive === undefined ? true : data.isActive,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      seo_keywords: data.seo_keywords,
      h1_title: data.h1_title,
    };

    try {
      let activeId = data.id || "";
      if (editingArea && data.id) {
        const areaDoc = doc(db, "areas", data.id);
        await updateDoc(areaDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Area updated successfully." });
      } else {
        const docRef = await addDoc(areasCollectionRef, { ...payload, createdAt: Timestamp.now() });
        activeId = docRef.id;
        toast({ title: "Success", description: "Area added successfully." });
      }
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (activeId) {
        await submitToGoogleIndexing('area', activeId, payload.isActive);
      }

      setIsFormOpen(false);
      setEditingArea(null);
      await fetchCitiesAndAreas(); // Re-fetch to update list
    } catch (error) {
      console.error("Error saving area: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save area.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isMounted) {
     return (
      <div className="space-y-6">
        <Card><CardHeader><CardTitle className="animate-pulse h-8 w-1/2 bg-muted rounded"></CardTitle><CardDescription className="animate-pulse h-4 w-3/4 bg-muted rounded mt-2"></CardDescription></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><MapPin className="mr-2 h-6 w-6 text-primary" />Manage Areas</CardTitle>
            <CardDescription>Add, edit, or delete service areas under cities.</CardDescription>
          </div>
          <Button onClick={handleAddArea} disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Area
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading areas...</p>
            </div>
          ) : cities.length === 0 ? (
             <p className="text-muted-foreground text-center py-6">
                No cities found. Please add cities first to create areas under them.
            </p>
          ) : areas.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No areas found yet. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area Name</TableHead>
                  <TableHead>Parent City</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>H1 Title</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">{area.name}</TableCell>
                    <TableCell>{area.cityName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{area.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={area.h1_title}>{area.h1_title || "Not set"}</TableCell>
                    <TableCell className="text-center">
                      {area.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <PermissionGuard moduleId="areas" action="write">
                          <Button variant="outline" size="icon" onClick={() => handleEditArea(area)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                        </PermissionGuard>
                        <PermissionGuard moduleId="areas" action="delete">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the area "{area.name}". Services under this area might be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteArea(area.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
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

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingArea(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
           <DialogHeader className="p-3 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingArea ? 'Edit Area' : 'Add New Area'}</DialogTitle>
            <DialogDescription>
              {editingArea ? 'Update the details for this area.' : 'Fill in the details to create a new area.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 flex-grow overflow-y-auto">
            {cities.length === 0 && !isLoading ? (
                 <div className="py-8 text-center">
                    <p className="text-destructive">Cannot add areas because no cities exist.</p>
                    <p className="text-muted-foreground text-sm mt-2">Please add at least one city first.</p>
                 </div>
            ) : (
                <AreaForm
                onSubmit={handleFormSubmit}
                initialData={editingArea}
                cities={cities}
                onCancel={() => { setIsFormOpen(false); setEditingArea(null); }}
                isSubmitting={isSubmitting}
                />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
