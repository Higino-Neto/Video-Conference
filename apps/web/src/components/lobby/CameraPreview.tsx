import { CameraOff } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface CameraPreviewProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
}

export function CameraPreview({ stream, cameraEnabled }: CameraPreviewProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (video) video.srcObject = stream;
    return () => {
      if (video) video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="relative aspect-[3/4] sm:aspect-video overflow-hidden rounded-md bg-zinc-950 ring-1 ring-zinc-800">
      {stream && cameraEnabled ? (
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          className="h-full w-full rounded-md scale-x-[-1] object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
          <CameraOff size={36} />
          <span className="text-sm">Câmera desligada — entrada somente com áudio disponível</span>
        </div>
      )}
    </div>
  );
}
