import { useState, useRef } from "react";
import { Upload, Paperclip, FileText, Image, File as FileIcon, X, Trash2 } from "lucide-react";
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
  selectedFiles: File[];
  onFilesChange: (files: File[]) => void;
}

export function EvidenceSection({
  evidenceNote,
  onEvidenceNoteChange,
  selectedFiles = [],
  onFilesChange,
}: EvidenceSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const validateAndAddFiles = (incoming: FileList | null) => {
    setFileError(null);
    if (!incoming || incoming.length === 0) return;

    const errors: string[] = [];
    const valid: File[] = [];

    Array.from(incoming).forEach((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: invalid type. Only JPG, PNG, and PDF are accepted.`);
      } else if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: too large (${formatFileSize(file.size)}). Max 10MB.`);
      } else {
        valid.push(file);
      }
    });

    if (errors.length > 0) {
      setFileError(errors.join(" "));
    }

    if (valid.length > 0) {
      onFilesChange([...selectedFiles, ...valid]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAddFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    validateAndAddFiles(e.dataTransfer.files);
  };

  const handleRemoveFile = (index: number) => {
    onFilesChange(selectedFiles.filter((_, i) => i !== index));
  };

  const handleRemoveAll = () => {
    onFilesChange([]);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Evidence</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Attachments / Evidence</Label>

          {/* Drop zone / add button — always shown when no files or to add more */}
          {isMobile ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-primary border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                {selectedFiles.length > 0 ? "Add More Files" : "Upload Evidence"}
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
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length > 0
                    ? "Drop more files here or select"
                    : "Select a file or drag and drop here"}
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

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              {selectedFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="border border-border rounded-lg p-3 flex items-center gap-3 bg-secondary">
                  <FileTypeIcon type={file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getFileExtension(file.name)} &middot; {formatFileSize(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveFile(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {selectedFiles.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemoveAll}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove all
                </Button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
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
