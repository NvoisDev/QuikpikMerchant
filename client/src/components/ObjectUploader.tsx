import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, X, Image as ImageIcon, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: { successful: Array<{ url: string; name: string }> }) => void;
  buttonClassName?: string;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * A simple file upload component with drag-and-drop support
 * Optimized for image uploads to object storage
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
  disabled = false,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      if (file.size > maxFileSize) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`,
          variant: "destructive"
        });
        return false;
      }
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file`,
          variant: "destructive"
        });
        return false;
      }
      return true;
    });

    if (validFiles.length + selectedFiles.length > maxNumberOfFiles) {
      toast({
        title: "Too many files",
        description: `You can only upload ${maxNumberOfFiles} file${maxNumberOfFiles > 1 ? 's' : ''}`,
        variant: "destructive"
      });
      return;
    }

    setSelectedFiles(prev => [...prev, ...validFiles].slice(0, maxNumberOfFiles));
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const successful: Array<{ url: string; name: string }> = [];

    try {
      for (const file of selectedFiles) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        // Get upload URL from backend
        const { url } = await onGetUploadParameters();

        // Upload file
        const uploadResponse = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (uploadResponse.ok) {
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          successful.push({ 
            url: url.split('?')[0], // Remove query parameters
            name: file.name 
          });
        } else {
          throw new Error(`Failed to upload ${file.name}`);
        }
      }

      toast({
        title: "Upload successful",
        description: `${successful.length} image${successful.length > 1 ? 's' : ''} uploaded successfully`,
      });

      onComplete?.({ successful });
      setShowModal(false);
      setSelectedFiles([]);
      setUploadProgress({});
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        disabled={disabled}
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Images</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* File Drop Zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-500 transition-colors"
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <ImageIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop images here, or click to select
              </p>
              <input
                type="file"
                multiple={maxNumberOfFiles > 1}
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                id="file-upload"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Select Images
              </Button>
            </div>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Selected Files:</h4>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-green-600" />
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(file.size / 1024 / 1024).toFixed(1)}MB)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadProgress[file.name] === 100 && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                      {!isUploading && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowModal(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button 
                onClick={uploadFiles}
                disabled={selectedFiles.length === 0 || isUploading}
              >
                {isUploading ? "Uploading..." : `Upload ${selectedFiles.length} Image${selectedFiles.length > 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}