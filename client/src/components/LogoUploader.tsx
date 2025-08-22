import { useState } from "react";
import { Upload, Smartphone } from "lucide-react";
import { MobileLogoUploadModal } from "./MobileLogoUploadModal";

interface LogoUploaderProps {
  onUploadComplete: (logoUrl: string) => void;
  currentLogoUrl?: string;
}

export function LogoUploader({ onUploadComplete, currentLogoUrl }: LogoUploaderProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="ml-6 mt-2 space-y-2">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
        >
          <Smartphone className="w-4 h-4 mr-2" />
          Upload Logo
        </button>
      </div>
      
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Mobile-friendly upload modal</p>
        <p>• Take photo or choose from gallery</p>
        <p>• Drag and drop support</p>
        <p>• Maximum file size: 5MB</p>
      </div>
      
      <div className="text-xs text-gray-400 italic">
        Or enter a logo URL manually in the field below
      </div>

      <MobileLogoUploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUploadComplete={onUploadComplete}
        currentLogoUrl={currentLogoUrl}
      />
    </div>
  );
}