import { useState, useRef } from "react";
import { Upload, Camera, Image as ImageIcon, Check, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LogoUploaderProps {
  onUploadComplete: (logoUrl: string) => void;
  currentLogoUrl?: string;
}

export function LogoUploader({ onUploadComplete, currentLogoUrl }: LogoUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) {
      return "Please upload an image file (PNG, JPG, GIF, etc.)";
    }
    if (file.size > 5 * 1024 * 1024) {
      return "File size must be less than 5MB";
    }
    return null;
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast({
        title: "Invalid file",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    // Create preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      setUploadProgress(30);

      // Step 1: Get upload URL
      const response = await fetch('/api/logo-upload-url', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get upload URL: ${errorText}`);
      }

      const data = await response.json();
      if (!data.uploadURL) {
        throw new Error('No upload URL received');
      }

      setUploadProgress(60);

      // Step 2: Upload to object storage
      const uploadResponse = await fetch(data.uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      setUploadProgress(100);

      // Step 3: Extract public URL
      const uploadUrl = new URL(data.uploadURL);
      const publicUrl = `${uploadUrl.origin}${uploadUrl.pathname}`;

      toast({
        title: "Upload successful!",
        description: "Your logo has been uploaded successfully.",
      });

      // Complete the upload
      setTimeout(() => {
        onUploadComplete(publicUrl);
        handleClose();
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = "Upload failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Authentication')) {
          errorMessage = "Please refresh the page and log in again.";
        } else if (error.message.includes('413')) {
          errorMessage = "File too large. Please use a smaller image.";
        }
      }

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });

      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleClose = () => {
    setShowModal(false);
    setPreviewUrl(null);
    setIsUploading(false);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={() => setShowModal(true)}
        variant="outline"
        className="flex items-center gap-2"
        disabled={isUploading}
      >
        <Upload className="w-4 h-4" />
        Upload Logo
      </Button>

      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Logo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!previewUrl && (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragOver 
                    ? 'border-blue-400 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <Upload className="w-12 h-12 text-gray-400" />
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">
                      Drag and drop your logo here, or click to browse
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      PNG, JPG, GIF up to 5MB
                    </p>
                  </div>

                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      Browse Files
                    </Button>
                    
                    <Button
                      onClick={() => cameraInputRef.current?.click()}
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                    >
                      <Camera className="w-4 h-4 mr-1" />
                      Camera
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {previewUrl && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={previewUrl}
                    alt="Logo preview"
                    className="max-w-full max-h-48 object-contain rounded-lg border"
                  />
                </div>
                
                {isUploading && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 text-center">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                {!isUploading && uploadProgress === 0 && (
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => {
                        setPreviewUrl(null);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}