import { useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus, X } from 'lucide-react';
import type { Attachment } from '../lib/types';

interface ImageUploadProps {
  images: Attachment[];
  onChange: (images: Attachment[]) => void;
}

export default function ImageUpload({ images, onChange }: ImageUploadProps) {
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    let pending = acceptedFiles.length;
    const newAttachments: Attachment[] = [];

    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newAttachments.push({
          type: 'image',
          data: reader.result as string,
          name: file.name,
        });
        pending--;
        if (pending === 0) {
          onChange([...imagesRef.current, ...newAttachments]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
    maxSize: 5 * 1024 * 1024,
  });

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-[var(--color-border)]">
              <img src={img.url ?? img.data} alt={img.name} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        {...getRootProps()}
        className={`border border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer text-xs transition-colors ${
          isDragActive
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] bg-opacity-10'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-light)] text-[var(--color-text-muted)]'
        }`}
      >
        <input {...getInputProps()} />
        <ImagePlus size={14} />
        <span>Add images</span>
      </div>
    </div>
  );
}
