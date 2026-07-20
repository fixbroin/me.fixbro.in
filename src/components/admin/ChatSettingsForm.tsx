
"use client";

import { useState, useEffect, useRef } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Volume2, Trash2, UploadCloud, MessageSquare, Bot, Music, Globe } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import type { GlobalWebSettings } from '@/types/firestore';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Progress } from '@/components/ui/progress';
import { defaultAppSettings } from '@/config/appDefaults';
import { cn } from '@/lib/utils';

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.includes("firebasestorage.googleapis.com");

const chatSettingsFormSchema = z.object({
  isChatEnabled: z.boolean().default(false),
  isAiChatBotEnabled: z.boolean().default(false),
  chatNotificationSoundUrl: z.string().optional().or(z.literal('')),
});

type ChatSettingsFormData = z.infer<typeof chatSettingsFormSchema>;

export default function ChatSettingsForm() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings, error: globalSettingsError } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSoundFile, setSelectedSoundFile] = useState<File | null>(null);
  const [soundUploadProgress, setSoundUploadProgress] = useState<number | null>(null);
  const [isUploadingSound, setIsUploadingSound] = useState(false);
  const [currentSoundUrlPreview, setCurrentSoundUrlPreview] = useState<string | null>(null);
  const soundFileInputRef = useRef<HTMLInputElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const form = useForm<ChatSettingsFormData>({
    resolver: zodResolver(chatSettingsFormSchema),
    defaultValues: {
      isChatEnabled: false,
      isAiChatBotEnabled: false,
      chatNotificationSoundUrl: defaultAppSettings.chatNotificationSoundUrl || "",
    },
  });

  useEffect(() => {
    if (globalSettings && !isLoadingGlobalSettings) {
      const currentSoundUrl = globalSettings.chatNotificationSoundUrl || defaultAppSettings.chatNotificationSoundUrl || "";
      form.reset({
        isChatEnabled: globalSettings.isChatEnabled || false,
        isAiChatBotEnabled: globalSettings.isAiChatBotEnabled || false,
        chatNotificationSoundUrl: currentSoundUrl,
      });
      setCurrentSoundUrlPreview(currentSoundUrl);
    }
  }, [globalSettings, isLoadingGlobalSettings, form]);

  const handleSoundFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 1 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Sound file must be less than 1MB.", variant: "destructive" });
        return;
      }
      setSelectedSoundFile(file);
      setCurrentSoundUrlPreview(URL.createObjectURL(file));
      form.setValue('chatNotificationSoundUrl', '');
    }
  };

  const handleRemoveCustomSound = async () => {
    const storedUrl = globalSettings?.chatNotificationSoundUrl;
    if (storedUrl && isFirebaseStorageUrl(storedUrl)) {
      try {
        const soundRef = storageRef(storage, storedUrl);
        await deleteObject(soundRef);
      } catch (error) {
        console.error("Error deleting sound:", error);
      }
    }
    setSelectedSoundFile(null);
    const defaultSound = defaultAppSettings.chatNotificationSoundUrl || "";
    form.setValue('chatNotificationSoundUrl', defaultSound);
    setCurrentSoundUrlPreview(defaultSound);
  };

  const onSubmit = async (data: ChatSettingsFormData) => {
    setIsSaving(true);
    let finalSoundUrl = data.chatNotificationSoundUrl || defaultAppSettings.chatNotificationSoundUrl || ""; 

    if (selectedSoundFile) {
      setIsUploadingSound(true);
      const extension = selectedSoundFile.name.split('.').pop()?.toLowerCase() || 'mp3';
      const soundPath = `chat_sounds/notif_${generateRandomHexString(10)}.${extension}`;
      const soundFileRef = storageRef(storage, soundPath);

      try {
        const uploadTask = uploadBytesResumable(soundFileRef, selectedSoundFile);
        finalSoundUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snap) => setSoundUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
            (err) => reject(err),
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
          );
        });
      } catch (error) {
        toast({ title: "Upload Failed", variant: "destructive" });
        setIsSaving(false); return;
      } finally {
        setIsUploadingSound(false); setSoundUploadProgress(null);
      }
    }

    try {
      await setDoc(doc(db, "webSettings", "global"), {
        isChatEnabled: data.isChatEnabled,
        isAiChatBotEnabled: data.isAiChatBotEnabled,
        chatNotificationSoundUrl: finalSoundUrl,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      await triggerRefresh('global-cache');
      toast({ title: "Settings Saved", description: "Your chat preferences have been updated." });
    } catch (error) {
      toast({ title: "Save Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const playCurrentSound = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.play().catch(console.error);
    }
  };

  if (isLoadingGlobalSettings) {
    return (
      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading system configuration...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card className="overflow-hidden border-none shadow-xl rounded-3xl bg-card">
          <CardHeader className="p-8 pb-4 bg-primary/[0.02]">
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">System Settings</CardTitle>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              Control the core visibility and automation logic for your customer support channels.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-8 space-y-5">
            <FormField
              control={form.control}
              name="isChatEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-2xl border p-5 transition-colors hover:bg-muted/30">
                  <div className="space-y-1 pr-4">
                    <FormLabel className="text-base font-bold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" /> Frontend Chat Widget
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Enable the floating message button for all website visitors.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isAiChatBotEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-2xl border p-5 transition-colors hover:bg-muted/30">
                  <div className="space-y-1 pr-4">
                    <FormLabel className="text-base font-bold flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" /> AI Smart Assistant
                    </FormLabel>
                    <FormDescription className="text-xs">
                      Automatically handle common queries using your trained AI model.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="pt-4 border-t space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Music className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">Audio Notifications</h3>
              </div>

              <FormField
                control={form.control}
                name="chatNotificationSoundUrl"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-semibold">Sound Source URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://example.com/sound.mp3"
                        className="rounded-xl border-none bg-muted/50 h-11 focus-visible:ring-primary/20"
                        {...field} 
                        onChange={(e) => {
                          field.onChange(e);
                          setCurrentSoundUrlPreview(e.target.value || defaultAppSettings.chatNotificationSoundUrl || "");
                          setSelectedSoundFile(null);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormItem className="space-y-3">
                <FormLabel className="text-sm font-semibold">Local File Upload</FormLabel>
                <div className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 transition-all text-center",
                  selectedSoundFile ? "bg-primary/5 border-primary/40" : "hover:bg-muted/50 border-muted-foreground/20"
                )} onClick={() => soundFileInputRef.current?.click()}>
                  <input type="file" accept="audio/*" className="hidden" ref={soundFileInputRef} onChange={handleSoundFileChange} />
                  <UploadCloud className={cn("h-10 w-10 mx-auto mb-3 transition-transform", selectedSoundFile ? "text-primary scale-110" : "text-muted-foreground group-hover:scale-110")} />
                  <p className="text-sm font-bold">{selectedSoundFile ? selectedSoundFile.name : "Choose audio file or drag & drop"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-bold">MP3, WAV, OGG (MAX 1MB)</p>
                  
                  {soundUploadProgress !== null && (
                    <div className="absolute inset-x-4 bottom-4">
                      <Progress value={soundUploadProgress} className="h-1" />
                    </div>
                  )}
                </div>
              </FormItem>

              {currentSoundUrlPreview && (
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex items-center space-x-3">
                    <audio ref={audioPlayerRef} src={currentSoundUrlPreview} preload="auto" />
                    <Button type="button" variant="secondary" size="sm" onClick={playCurrentSound} className="rounded-full h-10 w-10 p-0 shadow-sm">
                      <Volume2 className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate max-w-[200px]">Current Selection</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {isFirebaseStorageUrl(currentSoundUrlPreview) ? "Custom Cloud Storage" : currentSoundUrlPreview}
                      </p>
                    </div>
                  </div>
                  {(isFirebaseStorageUrl(currentSoundUrlPreview) || selectedSoundFile) && (
                    <Button type="button" variant="ghost" size="icon" onClick={handleRemoveCustomSound} className="text-destructive hover:bg-destructive/10 rounded-full h-10 w-10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="p-8 bg-muted/20 border-t flex justify-between items-center">
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Version 2.0 • Security Verified</p>
            <Button type="submit" size="lg" disabled={isSaving || isUploadingSound} className="rounded-2xl px-8 shadow-lg shadow-primary/20">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save All Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
