import {
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RemoteTrackPublication, Track } from 'livekit-client';
import type { ThumbnailLayoutPreferences, ThumbnailSize } from '../../lib/storage.js';
import { ParticipantVideo } from './ParticipantVideo.js';

interface StageItem {
  key: string;
  trackRef: TrackReferenceOrPlaceholder;
  screenShare: boolean;
}

export function VideoStage({ layout }: { layout: ThumbnailLayoutPreferences }) {
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);
  const [focusedKey, setFocusedKey] = useState<string>();
  const [thumbnailsHidden, setThumbnailsHidden] = useState(false);
  const [page, setPage] = useState(0);
  const previousScreenKey = useRef<string | undefined>(undefined);

  const items = useMemo<StageItem[]>(() => {
    const screens = screenTracks.map((trackRef) => ({
      key: `screen:${trackRef.participant.identity}`,
      trackRef,
      screenShare: true,
    }));
    const cameras = [...cameraTracks]
      .sort((left, right) => Number(left.participant.isLocal) - Number(right.participant.isLocal))
      .map((trackRef) => ({
        key: `camera:${trackRef.participant.identity}`,
        trackRef,
        screenShare: false,
      }));
    return [...screens, ...cameras];
  }, [cameraTracks, screenTracks]);

  const firstScreenKey = screenTracks[0]
    ? `screen:${screenTracks[0].participant.identity}`
    : undefined;
  useEffect(() => {
    if (firstScreenKey && firstScreenKey !== previousScreenKey.current) {
      setFocusedKey(firstScreenKey);
    }
    previousScreenKey.current = firstScreenKey;
  }, [firstScreenKey]);

  const validFocusedKey = items.some((item) => item.key === focusedKey) ? focusedKey : undefined;
  const main = items.find((item) => item.key === validFocusedKey) ?? items[0];
  const thumbnails = useMemo(
    () => items.filter((item) => item.key !== main?.key),
    [items, main?.key],
  );
  const pageSize = PAGE_SIZES[layout.size];
  const pageCount = Math.max(1, Math.ceil(thumbnails.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleThumbnails = useMemo(
    () => thumbnails.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [pageSize, safePage, thumbnails],
  );
  const dockDirection = layout.overlay ? '' : DOCK_DIRECTIONS[layout.position];

  const visibleCameraIdentities = useMemo(() => {
    const identities = new Set<string>();
    if (main && !main.screenShare) identities.add(main.trackRef.participant.identity);
    for (const item of visibleThumbnails) {
      if (!item.screenShare) identities.add(item.trackRef.participant.identity);
    }
    return identities;
  }, [main, visibleThumbnails]);

  useEffect(() => {
    for (const trackRef of cameraTracks) {
      if (!trackRef.participant.isLocal && isTrackReference(trackRef)) {
        const publication = trackRef.publication;
        if (publication instanceof RemoteTrackPublication) {
          const shouldSubscribe = visibleCameraIdentities.has(trackRef.participant.identity);
          if (publication.isSubscribed !== shouldSubscribe) {
            try {
              publication.setSubscribed(shouldSubscribe);
            } catch {
              // A disconnected publication may reject while the participant list is refreshing.
            }
          }
        }
      }
    }
  }, [cameraTracks, visibleCameraIdentities]);

  return (
    <div
      className={`relative flex h-full min-h-0 w-full overflow-hidden bg-black pb-20 ${dockDirection}`}
    >
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {main ? (
          <ParticipantVideo
            trackRef={main.trackRef}
            mirror={main.trackRef.participant.isLocal && !main.screenShare}
            contain={main.screenShare}
            screenShare={main.screenShare}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Conectando participantes…
          </div>
        )}

        {thumbnails.length > 0 && thumbnailsHidden && (
          <button
            type="button"
            className={`ui-motion glass absolute z-20 flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200 shadow-xl ${COLLAPSED_POSITIONS[layout.position]}`}
            aria-label={`Mostrar ${thumbnails.length} miniaturas`}
            onClick={() => setThumbnailsHidden(false)}
          >
            <Eye size={15} />
            <Users size={15} />
            {thumbnails.length}
          </button>
        )}

        {layout.overlay && thumbnails.length > 0 && !thumbnailsHidden && (
          <ThumbnailRail
            items={visibleThumbnails}
            total={thumbnails.length}
            layout={layout}
            page={safePage}
            pageCount={pageCount}
            onPage={setPage}
            onFocus={setFocusedKey}
            onHide={() => setThumbnailsHidden(true)}
            overlay
          />
        )}
      </div>

      {!layout.overlay && thumbnails.length > 0 && !thumbnailsHidden && (
        <ThumbnailRail
          items={visibleThumbnails}
          total={thumbnails.length}
          layout={layout}
          page={safePage}
          pageCount={pageCount}
          onPage={setPage}
          onFocus={setFocusedKey}
          onHide={() => setThumbnailsHidden(true)}
        />
      )}
    </div>
  );
}

interface ThumbnailRailProps {
  items: StageItem[];
  total: number;
  layout: ThumbnailLayoutPreferences;
  page: number;
  pageCount: number;
  overlay?: boolean;
  onPage(page: number): void;
  onFocus(key: string): void;
  onHide(): void;
}

function ThumbnailRail({
  items,
  total,
  layout,
  page,
  pageCount,
  overlay,
  onPage,
  onFocus,
  onHide,
}: ThumbnailRailProps) {
  const horizontal = layout.position === 'bottom' || layout.position === 'top';
  const positioning = overlay ? OVERLAY_POSITIONS[layout.position] : 'relative shrink-0';
  const dimensions = horizontal
    ? `${RAIL_HEIGHTS[layout.size]} ${overlay ? '' : 'w-full'}`
    : `${RAIL_WIDTHS[layout.size]} ${overlay ? '' : 'h-full'}`;

  return (
    <aside
      aria-label="Outros participantes e compartilhamentos"
      className={`z-10 flex gap-2 p-2 ${
        overlay ? 'bg-transparent' : 'glass border-white/10 shadow-2xl'
      } ${positioning} ${dimensions} ${
        horizontal
          ? `flex-row-reverse ${overlay ? '' : 'border-y'}`
          : `flex-col ${overlay ? '' : 'border-x'}`
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-center gap-1 text-xs text-zinc-400 ${horizontal ? 'flex-col px-1' : 'flex-row py-1'}`}
      >
        <button
          type="button"
          className="ui-motion rounded-md p-2 hover:bg-white/10 hover:text-white"
          title="Ocultar miniaturas"
          aria-label="Ocultar miniaturas"
          onClick={onHide}
        >
          <EyeOff size={16} />
        </button>
        <span aria-label={`${total} miniaturas`}>{total}</span>
        {pageCount > 1 && (
          <>
            <button
              type="button"
              className="ui-motion rounded-md p-2 hover:bg-white/10 disabled:opacity-30"
              aria-label="Página anterior de participantes"
              disabled={page === 0}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {page + 1}/{pageCount}
            </span>
            <button
              type="button"
              className="ui-motion rounded-md p-2 hover:bg-white/10 disabled:opacity-30"
              aria-label="Próxima página de participantes"
              disabled={page === pageCount - 1}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
      <div
        className={`flex min-h-0 min-w-0 flex-1 gap-2 overflow-auto p-1 ${horizontal ? 'flex-row-reverse' : 'flex-col'}`}
      >
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            aria-label={`Colocar ${participantLabel(item)} em foco`}
            title={`Colocar ${participantLabel(item)} em foco`}
            className={`ui-motion shrink-0 rounded-md border border-zinc-900/15 text-left shadow-lg hover:-translate-y-0.5 hover:border-zinc-900 ${TILE_SIZES[layout.size]}`}
            onClick={() => onFocus(item.key)}
          >
            <ParticipantVideo
              trackRef={item.trackRef}
              mirror={item.trackRef.participant.isLocal && !item.screenShare}
              contain={item.screenShare}
              compact
              screenShare={item.screenShare}
            />
          </button>
        ))}
      </div>
    </aside>
  );
}

function participantLabel(item: StageItem) {
  const participant = item.trackRef.participant;
  const name = participant.name || (participant.isLocal ? 'você' : 'convidado');
  return item.screenShare ? `compartilhamento de ${name}` : name;
}

const PAGE_SIZES: Record<ThumbnailSize, number> = { small: 20, medium: 12, large: 8 };
const TILE_SIZES: Record<ThumbnailSize, string> = {
  small: 'h-20 w-32',
  medium: 'h-28 w-44',
  large: 'h-36 w-56',
};
const RAIL_HEIGHTS: Record<ThumbnailSize, string> = {
  small: 'h-28',
  medium: 'h-36',
  large: 'h-44',
};
const RAIL_WIDTHS: Record<ThumbnailSize, string> = {
  small: 'w-40',
  medium: 'w-52',
  large: 'w-64',
};
const DOCK_DIRECTIONS = {
  bottom: 'flex-col',
  top: 'flex-col-reverse',
  left: 'flex-row-reverse',
  right: 'flex-row',
} as const;
const OVERLAY_POSITIONS = {
  bottom: 'absolute inset-x-3 bottom-3 max-h-[45%]',
  top: 'absolute inset-x-3 top-3 max-h-[45%]',
  left: 'absolute inset-y-3 left-3 max-w-[45%]',
  right: 'absolute inset-y-3 right-3 max-w-[45%]',
} as const;
const COLLAPSED_POSITIONS = {
  bottom: 'bottom-3 right-3',
  top: 'right-3 top-3',
  left: 'left-3 top-3',
  right: 'right-3 top-3',
} as const;
