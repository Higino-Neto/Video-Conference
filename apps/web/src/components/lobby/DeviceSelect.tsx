
import { ChevronDown, Mic, Camera, Volume2 } from 'lucide-react';

interface DeviceSelectProps {
  label: string;
  kind: MediaDeviceKind;
  devices: MediaDeviceInfo[];
  value: string;
  disabled?: boolean;
  unsupportedMessage?: string;
  onChange: (kind: MediaDeviceKind, deviceId: string) => void;
}

export function DeviceSelect({
  label,
  kind,
  devices,
  value,
  disabled = false,
  unsupportedMessage,
  onChange,
}: DeviceSelectProps) {
  const selectedDeviceIsMissing =
    Boolean(value) &&
    !devices.some((device) => device.deviceId === value);

  const isDisabled = disabled || devices.length === 0;

  const Icon =
    kind === 'audioinput'
      ? Mic
      : kind === 'videoinput'
        ? Camera
        : Volume2;

  return (
    <label className="group grid gap-2 text-sm bg-zinc-900">
      <span className="font-medium text-zinc-300 transition-colors group-focus-within:text-zinc-100">
        {label}
      </span>

      <span className="relative block">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 transition-colors ${
            isDisabled ? 'text-zinc-600' : 'text-zinc-400'
          }`}
        >
          <Icon size={16} strokeWidth={1.8} />
        </span>

        <select
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(kind, event.target.value)}
          className={`
            min-h-11 w-full appearance-none rounded-md
            border bg-[#191A1E] py-2 pl-10 pr-10
            text-sm text-zinc-100
            outline-none transition-[border-color,background-color,box-shadow]
            ${
              isDisabled
                ? 'cursor-not-allowed border-zinc-800 text-zinc-500 opacity-70'
                : 'cursor-pointer border-zinc-700 hover:border-zinc-600 hover:bg-[#1D1E22] focus:border-zinc-500 focus:bg-[#1D1E22] focus:ring-2 focus:ring-white/10'
            }
          `}
        >
          {devices.length === 0 ? (
            <option value="">
              {unsupportedMessage ?? 'Nenhum dispositivo encontrado'}
            </option>
          ) : (
            <>
              {selectedDeviceIsMissing && (
                <option value={value} disabled>
                  Dispositivo desconectado — escolha outro
                </option>
              )}

              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `${label} ${index + 1}`}
                </option>
              ))}
            </>
          )}
        </select>

        <ChevronDown
          aria-hidden="true"
          size={16}
          strokeWidth={1.8}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
            isDisabled ? 'text-zinc-600' : 'text-zinc-400'
          }`}
        />
      </span>

      {selectedDeviceIsMissing && (
        <span role="status" className="text-xs text-zinc-400">
          O dispositivo selecionado não está mais disponível.
        </span>
      )}
    </label>
  );
}
