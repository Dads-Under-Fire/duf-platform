import { useState, useRef } from "react";
import { Upload, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";

interface EvidenceSectionProps {
  evidenceNote: string;
  onEvidenceNoteChange: (note: string) => void;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
}

export function EvidenceSection({
  evidenceNote,
  onEvidenceNoteChange,
  selectedFile,
  onFileChange,
}: EvidenceSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      alert("File must be under 10MB");
      return;
    }
    onFileChange(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      alert("File must be under 10MB");
      return;
    }
    onFileChange(file);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Evidence</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Attachments / Evidence</Label>

          {isMobile ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-primary border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                {selectedFile ? selectedFile.name : "Upload Evidence"}
              </Button>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-6 flex items-center gap-4 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                {selectedFile ? (
                  <p className="text-sm text-foreground truncate">{selectedFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select a file or drag and drop here
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG or PDF, file size no more than 10MB
                    </p>
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                SELECT FILE
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Evidence note (optional)</Label>
          <Textarea
            value={evidenceNote}
            onChange={(e) => onEvidenceNoteChange(e.target.value)}
            placeholder="Briefly explain what this file shows."
            className="min-h-[100px] bg-secondary border-border"
          />
        </div>
      </div>
    </div>
  );
}
