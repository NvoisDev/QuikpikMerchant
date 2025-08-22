import { useState } from "react";
import { Upload, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface LogoUploaderProps {
  onUploadComplete: (logoUrl: string) => void;
}

export function LogoUploader({ onUploadComplete }: LogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get upload URL from backend
      const response = await apiRequest('POST', '/api/logo-upload-url');
      const data = await response.json();
      
      if (!data.uploadURL) {
        throw new Error('Failed to get upload URL');
      }

      // Upload file directly to object storage
      const uploadResponse = await fetch(data.uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Extract the public URL from the upload URL
      const uploadUrl = new URL(data.uploadURL);
      const publicUrl = `${uploadUrl.origin}${uploadUrl.pathname}`;
      
      toast({
        title: "Logo uploaded successfully",
        description: "Your logo has been uploaded and is ready to use.",
      });

      onUploadComplete(publicUrl);

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Unable to upload logo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset the input
      event.target.value = '';
    }
  };

  return (
    <div className="ml-6 mt-2 space-y-2">
      <div className="flex items-center space-x-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
          <div className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50">
            {isUploading ? (
              <div className="animate-spin w-4 h-4 border-2 border-blue-700 border-t-transparent rounded-full mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {isUploading ? 'Uploading...' : 'Choose File'}
          </div>
        </label>
      </div>
      
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Upload from your computer or phone</p>
        <p>• Best format: PNG with transparent background</p>
        <p>• Recommended size: 200x200px or larger</p>
        <p>• Maximum file size: 5MB</p>
      </div>
      
      <div className="text-xs text-gray-400 italic">
        Or enter a logo URL manually in the field above
      </div>
    </div>
  );
}