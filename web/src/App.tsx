import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { AppShell } from "@astryxdesign/core/AppShell";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport, useToast } from "@astryxdesign/core/Toast";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import { y2kTheme } from "@astryxdesign/theme-y2k/built";
import {
  AlarmClock,
  ChartNoAxesColumnIncreasing,
  Compass,
  Library,
  Monitor,
  Moon,
  Palette,
  Radio,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createStation,
  getStations,
  removeStation,
  setFavorite,
  type StationDraft,
  updateStation,
} from "./api.ts";
import { StationEditor } from "./components/StationEditor.tsx";
import { useRadioSocket } from "./hooks/useRadioSocket.ts";
import type { PlaybackTarget, Station } from "./types.ts";
import { errorMessage, type Notify, ReceiverLoading } from "./ui.tsx";
import { DiscoverView } from "./views/DiscoverView.tsx";
import { InsightsView } from "./views/InsightsView.tsx";
import { ListenView } from "./views/ListenView.tsx";
import { ScheduleView } from "./views/ScheduleView.tsx";

type View = "listen" | "discover" | "insights" | "schedule";
type ThemeName = "stone" | "neutral" | "y2k";
type ColorMode = "light" | "dark";

const themeMap = {
  stone: stoneTheme,
  neutral: neutralTheme,
  y2k: y2kTheme,
};

const themeOptions = [
  { value: "stone", label: "Stone" },
  { value: "neutral", label: "Neutral" },
  { value: "y2k", label: "Y2K" },
];

const navItems: Array<{ view: View; label: string; icon: typeof Radio }> = [
  { view: "listen", label: "Listen", icon: Radio },
  { view: "discover", label: "Discover", icon: Compass },
  { view: "insights", label: "Insights", icon: ChartNoAxesColumnIncreasing },
  { view: "schedule", label: "Schedule", icon: AlarmClock },
];

export default function App() {
  const [themeName, setThemeName] = useState<ThemeName>(() =>
    readSetting("airwave-theme") === "neutral"
      ? "neutral"
      : readSetting("airwave-theme") === "y2k"
      ? "y2k"
      : "stone"
  );
  const [mode, setMode] = useState<ColorMode>(() =>
    readSetting("airwave-mode") === "dark" ? "dark" : "light"
  );

  useEffect(() => localStorage.setItem("airwave-theme", themeName), [
    themeName,
  ]);
  useEffect(() => localStorage.setItem("airwave-mode", mode), [mode]);

  return (
    <Theme theme={themeMap[themeName]} mode={mode}>
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <Airwave
          themeName={themeName}
          mode={mode}
          setThemeName={setThemeName}
          setMode={setMode}
        />
      </ToastViewport>
    </Theme>
  );
}

function Airwave({ themeName, mode, setThemeName, setMode }: {
  themeName: ThemeName;
  mode: ColorMode;
  setThemeName: (theme: ThemeName) => void;
  setMode: (mode: ColorMode) => void;
}) {
  const [view, setView] = useState<View>("listen");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [editor, setEditor] = useState<Station | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Station | null>(null);
  const [deleting, setDeleting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const showToast = useToast();
  const notify = useCallback<Notify>((message, kind = "info") => {
    showToast({ body: message, type: kind, isAutoHide: kind !== "error" });
  }, [showToast]);
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
    if (audio && state) audio.volume = state.volume / 100;
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
    selectStation(pool[(index + direction + pool.length) % pool.length]);
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

  const deleteStation = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeStation(pendingDelete.id);
      setStations((current) =>
        current.filter((item) => item.id !== pendingDelete.id)
      );
      notify(`${pendingDelete.name} removed.`);
      setPendingDelete(null);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, notify]);

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

  const navigation = (
    <SideNav
      header={
        <SideNavHeading
          heading="Airwave"
          superheading="Pi receiver"
          icon={<Icon icon={Radio} color="accent" />}
        />
      }
      collapsible={{
        defaultIsCollapsed: false,
        hasButton: true,
        buttonLabel: "Collapse navigation",
      }}
      footer={
        <VStack gap={4}>
          <Selector
            label="Theme"
            value={themeName}
            options={themeOptions}
            startIcon={<Icon icon={Palette} size="sm" />}
            onChange={(value) => isThemeName(value) && setThemeName(value)}
          />
          <Switch
            label="Dark mode"
            labelIcon={<Icon icon={mode === "dark" ? Moon : Sun} size="sm" />}
            value={mode === "dark"}
            onChange={(dark) => setMode(dark ? "dark" : "light")}
            labelSpacing="spread"
          />
        </VStack>
      }
    >
      <SideNavSection title="Radio" isHeaderHidden>
        {navItems.map((item) => (
          <SideNavItem
            key={item.view}
            label={item.label}
            icon={item.icon}
            isSelected={view === item.view}
            onClick={() => setView(item.view)}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );

  const topNavigation = (
    <TopNav
      label="Airwave navigation"
      heading={
        <TopNavHeading
          heading="Airwave"
          subheading={connected ? "Receiver online" : "Reconnecting"}
          logo={<Icon icon={Radio} color="accent" />}
          logoLabel="Airwave"
          headerEndContent={
            <StatusDot
              variant={connected ? "success" : "warning"}
              label={connected ? "Connected" : "Reconnecting"}
              isPulsing={!connected}
            />
          }
        />
      }
      endContent={
        <HStack gap={3} vAlign="center" wrap="wrap">
          {state?.target === "browser" && (
            <Text type="supporting" color="secondary">
              {role === "player"
                ? "This browser is player"
                : playerConnected
                ? "Remote control"
                : "No browser player"}
            </Text>
          )}
          <SegmentedControl
            label="Playback target"
            value={state?.target ?? "browser"}
            onChange={(target) =>
              isPlaybackTarget(target) && send({ type: "setTarget", target })}
            size="sm"
          >
            <SegmentedControlItem
              value="browser"
              label="Browser"
              icon={<Icon icon={Monitor} size="sm" />}
            />
            <SegmentedControlItem
              value="appliance"
              label="Pi output"
              icon={<Icon icon={Library} size="sm" />}
            />
          </SegmentedControl>
        </HStack>
      }
    />
  );

  return (
    <>
      <audio
        ref={audioRef}
        onError={() =>
          state?.target === "browser" && role === "player" &&
          notify("This stream could not be played by the browser.", "error")}
      />
      <AppShell
        variant="elevated"
        height="auto"
        contentPadding={0}
        sideNav={navigation}
        topNav={topNavigation}
        mobileNav={{ breakpoint: "md" }}
      >
        {!state
          ? <ReceiverLoading connected={connected} />
          : view === "listen"
          ? (
            <ListenView
              state={state}
              stations={stations}
              stationsLoading={stationsLoading}
              role={role}
              onToggle={() => send({ type: state.playing ? "pause" : "play" })}
              onPrevious={() => stepStation(-1)}
              onNext={() => stepStation(1)}
              onVolume={(volume) => send({ type: "setVolume", volume })}
              onSelect={selectStation}
              onFavorite={toggleFavorite}
              onEdit={setEditor}
              onDelete={setPendingDelete}
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
      </AppShell>
      {editor && (
        <StationEditor
          station={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSave={saveStation}
          notify={notify}
        />
      )}
      <AlertDialog
        isOpen={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove station?"
        description={pendingDelete
          ? `${pendingDelete.name} will be removed from your library.`
          : "This station will be removed."}
        actionLabel="Remove station"
        isActionLoading={deleting}
        onAction={deleteStation}
      />
    </>
  );
}

function readSetting(key: string): string | null {
  return globalThis.localStorage?.getItem(key) ?? null;
}

function isThemeName(value: string): value is ThemeName {
  return value === "stone" || value === "neutral" || value === "y2k";
}

function isPlaybackTarget(value: string): value is PlaybackTarget {
  return value === "browser" || value === "appliance";
}
