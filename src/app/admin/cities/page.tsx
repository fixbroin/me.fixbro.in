
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, MapPin, CheckCircle, XCircle, PackageSearch } from "lucide-react"; // Added PackageSearch
import type { FirestoreCity } from '@/types/firestore';
import CityForm from '@/components/admin/CityForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import PermissionGuard from '@/components/admin/PermissionGuard';

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<FirestoreCity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const citiesCollectionRef = collection(db, "cities");

  const fetchCities = async () => {
    setIsLoading(true);
    try {
      const q = query(citiesCollectionRef, orderBy("name", "asc"), limit(100));
      const data = await getDocs(q);
      const fetchedCities = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCity));
      setCities(fetchedCities);
    } catch (error) {
      console.error("Error fetching cities: ", error);
      toast({
        title: "Error",
        description: "Could not fetch cities.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddCity = () => {
    setEditingCity(null);
    setIsFormOpen(true);
  };

  const handleEditCity = (city: FirestoreCity) => {
    setEditingCity(city);
    setIsFormOpen(true);
  };

  const handleDeleteCity = async (cityId: string) => {
    setIsSubmitting(true);
    try {
      const city = cities.find(c => c.id === cityId);
      await deleteDoc(doc(db, "cities", cityId));
      setCities(cities.filter(city => city.id !== cityId));
      toast({ title: "Success", description: "City deleted successfully." });
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (city?.slug) {
        await submitToGoogleIndexing('city', city.slug, false);
      }
    } catch (error) {
      console.error("Error deleting city: ", error);
      toast({ title: "Error", description: "Could not delete city. It might have areas associated with it.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    
    const payload: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      slug: data.slug || "",
      isActive: data.isActive === undefined ? true : data.isActive,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      seo_keywords: data.seo_keywords,
      h1_title: data.h1_title,
    };

    try {
      if (editingCity && data.id) { 
        const cityDoc = doc(db, "cities", data.id);
        await updateDoc(cityDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "City updated successfully." });
      } else { 
        await addDoc(citiesCollectionRef, { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "City added successfully." });
      }
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (payload.slug) {
        await submitToGoogleIndexing('city', payload.slug, payload.isActive);
      }

      setIsFormOpen(false);
      setEditingCity(null);
      await fetchCities(); 
    } catch (error) {
      console.error("Error saving city: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save city.", variant: "destructive" });
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
            <CardTitle className="text-2xl flex items-center"><MapPin className="mr-2 h-6 w-6 text-primary" />Manage Cities</CardTitle>
            <CardDescription>Add, edit, or delete cities. These will create pages like /city-slug.</CardDescription>
          </div>
          <PermissionGuard moduleId="cities" action="create">
            <Button onClick={handleAddCity} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New City
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading cities...</p>
            </div>
          ) : cities.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No cities found yet. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>H1 Title</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map((city) => (
                  <TableRow key={city.id}>
                    <TableCell className="font-medium">{city.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{city.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={city.h1_title}>{city.h1_title || "Not set"}</TableCell>
                    <TableCell className="text-center">
                      {city.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <Button variant="outline" size="icon" onClick={() => handleEditCity(city)} disabled={isSubmitting}>
                          <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                        </Button>
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
                                This will permanently delete the city "{city.name}". Areas under this city might be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteCity(city.id)}
                                disabled={isSubmitting}
                                className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingCity(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-3 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingCity ? 'Edit City' : 'Add New City'}</DialogTitle>
            <DialogDescription>
              {editingCity ? 'Update the details for this city.' : 'Fill in the details to create a new city.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 flex-grow overflow-y-auto">
            <CityForm
              onSubmit={handleFormSubmit}
              initialData={editingCity}
              onCancel={() => { setIsFormOpen(false); setEditingCity(null); }}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
