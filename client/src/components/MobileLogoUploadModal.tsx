import { useState, useRef, useCallback } from "react";
import { Upload, X, Camera, Image as ImageIcon, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface MobileLogoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (logoUrl: string) => void;
  currentLogoUrl?: string;
}

export function MobileLogoUploadModal({ 
  isOpen, 
  onClose, 
  onUploadComplete, 
  currentLogoUrl 
}: MobileLogoUploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
    setUploadProgress(0);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      console.log('🔧 Logo upload: Getting upload URL from backend...');
      
      // Get upload URL from backend
      const response = await apiRequest('POST', '/api/logo-upload-url');
      console.log('🔧 Logo upload: Backend response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔧 Logo upload: Backend error:', errorText);
        throw new Error(`Backend error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      console.log('🔧 Logo upload: Got upload URL:', !!data.uploadURL);
      
      if (!data.uploadURL) {
        throw new Error('Failed to get upload URL');
      }

      clearInterval(progressInterval);
      setUploadProgress(95);

      // Upload file directly to object storage
      console.log('🔧 Logo upload: Uploading to object storage...');
      const uploadResponse = await fetch(data.uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      console.log('🔧 Logo upload: Object storage response:', uploadResponse.status);
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('🔧 Logo upload: Object storage error:', errorText);
        throw new Error(`Object storage error (${uploadResponse.status}): ${errorText}`);
      }

      setUploadProgress(100);

      // Extract the public URL from the upload URL
      const uploadUrl = new URL(data.uploadURL);
      const publicUrl = `${uploadUrl.origin}${uploadUrl.pathname}`;
      
      toast({
        title: "Logo uploaded successfully",
        description: "Your logo is ready to use!",
      });

      setTimeout(() => {
        onUploadComplete(publicUrl);
        onClose();
      }, 1000);

    } catch (error) {
      console.error('🔧 Logo upload: Full error:', error);
      let errorMessage = "Unable to upload logo. Please try again.";
      
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Authentication')) {
          errorMessage = "Session expired. Please refresh the page and log in again.";
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          errorMessage = "Permission denied. Please contact support.";
        } else if (error.message.includes('Backend error')) {
          errorMessage = error.message;
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md md:rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b md:p-6">
          <h2 className="text-xl font-semibold text-gray-900">Upload Logo</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isUploading}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 space-y-6">
          {/* Current Logo Preview */}
          {currentLogoUrl && !previewUrl && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">Current logo:</p>
              <img 
                src={currentLogoUrl} 
                alt="Current logo" 
                className="w-16 h-16 mx-auto rounded-lg object-contain border"
              />
            </div>
          )}

          {/* Upload Preview */}
          {previewUrl && (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-3">
                {isUploading ? 'Uploading...' : 'Preview:'}
              </p>
              <div className="relative">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-24 h-24 mx-auto rounded-lg object-contain border"
                />
                {uploadProgress === 100 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-500 bg-opacity-75 rounded-lg">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                )}
              </div>
              {isUploading && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{uploadProgress}%</p>
                </div>
              )}
            </div>
          )}

          {/* Upload Area */}
          {!isUploading && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                Drag and drop your logo here, or tap to browse
              </p>
              
              {/* Mobile-friendly upload buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <ImageIcon className="w-5 h-5 mr-2" />
                  Choose from Gallery
                </button>
                
                {/* Camera option for mobile */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center justify-center px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Take Photo
                </button>
              </div>
            </div>
          )}

          {/* File inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Upload Guidelines
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Supported formats: PNG, JPG, GIF, WebP</li>
              <li>• Maximum file size: 5MB</li>
              <li>• Best results: Square images (200x200px or larger)</li>
              <li>• PNG with transparent background recommended</li>
            </ul>
          </div>

          {/* Action Buttons */}
          {!isUploading && (
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}