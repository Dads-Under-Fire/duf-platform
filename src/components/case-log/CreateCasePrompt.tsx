import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardPlus } from "lucide-react";

interface CreateCasePromptProps {
  onCreateCase: (caseName: string) => void;
  isLoading: boolean;
}

export function CreateCasePrompt({ onCreateCase, isLoading }: CreateCasePromptProps) {
  const [caseName, setCaseName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (caseName.trim()) {
      onCreateCase(caseName.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
      <ClipboardPlus className="h-16 w-16 text-muted-foreground/50" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Create Your First Case</h1>
        <p className="text-muted-foreground max-w-md">
          Start documenting your case by giving it a name. You can create additional cases later.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <Input
          value={caseName}
          onChange={(e) => setCaseName(e.target.value)}
          placeholder="e.g. Custody Case - 2026"
          className="text-center"
          autoFocus
        />
        <Button
          type="submit"
          disabled={!caseName.trim() || isLoading}
          className="w-full"
        >
          {isLoading ? "Creating..." : "Create Case"}
        </Button>
      </form>
    </div>
  );
}
