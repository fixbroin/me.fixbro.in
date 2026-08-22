'use client';

import React, { useState, useTransition } from 'react';
import { 
  EmailTemplate, 
  updateEmailTemplateAction, 
  resetEmailTemplateAction 
} from '@/app/actions/emailSettingsActions';
import { useToast } from '@/hooks/use-toast';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mail, 
  Edit, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  Search 
} from 'lucide-react';

interface EmailSettingsClientProps {
  initialTemplates: EmailTemplate[];
}

export default function EmailSettingsClient({ initialTemplates }: EmailSettingsClientProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [subjectInput, setSubjectInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleToggle = async (template: EmailTemplate, checked: boolean) => {
    // Update local state first for instant response
    const updated = templates.map(t => t.id === template.id ? { ...t, isEnabled: checked } : t);
    setTemplates(updated);

    startTransition(async () => {
      const result = await updateEmailTemplateAction(template.id, checked, template.subject, template.body);
      if (result.success) {
        toast({
          title: "Template Status Updated",
          description: `"${template.title}" has been ${checked ? 'enabled' : 'disabled'}.`
        });
      } else {
        // Revert on failure
        setTemplates(templates);
        toast({
          variant: "destructive",
          title: "Failed to update status",
          description: result.message
        });
      }
    });
  };

  const handleEditClick = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setSubjectInput(template.subject);
    setBodyInput(template.body);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    startTransition(async () => {
      const result = await updateEmailTemplateAction(
        editingTemplate.id, 
        editingTemplate.isEnabled, 
        subjectInput, 
        bodyInput
      );

      if (result.success) {
        setTemplates(prev => prev.map(t => 
          t.id === editingTemplate.id 
            ? { ...t, subject: subjectInput, body: bodyInput } 
            : t
        ));
        setEditingTemplate(null);
        toast({
          title: "Template Saved",
          description: `"${editingTemplate.title}" was updated successfully.`
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to save template",
          description: result.message
        });
      }
    });
  };

  const handleResetTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to reset this template to its default subject and content?")) return;

    startTransition(async () => {
      const result = await resetEmailTemplateAction(templateId);
      if (result.success) {
        // Refresh local state by getting the template definition from default list
        window.location.reload();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to reset template",
          description: result.message
        });
      }
    });
  };

  const filteredTemplates = templates.filter(t => 
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search email templates..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-6">
        {filteredTemplates.map((template) => (
          <Card key={template.id} className={`${!template.isEnabled ? 'opacity-70 bg-slate-50/50 dark:bg-slate-900/10' : ''}`}>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary shrink-0" />
                  {template.title}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {template.description}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={template.isEnabled}
                    onCheckedChange={(checked) => handleToggle(template, checked)}
                    disabled={isPending}
                  />
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground select-none">
                    {template.isEnabled ? 'Enabled' : 'Disabled'}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleEditClick(template)}
                    disabled={isPending}
                    className="h-8 text-xs sm:text-sm"
                  >
                    <Edit className="mr-1.5 h-3.5 w-3.5" />
                    Edit Template
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleResetTemplate(template.id)}
                    disabled={isPending}
                    className="h-8 w-8 hover:bg-destructive/10 group/btn"
                    title="Reset to Default"
                  >
                    <RotateCcw className="h-4 w-4 text-muted-foreground group-hover/btn:text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 border-t pt-4">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Subject: <span className="font-mono text-xs font-normal text-muted-foreground">{template.subject}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Placeholders: </span>
                  {template.placeholders.map(p => (
                    <code key={p} className="bg-muted px-1.5 py-0.5 rounded text-[11px] mr-1.5 font-mono">
                      {`{${p}}`}
                    </code>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border rounded-lg bg-slate-50/50 dark:bg-slate-900/10">
            No templates found matching your search.
          </div>
        )}
      </div>

      <Dialog open={editingTemplate !== null} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
            <DialogDescription>
              Modify the subject and HTML body contents of this email alert.
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Template</Label>
                <Input id="edit-title" value={editingTemplate.title} disabled className="bg-slate-50 dark:bg-slate-900" />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-subject" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Subject</Label>
                <Input
                  id="edit-subject"
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="Enter email subject"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-body" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email HTML Body</Label>
                <ScrollArea className="h-[250px] border rounded-md">
                  <Textarea
                    id="edit-body"
                    value={bodyInput}
                    onChange={(e) => setBodyInput(e.target.value)}
                    className="min-h-[240px] font-mono text-sm p-4 leading-normal resize-none focus-visible:ring-0 focus-visible:ring-offset-0 border-0"
                    placeholder="Enter email HTML content"
                  />
                </ScrollArea>
              </div>

              <div className="space-y-1.5 bg-muted/40 p-3 rounded-lg border">
                <div className="text-xs font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  Available Placeholders
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  You can copy and paste these placeholder tags into the Subject or HTML Body. They will be dynamically replaced when sending:
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {editingTemplate.placeholders.map(p => (
                    <code 
                      key={p} 
                      className="bg-background px-1.5 py-0.5 rounded text-[11px] font-mono border cursor-pointer hover:bg-muted"
                      onClick={() => {
                        // Append tag to cursor or end of body
                        setBodyInput(prev => prev + `{${p}}`);
                      }}
                      title="Click to insert at the end of the body"
                    >
                      {`{${p}}`}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingTemplate(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
