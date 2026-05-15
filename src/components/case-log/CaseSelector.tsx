import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Case } from "@/types/caseLog";

interface CaseSelectorProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onCreateCase: (caseName: string) => Promise<void>;
  onDeleteCase: (caseId: string) => Promise<void>;
  isCreating?: boolean;
  isDeleting?: boolean;
}

export function CaseSelector({
  cases,
  activeCaseId,
  onSelectCase,
  onCreateCase,
  onDeleteCase,
  isCreating,
  isDeleting,
}: CaseSelectorProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");

  if (cases.length === 0) return null;

  const activeCase = cases.find((c) => c.id === activeCaseId);

  const handleCreate = async () => {
    if (!newCaseName.trim()) return;
    await onCreateCase(newCaseName.trim());
    setNewCaseName("");
    setShowCreateDialog(false);
  };

  const handleDelete = async () => {
    if (!activeCaseId) return;
    await onDeleteCase(activeCaseId);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="relative w-full flex items-center justify-center py-3 border-b border-border">
        <Select value={activeCaseId ?? undefined} onValueChange={onSelectCase}>
          <SelectTrigger className="w-auto min-w-[220px] border-0 bg-transparent text-foreground justify-center gap-2 text-sm font-medium focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Select a case..." />
          </SelectTrigger>
          <SelectContent>
            {cases.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.case_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="absolute right-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setShowCreateDialog(true)}
            title="Create new case"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {activeCaseId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              title="Delete case"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Create Case Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Case</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Enter case name..."
            value={newCaseName}
            onChange={(e) => setNewCaseName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newCaseName.trim() || isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Case</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{activeCase?.case_name}"? This will permanently remove the case and all its log entries and attachments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
