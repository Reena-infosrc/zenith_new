import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { Button } from './button';
import { X, Crop as CropIcon, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageCropProps {
  src: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
  aspectRatio?: number;
  circularCrop?: boolean;
}

export function ImageCrop({ 
  src, 
  onCropComplete, 
  onCancel, 
  aspectRatio = 1, 
  circularCrop = true 
}: ImageCropProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // More surgical approach - only disable pointer events on overlays, not content
  useEffect(() => {
    // Only disable overlays, not the dialog content itself
    const allOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
    
    // Disable pointer events on overlays only
    allOverlays.forEach(overlay => {
      if (!overlay.closest('[data-crop-modal]')) {
        (overlay as HTMLElement).style.pointerEvents = 'none';
      }
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Cleanup function
    return () => {
      allOverlays.forEach(overlay => {
        (overlay as HTMLElement).style.pointerEvents = 'auto';
      });
      document.body.style.overflow = 'auto';
    };
  }, []);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        aspectRatio,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  }, [aspectRatio]);

  const getCroppedImg = useCallback(
    async (
      image: HTMLImageElement,
      canvas: HTMLCanvasElement,
      crop: PixelCrop
    ): Promise<Blob | null> => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('No 2d context');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const pixelRatio = window.devicePixelRatio;

      canvas.width = crop.width * pixelRatio;
      canvas.height = crop.height * pixelRatio;

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.imageSmoothingQuality = 'high';

      if (circularCrop) {
        ctx.beginPath();
        ctx.arc(crop.width / 2, crop.height / 2, crop.width / 2, 0, 2 * Math.PI);
        ctx.clip();
      }

      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );

      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          'image/jpeg',
          0.9
        );
      });
    },
    [circularCrop]
  );

  const handleCropComplete = async () => {
    if (!completedCrop || !imgRef.current || !canvasRef.current) {
      return;
    }

    try {
      const croppedImageBlob = await getCroppedImg(
        imgRef.current,
        canvasRef.current,
        completedCrop
      );
      
      if (croppedImageBlob) {
        onCropComplete(croppedImageBlob);
      }
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  };

  const handleRotate = () => {
    setRotate(prev => (prev + 90) % 360);
  };

  const handleReset = () => {
    setScale(1);
    setRotate(0);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      const crop = centerCrop(
        makeAspectCrop(
          {
            unit: '%',
            width: 90,
          },
          aspectRatio,
          width,
          height
        ),
        width,
        height
      );
      setCrop(crop);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
      style={{ pointerEvents: 'auto' }}
      data-crop-modal="true"
      onClick={(e) => {
        // Only prevent backdrop clicks from closing
        if (e.target === e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div 
        className="bg-background rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => {
          // Prevent clicks inside the modal from bubbling up
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CropIcon className="h-5 w-5" />
            Crop Profile Picture
          </h3>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Scale:</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
            </div>
            
            <Button variant="outline" size="sm" onClick={handleRotate}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Rotate
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleReset}>
              Reset
            </Button>
          </div>

          {/* Image Crop Area */}
          <div className="flex justify-center">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspectRatio}
              circularCrop={circularCrop}
              className="max-w-full max-h-[400px]"
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={src}
                style={{
                  transform: `scale(${scale}) rotate(${rotate}deg)`,
                  maxWidth: '100%',
                  maxHeight: '400px',
                }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleCropComplete} disabled={!completedCrop}>
              Apply Crop
            </Button>
          </div>
        </div>

        {/* Hidden canvas for processing */}
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>
    </div>,
    document.body
  );
}
