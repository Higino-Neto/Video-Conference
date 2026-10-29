import { CameraOff } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface CameraPreviewProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
}

export function CameraPreview({
  stream,
  cameraEnabled,
}: CameraPreviewProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;

    if (video) {
      video.srcObject = stream;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md bg-zinc-950 ring-1 ring-zinc-800 sm:aspect-video sm:max-w-none">
      {stream && cameraEnabled ? (
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-zinc-500">
          <CameraOff size={36} strokeWidth={1.5} />

          <span className="max-w-[240px] text-sm leading-relaxed">
            Câmera desligada — entrada somente com áudio disponível
          </span>
        </div>
      )}
    </div>
  );
}