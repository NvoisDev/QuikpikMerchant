import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, X, Image as ImageIcon, Check, Camera, RotateCcw } from "lucide-react";
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
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Handle file input change (works for both regular files and camera)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
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

  // Camera functionality
  const startCamera = async () => {
    try {
      // Check if running over HTTPS or localhost (required for camera access)
      const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!isSecureContext) {
        throw new Error('Camera access requires HTTPS. Please use a secure connection.');
      }

      // Check if camera API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available in this browser. Please try Chrome, Safari, or Firefox.');
      }

      console.log('🎥 Starting camera...');
      console.log('📱 Device info:', { 
        userAgent: navigator.userAgent,
        isSecureContext,
        hasMediaDevices: !!navigator.mediaDevices
      });
      
      // MOBILE FIX: Try with mobile-optimized constraints first, then fallback
      let stream;
      try {
        // Mobile-optimized constraints
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 640, max: 1280 }, // Lower resolution for mobile
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 15, max: 30 } // Lower framerate for mobile
          } 
        });
      } catch (err) {
        console.log('🎥 Back camera failed, trying front camera...', err);
        try {
          // Fallback to front camera with mobile constraints
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user',
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 15, max: 30 }
            } 
          });
        } catch (err2) {
          console.log('🎥 Both cameras failed, trying basic constraints...', err2);
          // Final fallback with minimal constraints
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: true // Just request any video input
          });
        }
      }
      
      console.log('✅ Camera stream obtained');
      setCameraStream(stream);
      setShowCamera(true);
      
      // Set video source and ensure it plays - MOBILE FIX
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // MOBILE FIX: Force video dimensions for mobile browsers
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        
        // Wait for video to load metadata, then play
        videoRef.current.onloadedmetadata = () => {
          console.log('📱 Video metadata loaded, attempting play...');
          if (videoRef.current) {
            // MOBILE FIX: Multiple attempts to play with delays
            const attemptPlay = async () => {
              try {
                await videoRef.current?.play();
                console.log('✅ Video playing successfully');
              } catch (err) {
                console.error('❌ Video play failed, retrying...', err);
                // Retry after a short delay for mobile browsers
                setTimeout(() => {
                  videoRef.current?.play().catch(e => {
                    console.error('❌ Video play retry failed:', e);
                  });
                }, 100);
              }
            };
            attemptPlay();
          }
        };
        
        // MOBILE FIX: Additional event handlers for mobile compatibility
        videoRef.current.oncanplay = () => {
          console.log('📱 Video can play - attempting autoplay');
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(err => {
              console.log('📱 Autoplay blocked, user interaction required');
            });
          }
        };
        
        console.log('✅ Video element connected to stream');
      }
    } catch (error) {
      console.error('❌ Camera error:', error);
      
      let errorMessage = "Could not access camera. ";
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage += "Please allow camera permissions and try again.";
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage += "No camera found on this device.";
        } else if (error.name === 'NotSupportedError' || error.name === 'ConstraintNotSatisfiedError') {
          errorMessage += "Camera format not supported.";
        } else if (error.message.includes('API not available')) {
          errorMessage += "Camera not supported in this browser. Please use Chrome, Firefox, or Safari.";
        } else if (error.message.includes('HTTPS')) {
          errorMessage += "Camera requires a secure connection (HTTPS).";
        } else {
          errorMessage += `Error: ${error.message}`;
        }
      }
      
      toast({
        title: "Camera Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    setCapturedImage(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageDataUrl);
      }
    }
  };

  const useCapturedPhoto = () => {
    if (capturedImage && canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedFiles(prev => [...prev, file].slice(0, maxNumberOfFiles));
          stopCamera();
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  // Close modal handler
  const closeModal = () => {
    setShowModal(false);
    stopCamera();
    setSelectedFiles([]);
    setUploadProgress({});
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

      <Dialog open={showModal} onOpenChange={closeModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {showCamera ? (capturedImage ? "Photo Captured" : "Take Photo") : "Upload Images"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {showCamera ? (
              // Camera interface
              <div className="space-y-4">
                {!capturedImage ? (
                  // Live camera view
                  <div className="relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-64 object-cover rounded-lg bg-black"
                      onCanPlay={() => {
                        console.log('✅ Video can play');
                        if (videoRef.current) {
                          videoRef.current.play().catch(err => {
                            console.error('❌ Video autoplay failed:', err);
                          });
                        }
                      }}
                      onError={(e) => {
                        console.error('❌ Video error:', e);
                      }}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                ) : (
                  // Captured photo preview
                  <div className="relative">
                    <img
                      src={capturedImage}
                      alt="Captured photo"
                      className="w-full h-64 object-cover rounded-lg"
                    />
                  </div>
                )}
                
                <div className="flex justify-center gap-2">
                  {!capturedImage ? (
                    <>
                      <Button variant="outline" onClick={stopCamera}>
                        Cancel
                      </Button>
                      <Button onClick={capturePhoto} className="bg-green-600 hover:bg-green-700">
                        <Camera className="h-4 w-4 mr-2" />
                        Capture
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={retakePhoto}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Retake
                      </Button>
                      <Button onClick={useCapturedPhoto} className="bg-green-600 hover:bg-green-700">
                        <Check className="h-4 w-4 mr-2" />
                        Use Photo
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // File selection interface
              <>
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
                  <p className="text-sm text-gray-600 mb-3">
                    Drag and drop images here, or use the options below
                  </p>
                  <p className="text-xs text-blue-600 mb-3">
                    📱 <strong>Camera:</strong> Opens your device's camera app • <strong>📷:</strong> Uses web camera
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <input
                      type="file"
                      multiple={maxNumberOfFiles > 1}
                      accept="image/*"
                      onChange={handleInputChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="text-xs"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Select Images
                    </Button>
                    
                    {/* Mobile Camera Options */}
                    <div className="flex gap-1">
                      {/* Native Camera (Mobile-First) */}
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => document.getElementById('camera-upload')?.click()}
                        className="text-xs"
                        title="Use your device's camera app"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Camera
                      </Button>
                      
                      {/* Web Camera (Fallback) */}
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => {
                          console.log('📷 Web camera button clicked');
                          startCamera();
                        }}
                        className="text-xs px-2"
                        title="Use web camera"
                      >
                        📷
                      </Button>
                    </div>
                    
                    {/* Hidden Camera Input */}
                    <input
                      id="camera-upload"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple={maxNumberOfFiles > 1}
                      onChange={handleInputChange}
                      className="hidden"
                    />
                    
                  </div>
                </div>
              </>
            )}

            {/* Selected Files - Only show when not in camera mode */}
            {!showCamera && selectedFiles.length > 0 && (
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

            {/* Upload Button - Only show when not in camera mode */}
            {!showCamera && (
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={closeModal}
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
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}