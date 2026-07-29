
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, HandCoins } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { AppSettings, ProviderFeeType } from '@/types/firestore';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const providerFeesSchema = z.object({
  providerFeeType: z.enum(['fixed', 'percentage'], { required_error: "You must select a fee type."}),
  providerFeeValue: z.coerce.number().min(0, "Fee value must be non-negative."),
}).refine(data => {
    if (data.providerFeeType === 'percentage' && data.providerFeeValue > 100) {
        return false;
    }
    return true;
}, {
    message: "Percentage value cannot exceed 100.",
    path: ["providerFeeValue"],
});

type ProviderFeesFormData = z.infer<typeof providerFeesSchema>;

export default function ProviderFeesSetupTab() {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ProviderFeesFormData>({
    resolver: zodResolver(providerFeesSchema),
    defaultValues: {
      providerFeeType: 'fixed',
      providerFeeValue: 0,
    },
  });

  useEffect(() => {
    if (!isLoadingAppConfig && appConfig) {
      form.reset({
        providerFeeType: appConfig.providerFeeType || 'fixed',
        providerFeeValue: appConfig.providerFeeValue || 0,
      });
    }
  }, [appConfig, isLoadingAppConfig, form]);

  const onSubmit = async (data: ProviderFeesFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, "webSettings", "applicationConfig");
      const settingsToUpdate: Partial<AppSettings> = {
        providerFeeType: data.providerFeeType,
        providerFeeValue: data.providerFeeValue,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, settingsToUpdate, { merge: true });
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Provider fee settings have been saved." });
    } catch (error) {
      console.error("Error saving provider fee settings:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAppConfig) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><HandCoins className="mr-2 h-5 w-5"/>Provider Fee Setup</CardTitle>
          <CardDescription>Define the fee structure for provider payouts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><HandCoins className="mr-2 h-5 w-5"/>Provider Fee Setup</CardTitle>
            <CardDescription>Define the service fee deducted from each provider's booking payout.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-3">
            <FormField
              control={form.control}
              name="providerFeeType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Fee Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                      disabled={isSaving}
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="fixed" /></FormControl>
                        <FormLabel className="font-normal">Fixed Fee (₹)</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="percentage" /></FormControl>
                        <FormLabel className="font-normal">Percentage Fee (%)</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="providerFeeValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee Value</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={form.getValues("providerFeeType") === 'percentage' ? "e.g., 20" : "e.g., 50"}
                      {...field}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the fixed amount (e.g., 50 for ₹50) or the percentage (e.g., 20 for 20%).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Fee Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
