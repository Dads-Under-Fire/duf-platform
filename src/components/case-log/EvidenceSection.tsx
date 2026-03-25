import { useState, useRef } from "react";
import { Upload, Paperclip, FileText, Image, File as FileIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "";
}

function FileTypeIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="h-5 w-5 text-primary shrink-0" />;
  if (type === "application/pdf") return <FileText className="h-5 w-5 text-primary shrink-0" />;
  return <FileIcon className="h-5 w-5 text-primary shrink-0" />;
}

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
  const [fileError, setFileError] = useState<string | null>(null);

  const validateAndSetFile = (file: File | null) => {
    setFileError(null);
    if (!file) {
      onFileChange(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Invalid file type. Only JPG, PNG, and PDF are accepted.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File is too large (${formatFileSize(file.size)}). Maximum size is 10MB.`);
      return;
    }
    onFileChange(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(e.target.files?.[0] ?? null);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    validateAndSetFile(e.dataTransfer.files?.[0] ?? null);
  };

  const handleRemove = () => {
    onFileChange(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Evidence</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Attachments / Evidence</Label>

          {selectedFile ? (
            /* --- Uploaded file state --- */
            <div className="border border-border rounded-lg p-4 flex items-center gap-3 bg-secondary">
              <FileTypeIcon type={selectedFile.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {getFileExtension(selectedFile.name)} &middot; {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : isMobile ? (
            /* --- Mobile empty state --- */
            <div>
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-primary border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                Upload Evidence
              </Button>
            </div>
          ) : (
            /* --- Desktop empty state --- */
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
                <p className="text-sm text-muted-foreground">
                  Select a file or drag and drop here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG or PDF, file size no more than 10MB
                </p>
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

          {fileError && (
            <p className="text-sm text-destructive">{fileError}</p>
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
