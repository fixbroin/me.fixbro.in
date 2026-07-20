"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Wand2, Edit2, Lock, Search, Building } from "lucide-react";
import { generateAreaSeo } from '@/ai/flows/generateAreaSeoFlow';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const areaFormSchema = z.object({
  name: z.string().min(2, { message: "Area name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-area-name).").optional().or(z.literal('')),
  cityId: z.string({ required_error: "Please select a parent city." }),
  isActive: z.boolean().default(true),
  // SEO Fields
  h1_title: z.string().optional().or(z.literal('')),
  seo_title: z.string().optional().or(z.literal('')),
  seo_description: z.string().optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type AreaFormData = z.infer<typeof areaFormSchema>;

interface AreaFormProps {
  onSubmit: (data: Omit<FirestoreArea, 'id' | 'cityName' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreArea | null;
  onCancel: () => void;
  cities: FirestoreCity[]; // To populate parent city dropdown
  isSubmitting?: boolean; 
}

export default function AreaForm({ onSubmit: onSubmitProp, initialData, onCancel, cities, isSubmitting = false }: AreaFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  
  const { toast } = useToast();
  
  const form = useForm<AreaFormData>({
    resolver: zodResolver(areaFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      cityId: undefined,
      isActive: true,
      h1_title: "",
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
    },
  });

  const watchedName = form.watch("name");
  const watchedCityId = form.watch("cityId");
  const watchedSlug = form.watch("slug");

  const selectedCity = useMemo(() => cities.find(c => c.id === watchedCityId), [cities, watchedCityId]);
  
  const searchableCities = useMemo(() => {
    return cities.filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "areas"),
        where("slug", "==", uniqueSlug),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        const doc = querySnapshot.docs[0];
        if (currentId && doc.id === currentId) {
          isUnique = true;
        } else {
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    }
    return uniqueSlug;
  }, []);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        cityId: initialData.cityId,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
      });
    } else {
      form.reset({
        name: "", slug: "", cityId: undefined, isActive: true,
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
    }
    setIsSlugEditable(false);
  }, [initialData, form]);
  
  useEffect(() => {
    if (watchedName && !isSlugEditable) {
      const delayDebounceFn = setTimeout(async () => {
        const baseSlug = generateSlug(watchedName);
        const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
        form.setValue('slug', uniqueSlug, { shouldValidate: true });
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedName, isSlugEditable, initialData, form, checkSlugUniqueness]);

  // Handle manual slug changes to ensure uniqueness if needed
  useEffect(() => {
    if (isSlugEditable && watchedSlug && form.getFieldState('slug').isDirty) {
        const delayDebounceFn = setTimeout(async () => {
            const baseSlug = generateSlug(watchedSlug);
            if (baseSlug !== watchedSlug) {
                form.setValue('slug', baseSlug, { shouldValidate: true });
            }
            const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
            if (uniqueSlug !== baseSlug) {
                form.setValue('slug', uniqueSlug, { shouldValidate: true });
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedSlug, isSlugEditable, initialData, form, checkSlugUniqueness]);

  const handleGenerateSeo = async () => {
    const areaName = form.getValues("name");
    const cityId = form.getValues("cityId");
    const parentCity = cities.find(c => c.id === cityId);

    if (!areaName || !parentCity) {
      toast({
        title: "Area & City Required",
        description: "Please enter an area name and select a parent city first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateAreaSeo({ areaName, cityName: parentCity.name });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("seo_title", result.seo_title, { shouldValidate: true });
      form.setValue("seo_description", result.seo_description, { shouldValidate: true });
      form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields and FAQs have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating area SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };


  const handleSubmit = async (formData: AreaFormData) => {
    await onSubmitProp({
      ...formData,
      slug: formData.slug || "",
      id: initialData?.id,
    });
  };
  
  const effectiveIsSubmitting = isSubmitting || isGeneratingSeo;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Area Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Whitefield" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Slug {initialData ? "(Editing might affect SEO)" : "(Auto-generated or custom)"}</FormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSlugEditable(!isSlugEditable)}
                  className="h-8 px-2 text-xs"
                  disabled={effectiveIsSubmitting}
                >
                  {isSlugEditable ? (
                    <><Lock className="mr-1 h-3 w-3" /> Lock</>
                  ) : (
                    <><Edit2 className="mr-1 h-3 w-3" /> Edit Manually</>
                  )}
                </Button>
              </div>
              <FormControl>
                <Input
                  placeholder="e.g., whitefield"
                  {...field}
                  onChange={(e) => field.onChange(generateSlug(e.target.value))}
                  disabled={effectiveIsSubmitting || !isSlugEditable}
                  className={!isSlugEditable ? "bg-muted/50 font-mono text-xs" : "font-mono text-xs"}
                />
              </FormControl>
              <FormDescription>
                {isSlugEditable 
                  ? "Lowercase, dash-separated. Uniqueness is automatically checked." 
                  : "Automatically generated and unique. Click 'Edit Manually' to customize."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cityId"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Parent City</FormLabel>
              <Dialog open={isCityPickerOpen} onOpenChange={setIsCityPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting || cities.length === 0}
                  >
                    {selectedCity ? (
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-primary" />
                        <span>{selectedCity.name}</span>
                      </div>
                    ) : (
                      "Search and select city..."
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select City</DialogTitle>
                    <DialogDescription>
                      Search and select a parent city for this area.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Type city name..."
                        className="pl-8"
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[300px] rounded-md border p-2">
                      <div className="space-y-1">
                        {searchableCities.length === 0 ? (
                          <p className="text-center py-4 text-sm text-muted-foreground">No cities found.</p>
                        ) : (
                          searchableCities.map((city) => (
                            <Button
                              key={city.id}
                              variant={field.value === city.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                              onClick={() => {
                                field.onChange(city.id);
                                setIsCityPickerOpen(false);
                                setCitySearch("");
                              }}
                            >
                              <span className="font-semibold text-sm">{city.name}</span>
                            </Button>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>Area Active</FormLabel>
                <FormDescription>If unchecked, this area will not be shown publicly.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
              <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSeo}
                  disabled={isGeneratingSeo || isSubmitting || !watchedName || !watchedCityId}
              >
                  {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Generate AI SEO
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Best Services in Whitefield, Bangalore" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Whitefield Services | FixBro" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Find all home services in Whitefield, Bangalore." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., whitefield services, bangalore repair" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={effectiveIsSubmitting || (cities.length === 0 && !initialData) }>
                {effectiveIsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Create Area'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
