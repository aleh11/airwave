import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createStation,
  discoverStations,
  getStations,
  getStats,
  removeStation,
  setFavorite,
  type StationDraft,
  updateStation,
} from "./api.ts";
import { Icon } from "./components/Icon.tsx";
import { useRadioSocket } from "./hooks/useRadioSocket.ts";
import type {
  DiscoveryStation,
  ListeningStats,
  RadioState,
  Station,
} from "./types.ts";

type View = "listen" | "discover" | "insights" | "schedule";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a83b32] focus-visible:ring-offset-2 focus-visible:ring-offset-[#d7d8d2]";

export default function App() {
  const [view, setView] = useState<View>("listen");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [toast, setToast] = useState<
    { id: number; message: string; kind: "info" | "error" } | null
  >(null);
  const [editor, setEditor] = useState<Station | "new" | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toastId = useRef(0);

  const notify = useCallback(
    (message: string, kind: "info" | "error" = "info") => {
      const id = ++toastId.current;
      setToast({ id, message, kind });
      setTimeout(
        () => setToast((current) => current?.id === id ? null : current),
        4200,
      );
    },
    [],
  );
  const { state, role, connected, playerConnected, send } = useRadioSocket((
    message,
  ) => notify(message, "error"));

  const refreshStations = useCallback(async () => {
    try {
      setStations(await getStations());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setStationsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshStations();
  }, [refreshStations]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    audio.volume = state.volume / 100;
  }, [state?.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = state?.station?.url;
    if (url && audio.src !== url) {
      audio.src = url;
      audio.load();
    }
    if (!url) {
      audio.removeAttribute("src");
      audio.load();
    }
  }, [state?.station?.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    const shouldPlay = state.playing && state.target === "browser" &&
      role === "player";
    if (!shouldPlay) {
      audio.pause();
      return;
    }
    audio.play().catch(() =>
      notify(
        "Your browser blocked audio. Press play once more to start it.",
        "error",
      )
    );
  }, [state?.playing, state?.target, state?.station?.url, role, notify]);

  const selectStation = useCallback((station: Station, autoplay = true) => {
    send({ type: "setStation", station });
    if (autoplay) send({ type: "play" });
  }, [send]);

  const favoriteStations = useMemo(
    () => stations.filter((station) => station.favorite),
    [stations],
  );

  const stepStation = useCallback((direction: -1 | 1) => {
    const pool = favoriteStations.length ? favoriteStations : stations;
    if (!pool.length) return;
    const index = pool.findIndex((station) =>
      station.id === state?.station?.id
    );
    const next = pool[(index + direction + pool.length) % pool.length];
    selectStation(next);
  }, [favoriteStations, stations, state?.station?.id, selectStation]);

  const toggleFavorite = useCallback(async (station: Station) => {
    try {
      const updated = await setFavorite(station.id, !station.favorite);
      setStations((current) =>
        current.map((item) => item.id === updated.id ? updated : item)
      );
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [notify]);

  const deleteStation = useCallback(async (station: Station) => {
    if (!globalThis.confirm(`Remove ${station.name} from your library?`)) {
      return;
    }
    try {
      await removeStation(station.id);
      setStations((current) =>
        current.filter((item) => item.id !== station.id)
      );
      notify(`${station.name} removed.`);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [notify]);

  const saveStation = useCallback(
    async (draft: StationDraft, existing?: Station) => {
      const saved = existing
        ? await updateStation(existing.id, {
          ...draft,
          favorite: existing.favorite,
        })
        : await createStation(draft);
      await refreshStations();
      setEditor(null);
      notify(existing ? `${saved.name} updated.` : `${saved.name} saved.`);
      return saved;
    },
    [notify, refreshStations],
  );

  return (
    <div className="min-h-screen bg-[#d7d8d2] font-['Avenir_Next',Avenir,'Segoe_UI',sans-serif] text-[#172426] selection:bg-[#e3a94b] selection:text-[#172426]">
      <audio
        ref={audioRef}
        onError={() =>
          state?.target === "browser" && role === "player" &&
          notify("This stream could not be played by the browser.", "error")}
      />
      <SideNav view={view} setView={setView} />
      <div className="lg:pl-24">
        <TopBar
          connected={connected}
          state={state}
          role={role}
          playerConnected={playerConnected}
          setTarget={(target) => send({ type: "setTarget", target })}
        />
        <main className="mx-auto max-w-[1540px] px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
          {!state
            ? <ReceiverLoading connected={connected} />
            : view === "listen"
            ? (
              <ListenView
                state={state}
                stations={stations}
                stationsLoading={stationsLoading}
                role={role}
                onToggle={() =>
                  send({ type: state.playing ? "pause" : "play" })}
                onPrevious={() => stepStation(-1)}
                onNext={() => stepStation(1)}
                onVolume={(volume) => send({ type: "setVolume", volume })}
                onSelect={selectStation}
                onFavorite={toggleFavorite}
                onEdit={setEditor}
                onDelete={deleteStation}
                onAdd={() => setEditor("new")}
                onDiscover={() => setView("discover")}
              />
            )
            : view === "discover"
            ? (
              <DiscoverView
                savedStations={stations}
                onSaved={refreshStations}
                onPlay={selectStation}
                notify={notify}
              />
            )
            : view === "insights"
            ? <InsightsView revision={state.revision} notify={notify} />
            : (
              <ScheduleView
                state={state}
                stations={stations}
                send={send}
                notify={notify}
              />
            )}
        </main>
      </div>
      <MobileNav view={view} setView={setView} />
      {editor && (
        <StationEditor
          station={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSave={saveStation}
          notify={notify}
        />
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function SideNav(
  { view, setView }: { view: View; setView: (view: View) => void },
) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col border-r border-[#172426]/15 bg-[#c4c6c0] lg:flex">
      <div className="grid h-24 place-items-center border-b border-[#172426]/15">
        <div className="grid h-11 w-11 place-items-center bg-[#a83b32] font-['Arial_Narrow',Impact,sans-serif] text-xl tracking-[-0.04em] text-white">
          RD
        </div>
      </div>
      <nav
        className="flex flex-1 flex-col items-center gap-3 py-6"
        aria-label="Main navigation"
      >
        <NavButton
          icon="signal"
          label="Listen"
          active={view === "listen"}
          onClick={() => setView("listen")}
        />
        <NavButton
          icon="discover"
          label="Discover"
          active={view === "discover"}
          onClick={() => setView("discover")}
        />
        <NavButton
          icon="chart"
          label="Insights"
          active={view === "insights"}
          onClick={() => setView("insights")}
        />
        <NavButton
          icon="alarm"
          label="Schedule"
          active={view === "schedule"}
          onClick={() => setView("schedule")}
        />
      </nav>
      <div className="px-3 pb-5 text-center font-mono text-[9px] tracking-[0.2em] text-[#526164] uppercase">
        Self hosted
      </div>
    </aside>
  );
}

function MobileNav(
  { view, setView }: { view: View; setView: (view: View) => void },
) {
  const items: Array<
    { view: View; icon: Parameters<typeof Icon>[0]["name"]; label: string }
  > = [
    { view: "listen", icon: "signal", label: "Listen" },
    { view: "discover", icon: "discover", label: "Discover" },
    { view: "insights", icon: "chart", label: "Insights" },
    { view: "schedule", icon: "alarm", label: "Schedule" },
  ];
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 border border-white/10 bg-[#172426]/95 p-1 text-white shadow-2xl backdrop-blur lg:hidden"
      aria-label="Main navigation"
    >
      {items.map((item) => (
        <button
          type="button"
          key={item.view}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide ${focusRing} ${
            view === item.view ? "bg-[#a83b32] text-white" : "text-white/60"
          }`}
          onClick={() => setView(item.view)}
        >
          <Icon name={item.icon} className="h-5 w-5" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function NavButton({ icon, label, active, onClick }: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-16 w-16 flex-col items-center justify-center gap-1 text-[9px] font-bold tracking-[0.08em] uppercase transition-colors ${focusRing} ${
        active
          ? "bg-[#172426] text-white"
          : "text-[#526164] hover:bg-white/30 hover:text-[#172426]"
      }`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={icon} className="h-5 w-5" />
      {label}
    </button>
  );
}

function TopBar({ connected, state, role, playerConnected, setTarget }: {
  connected: boolean;
  state: RadioState | null;
  role: "player" | "remote";
  playerConnected: boolean;
  setTarget: (target: "browser" | "appliance") => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#172426]/15 bg-[#d7d8d2]/90 px-4 backdrop-blur sm:px-6 lg:h-24 lg:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center bg-[#a83b32] font-['Arial_Narrow',Impact,sans-serif] text-sm text-white lg:hidden">
          RD
        </div>
        <div className="min-w-0">
          <p className="m-0 truncate font-['Arial_Narrow',Impact,sans-serif] text-xl leading-none tracking-[-0.02em] uppercase sm:text-2xl">
            Radio Deck
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] text-[#526164] uppercase sm:text-[10px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-[#4f795f]" : "bg-[#a83b32]"
              }`}
            />
            {connected
              ? role === "player"
                ? "This tab is playing"
                : playerConnected
                ? "Remote control"
                : "Ready to play"
              : "Reconnecting"}
          </p>
        </div>
      </div>
      <div
        className="flex border border-[#172426]/20 bg-[#c4c6c0] p-1"
        aria-label="Playback target"
      >
        <TargetButton
          active={!state || state.target === "browser"}
          icon="browser"
          label="Browser"
          onClick={() => setTarget("browser")}
        />
        <TargetButton
          active={state?.target === "appliance"}
          icon="device"
          label="Pi output"
          onClick={() => setTarget("appliance")}
        />
      </div>
    </header>
  );
}

function TargetButton({ active, icon, label, onClick }: {
  active: boolean;
  icon: "browser" | "device";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-9 items-center gap-2 px-3 text-[10px] font-bold tracking-[0.08em] uppercase transition-colors ${focusRing} ${
        active
          ? "bg-[#172426] text-white"
          : "text-[#526164] hover:text-[#172426]"
      }`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
    >
      <Icon name={icon} className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ListenView(
  {
    state,
    stations,
    stationsLoading,
    role,
    onToggle,
    onPrevious,
    onNext,
    onVolume,
    onSelect,
    onFavorite,
    onEdit,
    onDelete,
    onAdd,
    onDiscover,
  }: {
    state: RadioState;
    stations: Station[];
    stationsLoading: boolean;
    role: "player" | "remote";
    onToggle: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onVolume: (volume: number) => void;
    onSelect: (station: Station) => void;
    onFavorite: (station: Station) => void;
    onEdit: (station: Station) => void;
    onDelete: (station: Station) => void;
    onAdd: () => void;
    onDiscover: () => void;
  },
) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <section className="overflow-hidden bg-[#172426] text-[#eef0eb] shadow-[0_22px_70px_rgba(23,36,38,0.18)]">
        <TunerScale state={state} stations={stations} />
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)] lg:p-10">
          <StationArtwork station={state.station} playing={state.playing} />
          <div className="flex min-w-0 flex-col justify-between">
            <NowPlayingCopy state={state} role={role} />
            <div className="mt-10">
              <div className="flex items-center gap-4 sm:gap-6">
                <TransportButton
                  label="Previous favorite"
                  icon="chevronLeft"
                  onClick={onPrevious}
                />
                <button
                  type="button"
                  className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#e3a94b] text-[#172426] transition-transform motion-safe:hover:scale-105 sm:h-20 sm:w-20 ${focusRing}`}
                  onClick={onToggle}
                  aria-label={state.playing ? "Pause" : "Play"}
                >
                  <Icon
                    name={state.playing ? "pause" : "play"}
                    className="h-7 w-7 sm:h-8 sm:w-8"
                  />
                </button>
                <TransportButton
                  label="Next favorite"
                  icon="chevronRight"
                  onClick={onNext}
                />
              </div>
              <div className="mt-8 flex items-center gap-4 border-t border-white/10 pt-6">
                <Icon name="volume" className="h-5 w-5 text-white/55" />
                <input
                  className={`h-1 w-full cursor-pointer accent-[#e3a94b] ${focusRing}`}
                  type="range"
                  min="0"
                  max="100"
                  value={state.volume}
                  onChange={(event) => onVolume(Number(event.target.value))}
                  aria-label="Volume"
                />
                <span className="w-10 text-right font-mono text-xs text-white/60">
                  {state.volume}
                </span>
              </div>
            </div>
          </div>
        </div>
        {state.target === "appliance" && state.outputStatus.kind === "error" &&
          (
            <div className="border-t border-[#a83b32]/50 bg-[#a83b32]/15 px-6 py-3 font-mono text-xs text-[#ffb3aa]">
              {state.outputStatus.message}
            </div>
          )}
      </section>
      <StationLibrary
        stations={stations}
        activeId={state.station?.id}
        loading={stationsLoading}
        onSelect={onSelect}
        onFavorite={onFavorite}
        onEdit={onEdit}
        onDelete={onDelete}
        onAdd={onAdd}
        onDiscover={onDiscover}
      />
    </div>
  );
}

function TunerScale(
  { state, stations }: { state: RadioState; stations: Station[] },
) {
  const favorites = stations.filter((station) => station.favorite);
  const index = favorites.findIndex((station) =>
    station.id === state.station?.id
  );
  const needlePosition = index < 0 || favorites.length < 2
    ? 50
    : 8 + (index / (favorites.length - 1)) * 84;
  return (
    <div className="relative border-b border-white/10 bg-[#243235] px-5 pt-5 pb-7 sm:px-10">
      <div className="mb-4 flex items-center justify-between font-mono text-[9px] tracking-[0.18em] text-white/40 uppercase">
        <span>Internet band</span>
        <span>{state.playing ? "Signal locked" : "Standby"}</span>
      </div>
      <div className="relative h-12 border-y border-[#e3a94b]/25">
        <div className="absolute inset-x-0 top-2 flex items-start justify-between">
          {Array.from({ length: 41 }, (_, tick) => (
            <span
              key={tick}
              className={`block w-px bg-[#e3a94b]/50 ${
                tick % 10 === 0 ? "h-6" : tick % 5 === 0 ? "h-4" : "h-2"
              }`}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-1 flex justify-between font-mono text-[8px] text-[#e3a94b]/60">
          <span>88</span>
          <span>92</span>
          <span>96</span>
          <span>100</span>
          <span>104</span>
          <span>108</span>
        </div>
        <div
          className="absolute -top-2 h-16 w-0.5 bg-[#d95149] shadow-[0_0_12px_rgba(217,81,73,0.75)] transition-[left] duration-700 motion-reduce:transition-none"
          style={{ left: `${needlePosition}%` }}
        >
          <span className="absolute -top-1 -left-[3px] h-2 w-2 rotate-45 bg-[#d95149]" />
        </div>
      </div>
    </div>
  );
}

function StationArtwork(
  { station, playing }: { station: Station | null; playing: boolean },
) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[330px] overflow-hidden bg-[#c4c6c0] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      {station?.favicon
        ? (
          <img
            className="h-full w-full object-cover"
            src={station.favicon}
            alt=""
          />
        )
        : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#354649_0_12%,#1e2b2d_13%_25%,#46575a_26%_27%,#172426_28%_100%)]">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-[#e3a94b] font-['Arial_Narrow',Impact,sans-serif] text-3xl text-[#172426]">
              {station?.name.slice(0, 2).toUpperCase() || "RD"}
            </span>
          </div>
        )}
      <div className="absolute top-3 right-3 flex items-center gap-2 bg-[#172426]/85 px-2 py-1 font-mono text-[9px] tracking-wider uppercase">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            playing
              ? "animate-pulse bg-[#e3a94b] motion-reduce:animate-none"
              : "bg-white/30"
          }`}
        />
        {playing ? "On air" : "Off air"}
      </div>
    </div>
  );
}

function NowPlayingCopy(
  { state, role }: { state: RadioState; role: "player" | "remote" },
) {
  const parts = state.nowPlaying?.split(" - ") ?? [];
  const artist = parts.length > 1 ? parts.shift() : null;
  const title = parts.length ? parts.join(" - ") : state.nowPlaying;
  return (
    <div>
      <p className="mb-5 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-[#e3a94b] uppercase">
        <Icon name="signal" className="h-4 w-4" />
        {state.target === "appliance"
          ? "Playing on Pi"
          : role === "player"
          ? "Playing here"
          : "Remote view"}
      </p>
      <h1 className="m-0 font-['Arial_Narrow',Impact,sans-serif] text-[clamp(2.8rem,6vw,6.4rem)] leading-[0.88] font-medium tracking-[-0.035em] uppercase">
        {state.station?.name || "Choose a station"}
      </h1>
      <div className="mt-6 min-h-16 border-l-2 border-[#a83b32] pl-4">
        <p className="m-0 text-base font-semibold text-white sm:text-lg">
          {title || "Waiting for track information"}
        </p>
        <p className="mt-1 text-sm text-white/45">
          {artist || state.station?.tags.slice(0, 3).join(" · ") ||
            "Your radio library is ready"}
        </p>
      </div>
    </div>
  );
}

function TransportButton({ label, icon, onClick }: {
  label: string;
  icon: "chevronLeft" | "chevronRight";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white/65 transition-colors hover:border-white/40 hover:text-white sm:h-13 sm:w-13 ${focusRing}`}
      onClick={onClick}
      aria-label={label}
    >
      <Icon name={icon} className="h-6 w-6" />
    </button>
  );
}

function StationLibrary(
  {
    stations,
    activeId,
    loading,
    onSelect,
    onFavorite,
    onEdit,
    onDelete,
    onAdd,
    onDiscover,
  }: {
    stations: Station[];
    activeId: number | undefined;
    loading: boolean;
    onSelect: (station: Station) => void;
    onFavorite: (station: Station) => void;
    onEdit: (station: Station) => void;
    onDelete: (station: Station) => void;
    onAdd: () => void;
    onDiscover: () => void;
  },
) {
  return (
    <section className="border border-[#172426]/15 bg-[#eef0eb]">
      <div className="flex items-center justify-between border-b border-[#172426]/15 px-5 py-5 sm:px-6">
        <div>
          <p className="m-0 font-mono text-[9px] tracking-[0.18em] text-[#a83b32] uppercase">
            Presets
          </p>
          <h2 className="mt-1 font-['Arial_Narrow',Impact,sans-serif] text-3xl leading-none font-medium uppercase">
            Station library
          </h2>
        </div>
        <button
          type="button"
          className={`grid h-10 w-10 place-items-center border border-[#172426]/20 hover:bg-[#172426] hover:text-white ${focusRing}`}
          onClick={onAdd}
          aria-label="Add custom station"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-[620px] divide-y divide-[#172426]/10 overflow-y-auto">
        {loading
          ? (
            Array.from(
              { length: 4 },
              (_, index) => <StationSkeleton key={index} />,
            )
          )
          : stations.length
          ? (
            stations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                active={station.id === activeId}
                onSelect={() => onSelect(station)}
                onFavorite={() => onFavorite(station)}
                onEdit={() => onEdit(station)}
                onDelete={() => onDelete(station)}
              />
            ))
          )
          : (
            <div className="px-7 py-14 text-center">
              <Icon name="signal" className="mx-auto h-8 w-8 text-[#a83b32]" />
              <p className="mt-4 font-semibold">No presets yet</p>
              <p className="mt-1 text-sm text-[#526164]">
                Find a station on the open radio directory.
              </p>
            </div>
          )}
      </div>
      <button
        type="button"
        className={`flex w-full items-center justify-center gap-2 border-t border-[#172426]/15 px-5 py-4 text-xs font-bold tracking-[0.1em] text-[#a83b32] uppercase hover:bg-[#a83b32] hover:text-white ${focusRing}`}
        onClick={onDiscover}
      >
        <Icon name="discover" className="h-4 w-4" />
        Discover more stations
      </button>
    </section>
  );
}

function StationRow(
  { station, active, onSelect, onFavorite, onEdit, onDelete }: {
    station: Station;
    active: boolean;
    onSelect: () => void;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
  },
) {
  return (
    <div
      className={`group relative grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors ${
        active ? "bg-[#e3a94b]/20" : "hover:bg-white"
      }`}
    >
      <button
        type="button"
        className={`absolute inset-0 ${focusRing}`}
        onClick={onSelect}
        aria-label={`Play ${station.name}`}
      />
      <StationThumb station={station} />
      <div className="pointer-events-none min-w-0">
        <p className="m-0 truncate text-sm font-bold">{station.name}</p>
        <p className="mt-1 truncate font-mono text-[9px] tracking-wide text-[#526164] uppercase">
          {[
            station.country,
            station.codec,
            station.bitrate ? `${station.bitrate}k` : null,
          ].filter(Boolean).join(" · ") || station.tags.slice(0, 2).join(" · ")}
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-1">
        <SmallIconButton
          label={station.favorite ? "Remove favorite" : "Add favorite"}
          icon="heart"
          active={station.favorite}
          onClick={onFavorite}
        />
        <div className="hidden group-hover:flex group-focus-within:flex">
          <SmallIconButton label="Edit station" icon="edit" onClick={onEdit} />
          <SmallIconButton
            label="Delete station"
            icon="delete"
            onClick={onDelete}
          />
        </div>
      </div>
      {active && (
        <span className="absolute top-0 bottom-0 left-0 w-1 bg-[#a83b32]" />
      )}
    </div>
  );
}

function StationThumb(
  { station }: { station: Pick<Station, "name" | "favicon"> },
) {
  return station.favicon
    ? (
      <img
        className="h-14 w-14 bg-[#c4c6c0] object-cover"
        src={station.favicon}
        alt=""
        loading="lazy"
      />
    )
    : (
      <span className="grid h-14 w-14 place-items-center bg-[#243235] font-['Arial_Narrow',Impact,sans-serif] text-xl text-[#e3a94b]">
        {station.name.slice(0, 2).toUpperCase()}
      </span>
    );
}

function SmallIconButton({ label, icon, active = false, onClick }: {
  label: string;
  icon: "heart" | "edit" | "delete";
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid h-8 w-8 place-items-center hover:bg-[#172426] hover:text-white ${focusRing} ${
        active ? "text-[#a83b32]" : "text-[#526164]"
      }`}
      onClick={onClick}
      aria-label={label}
    >
      <Icon
        name={icon}
        filled={icon === "heart" && active}
        className="h-4 w-4"
      />
    </button>
  );
}

function StationSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-4 py-4 motion-reduce:animate-none">
      <span className="h-14 w-14 bg-[#c4c6c0]" />
      <span className="flex-1">
        <span className="block h-3 w-2/3 bg-[#c4c6c0]" />
        <span className="mt-2 block h-2 w-1/3 bg-[#d7d8d2]" />
      </span>
    </div>
  );
}

function DiscoverView({ savedStations, onSaved, onPlay, notify }: {
  savedStations: Station[];
  onSaved: () => Promise<void>;
  onPlay: (station: Station) => void;
  notify: (message: string, kind?: "info" | "error") => void;
}) {
  const [query, setQuery] = useState({ name: "", tag: "", country: "" });
  const [results, setResults] = useState<DiscoveryStation[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const savedUrls = new Set(savedStations.map((station) => station.url));

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.name.trim() && !query.tag.trim() && !query.country.trim()) {
      notify("Enter a station name, tag, or country to search.", "error");
      return;
    }
    setSearching(true);
    try {
      setResults(await discoverStations(query));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSearching(false);
    }
  };

  const save = async (station: DiscoveryStation, play: boolean) => {
    const existing = savedStations.find((saved) => saved.url === station.url);
    if (existing) {
      if (play) onPlay(existing);
      else notify(`${existing.name} is already in your library.`);
      return;
    }
    setSavingUrl(station.url);
    try {
      const saved = await createStation({ ...station, favorite: true });
      await onSaved();
      notify(`${saved.name} saved.`);
      if (play) onPlay(saved);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSavingUrl(null);
    }
  };

  return (
    <section>
      <PageHeading
        eyebrow="Open directory"
        title="Find a new frequency"
        description="Search thousands of community-maintained streams by name, sound, or country."
      />
      <form
        className="mt-8 grid gap-px bg-[#172426]/15 p-px md:grid-cols-[1fr_0.7fr_0.45fr_auto]"
        onSubmit={search}
      >
        <SearchField
          label="Station name"
          value={query.name}
          placeholder="e.g. NTS"
          onChange={(name) => setQuery({ ...query, name })}
        />
        <SearchField
          label="Genre or tag"
          value={query.tag}
          placeholder="e.g. jazz"
          onChange={(tag) => setQuery({ ...query, tag })}
        />
        <SearchField
          label="Country code"
          value={query.country}
          placeholder="ZA"
          onChange={(country) => setQuery({ ...query, country })}
        />
        <button
          type="submit"
          className={`flex min-h-18 items-center justify-center gap-2 bg-[#a83b32] px-7 text-xs font-bold tracking-[0.12em] text-white uppercase hover:bg-[#8f2d2a] ${focusRing}`}
          disabled={searching}
        >
          <Icon name="search" className="h-5 w-5" />
          {searching ? "Tuning…" : "Search"}
        </button>
      </form>
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {searching
          ? Array.from(
            { length: 6 },
            (_, index) => <DiscoverySkeleton key={index} />,
          )
          : results.map((station) => {
            const saved = savedUrls.has(station.url);
            return (
              <article
                key={station.externalId || station.url}
                className="flex min-w-0 flex-col border border-[#172426]/15 bg-[#eef0eb] p-5 transition-transform motion-safe:hover:-translate-y-1"
              >
                <div className="flex items-start gap-4">
                  <StationThumb station={station} />
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 truncate text-base font-bold">
                      {station.name}
                    </h2>
                    <p className="mt-1 font-mono text-[9px] tracking-wide text-[#526164] uppercase">
                      {[
                        station.country,
                        station.codec,
                        station.bitrate ? `${station.bitrate}k` : null,
                      ].filter(Boolean).join(" · ") || "Internet stream"}
                    </p>
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#526164]">
                      {station.tags.slice(0, 5).join(" · ") ||
                        "No tags supplied"}
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2 border-t border-[#172426]/10 pt-4">
                  <button
                    type="button"
                    className={`border border-[#172426]/20 px-3 py-2 text-[10px] font-bold tracking-wider uppercase hover:bg-[#172426] hover:text-white ${focusRing}`}
                    onClick={() => save(station, true)}
                    disabled={savingUrl === station.url}
                  >
                    Play now
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-[10px] font-bold tracking-wider text-[#a83b32] uppercase hover:bg-[#a83b32] hover:text-white ${focusRing}`}
                    onClick={() => save(station, false)}
                    disabled={saved || savingUrl === station.url}
                  >
                    {saved
                      ? "Saved"
                      : savingUrl === station.url
                      ? "Saving…"
                      : "Save preset"}
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      {!searching && results.length === 0 && (
        <div className="mt-8 grid min-h-64 place-items-center border border-dashed border-[#172426]/25 text-center">
          <div>
            <Icon name="discover" className="mx-auto h-9 w-9 text-[#a83b32]" />
            <p className="mt-4 font-semibold">The dial is open</p>
            <p className="mt-1 text-sm text-[#526164]">
              Search to bring stations into range.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function SearchField(
  { label, value, placeholder, onChange }: {
    label: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  },
) {
  return (
    <label className="bg-[#eef0eb] px-5 py-4">
      <span className="block font-mono text-[9px] tracking-[0.15em] text-[#526164] uppercase">
        {label}
      </span>
      <input
        className={`mt-1 w-full border-0 bg-transparent p-0 text-base font-semibold outline-none placeholder:font-normal placeholder:text-[#526164]/45 ${focusRing}`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DiscoverySkeleton() {
  return (
    <div className="h-48 animate-pulse border border-[#172426]/10 bg-[#eef0eb] p-5 motion-reduce:animate-none">
      <span className="block h-14 w-14 bg-[#c4c6c0]" />
      <span className="mt-5 block h-3 w-1/2 bg-[#c4c6c0]" />
    </div>
  );
}

function InsightsView(
  { revision, notify }: {
    revision: number;
    notify: (message: string, kind?: "info" | "error") => void;
  },
) {
  const [stats, setStats] = useState<ListeningStats | null>(null);
  useEffect(() => {
    getStats().then(setStats).catch((error) =>
      notify(errorMessage(error), "error")
    );
  }, [revision, notify]);
  if (!stats) return <ReceiverLoading connected />;
  const maxPlays = Math.max(
    1,
    ...stats.mostPlayed.map((station) => station.plays),
  );
  return (
    <section>
      <PageHeading
        eyebrow="Listening log"
        title="Your air time"
        description="A local record of what played and how long the receiver stayed on."
      />
      <div className="mt-8 grid gap-px bg-[#172426]/15 p-px sm:grid-cols-3">
        <StatBlock
          label="Listening time"
          value={formatDuration(stats.totalListeningSeconds)}
        />
        <StatBlock label="Sessions" value={String(stats.totalPlays)} />
        <StatBlock
          label="Stations heard"
          value={String(stats.uniqueStations)}
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <div className="border border-[#172426]/15 bg-[#eef0eb] p-6 sm:p-8">
          <SectionTitle eyebrow="Top presets" title="Most played" />
          <div className="mt-7 space-y-5">
            {stats.mostPlayed.length
              ? stats.mostPlayed.map((station, index) => (
                <div key={`${station.stationId}-${station.stationName}`}>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <p className="m-0 truncate text-sm font-bold">
                      <span className="mr-3 font-mono text-[10px] text-[#a83b32]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {station.stationName}
                    </p>
                    <span className="font-mono text-[9px] text-[#526164] uppercase">
                      {station.plays} plays
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#d7d8d2]">
                    <div
                      className="h-full bg-[#e3a94b]"
                      style={{ width: `${(station.plays / maxPlays) * 100}%` }}
                    />
                  </div>
                </div>
              ))
              : <EmptyLine text="Play a station to start the chart." />}
          </div>
        </div>
        <div className="border border-[#172426]/15 bg-[#172426] p-6 text-white sm:p-8">
          <SectionTitle eyebrow="Recent signal" title="History" dark />
          <div className="mt-6 divide-y divide-white/10">
            {stats.recent.length
              ? stats.recent.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4"
                >
                  <span className="h-2 w-2 rounded-full bg-[#a83b32]" />
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-semibold">
                      {entry.stationName}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-white/45">
                      {entry.nowPlaying ||
                        new Date(entry.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] text-white/45">
                    {formatDuration(entry.durationSeconds)}
                  </span>
                </div>
              ))
              : <EmptyLine text="No listening sessions yet." dark />}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#eef0eb] p-6 sm:p-8">
      <p className="m-0 font-mono text-[9px] tracking-[0.15em] text-[#526164] uppercase">
        {label}
      </p>
      <p className="mt-3 font-['Arial_Narrow',Impact,sans-serif] text-5xl leading-none tracking-[-0.03em] uppercase sm:text-6xl">
        {value}
      </p>
    </div>
  );
}

function ScheduleView({ state, stations, send, notify }: {
  state: RadioState;
  stations: Station[];
  send: ReturnType<typeof useRadioSocket>["send"];
  notify: (message: string, kind?: "info" | "error") => void;
}) {
  const [alarmAt, setAlarmAt] = useState(
    toLocalDateTime(new Date(Date.now() + 3_600_000)),
  );
  const [stationId, setStationId] = useState(
    String(state.station?.id ?? stations[0]?.id ?? ""),
  );
  const setAlarm = (event: FormEvent) => {
    event.preventDefault();
    if (!alarmAt || !stationId) {
      return notify("Choose a future time and station.", "error");
    }
    const at = new Date(alarmAt);
    if (at.getTime() <= Date.now()) {
      return notify("Alarm time must be in the future.", "error");
    }
    send({
      type: "setAlarm",
      alarm: { at: at.toISOString(), stationId: Number(stationId) },
    });
    notify("Alarm set.");
  };
  return (
    <section>
      <PageHeading
        eyebrow="Automatic controls"
        title="Set and forget"
        description="Let the receiver wind down at night or bring a station up at a chosen time."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="border border-[#172426]/15 bg-[#172426] p-6 text-white sm:p-9">
          <div className="flex items-start justify-between">
            <SectionTitle eyebrow="Sleep timer" title="Fade to quiet" dark />
            <Icon name="clock" className="h-9 w-9 text-[#e3a94b]" />
          </div>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/50">
            Playback stops when the timer ends, regardless of whether sound is
            coming from this browser or the Pi.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-2">
            {[15, 30, 60].map((minutes) => (
              <button
                type="button"
                key={minutes}
                className={`border border-white/15 py-4 font-mono text-xs hover:border-[#e3a94b] hover:text-[#e3a94b] ${focusRing}`}
                onClick={() => send({ type: "setSleepTimer", minutes })}
              >
                {minutes} min
              </button>
            ))}
          </div>
          {state.sleepTimerEndsAt && (
            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
              <span className="text-xs text-white/55">
                Stops at{" "}
                {new Date(state.sleepTimerEndsAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                className={`text-[10px] font-bold tracking-wider text-[#e3a94b] uppercase ${focusRing}`}
                onClick={() => send({ type: "clearSleepTimer" })}
              >
                Cancel timer
              </button>
            </div>
          )}
        </div>
        <form
          className="border border-[#172426]/15 bg-[#eef0eb] p-6 sm:p-9"
          onSubmit={setAlarm}
        >
          <div className="flex items-start justify-between">
            <SectionTitle eyebrow="Radio alarm" title="Wake the dial" />
            <Icon name="alarm" className="h-9 w-9 text-[#a83b32]" />
          </div>
          <div className="mt-8 space-y-5">
            <label className="block">
              <span className="font-mono text-[9px] tracking-[0.15em] text-[#526164] uppercase">
                Start time
              </span>
              <input
                className={`mt-2 w-full border border-[#172426]/20 bg-white px-4 py-3 text-sm ${focusRing}`}
                type="datetime-local"
                value={alarmAt}
                onChange={(event) => setAlarmAt(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="font-mono text-[9px] tracking-[0.15em] text-[#526164] uppercase">
                Station
              </span>
              <select
                className={`mt-2 w-full border border-[#172426]/20 bg-white px-4 py-3 text-sm ${focusRing}`}
                value={stationId}
                onChange={(event) => setStationId(event.target.value)}
              >
                <option value="">Choose a preset</option>
                {stations.map((station) => (
                  <option value={station.id} key={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            className={`mt-7 w-full bg-[#a83b32] px-5 py-4 text-xs font-bold tracking-[0.12em] text-white uppercase hover:bg-[#8f2d2a] ${focusRing}`}
          >
            Set alarm
          </button>
          {state.alarm && (
            <div className="mt-5 flex items-center justify-between bg-[#e3a94b]/20 px-4 py-3 text-xs">
              <span>Set for {new Date(state.alarm.at).toLocaleString()}</span>
              <button
                type="button"
                className={`font-bold text-[#a83b32] uppercase ${focusRing}`}
                onClick={() => send({ type: "clearAlarm" })}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}

function StationEditor({ station, onClose, onSave, notify }: {
  station?: Station;
  onClose: () => void;
  onSave: (draft: StationDraft, existing?: Station) => Promise<Station>;
  notify: (message: string, kind?: "info" | "error") => void;
}) {
  const [draft, setDraft] = useState({
    name: station?.name ?? "",
    url: station?.url ?? "",
    favicon: station?.favicon ?? "",
    tags: station?.tags.join(", ") ?? "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: draft.name,
        url: draft.url,
        favicon: draft.favicon || null,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        favorite: station?.favorite ?? true,
      }, station);
    } catch (error) {
      notify(errorMessage(error), "error");
      setSaving(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#172426]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="station-editor-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="w-full max-w-xl bg-[#eef0eb] shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-start justify-between border-b border-[#172426]/15 p-6 sm:p-8">
          <div>
            <p className="m-0 font-mono text-[9px] tracking-[0.16em] text-[#a83b32] uppercase">
              Manual preset
            </p>
            <h2
              id="station-editor-title"
              className="mt-1 font-['Arial_Narrow',Impact,sans-serif] text-4xl leading-none font-medium uppercase"
            >
              {station ? "Edit station" : "Add station"}
            </h2>
          </div>
          <button
            type="button"
            className={`grid h-9 w-9 place-items-center hover:bg-[#172426] hover:text-white ${focusRing}`}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          <EditorField
            label="Station name"
            required
            value={draft.name}
            placeholder="My favorite station"
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <EditorField
            label="Stream URL"
            required
            type="url"
            value={draft.url}
            placeholder="https://example.com/live.mp3"
            onChange={(url) => setDraft({ ...draft, url })}
          />
          <EditorField
            label="Artwork URL"
            type="url"
            value={draft.favicon}
            placeholder="https://example.com/logo.jpg"
            onChange={(favicon) => setDraft({ ...draft, favicon })}
          />
          <EditorField
            label="Tags"
            value={draft.tags}
            placeholder="jazz, local, talk"
            onChange={(tags) => setDraft({ ...draft, tags })}
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-[#172426]/15 p-5 sm:px-8">
          <button
            type="button"
            className={`px-5 py-3 text-xs font-bold tracking-wider uppercase ${focusRing}`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`bg-[#a83b32] px-6 py-3 text-xs font-bold tracking-wider text-white uppercase hover:bg-[#8f2d2a] disabled:opacity-50 ${focusRing}`}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save station"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditorField({
  label,
  value,
  placeholder,
  type = "text",
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] tracking-[0.15em] text-[#526164] uppercase">
        {label}
      </span>
      <input
        className={`mt-2 w-full border border-[#172426]/20 bg-white px-4 py-3 text-sm ${focusRing}`}
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function PageHeading(
  { eyebrow, title, description }: {
    eyebrow: string;
    title: string;
    description: string;
  },
) {
  return (
    <header className="grid items-end gap-5 border-b border-[#172426]/20 pb-7 md:grid-cols-[1fr_0.65fr]">
      <div>
        <p className="m-0 font-mono text-[10px] tracking-[0.18em] text-[#a83b32] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-['Arial_Narrow',Impact,sans-serif] text-[clamp(3.5rem,8vw,7rem)] leading-[0.82] font-medium tracking-[-0.035em] uppercase">
          {title}
        </h1>
      </div>
      <p className="m-0 max-w-xl text-sm leading-relaxed text-[#526164] md:pb-1">
        {description}
      </p>
    </header>
  );
}

function SectionTitle(
  { eyebrow, title, dark = false }: {
    eyebrow: string;
    title: string;
    dark?: boolean;
  },
) {
  return (
    <div>
      <p
        className={`m-0 font-mono text-[9px] tracking-[0.16em] uppercase ${
          dark ? "text-[#e3a94b]" : "text-[#a83b32]"
        }`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-1 font-['Arial_Narrow',Impact,sans-serif] text-3xl leading-none font-medium uppercase">
        {title}
      </h2>
    </div>
  );
}

function EmptyLine({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <p
      className={`py-8 text-center text-sm ${
        dark ? "text-white/45" : "text-[#526164]"
      }`}
    >
      {text}
    </p>
  );
}

function ReceiverLoading({ connected }: { connected: boolean }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <div className="relative mx-auto h-20 w-20 rounded-full border border-[#172426]/20">
          <span className="absolute inset-3 animate-spin rounded-full border-2 border-transparent border-t-[#a83b32] motion-reduce:animate-none" />
        </div>
        <p className="mt-5 font-mono text-[10px] tracking-[0.18em] text-[#526164] uppercase">
          {connected ? "Reading the dial" : "Finding the receiver"}
        </p>
      </div>
    </div>
  );
}

function Toast(
  { message, kind, onClose }: {
    message: string;
    kind: "info" | "error";
    onClose: () => void;
  },
) {
  return (
    <div
      className={`fixed right-4 bottom-24 z-[60] flex max-w-sm items-center gap-3 border-l-4 bg-[#172426] px-5 py-4 text-sm text-white shadow-2xl lg:bottom-6 ${
        kind === "error" ? "border-[#d95149]" : "border-[#e3a94b]"
      }`}
      role="status"
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        className={`text-white/60 hover:text-white ${focusRing}`}
        onClick={onClose}
        aria-label="Dismiss"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function toLocalDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
