import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import { ToastViewport, useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { Compass, Download, RadioTower, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  beginUpdate,
  checkForUpdates,
  createStation,
  getStations,
  getUpdateStatus,
  getVersion,
  removeStation,
  setFavorite,
  type StationDraft,
  updateStation,
} from "./api.ts";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { StationEditor } from "./components/StationEditor.tsx";
import {
  UpdateDialog,
  type UpdateDialogModel,
} from "./components/UpdateDialog.tsx";
import { useRadioSocket } from "./hooks/useRadioSocket.ts";
import { airwaveThemes, isPaletteName, type PaletteName } from "./theme.ts";
import type { Station, UpdateStatus, VersionInfo } from "./types.ts";
import { errorMessage, type Notify, ReceiverLoading } from "./ui.tsx";
import { DiscoverView } from "./views/DiscoverView.tsx";
import { ListenView } from "./views/ListenView.tsx";

type View = "listen" | "discover";
type ColorMode = "light" | "dark";

const navItems: Array<{ view: View; label: string; icon: typeof RadioTower }> =
  [
    { view: "listen", label: "Listen", icon: RadioTower },
    { view: "discover", label: "Discover", icon: Compass },
  ];

export default function App() {
  const [palette, setPalette] = useState<PaletteName>(() => {
    const saved = readSetting("airwave-palette");
    return saved && isPaletteName(saved) ? saved : "signal";
  });
  const [mode, setMode] = useState<ColorMode>(() =>
    readSetting("airwave-mode") === "dark" ? "dark" : "light"
  );

  useEffect(() => localStorage.setItem("airwave-palette", palette), [palette]);
  useEffect(() => localStorage.setItem("airwave-mode", mode), [mode]);

  return (
    <Theme theme={airwaveThemes[palette]} mode={mode}>
      <ToastViewport position="bottomEnd" maxVisible={3}>
        <Airwave
          palette={palette}
          mode={mode}
          setPalette={setPalette}
          setMode={setMode}
        />
      </ToastViewport>
    </Theme>
  );
}

function Airwave({ palette, mode, setPalette, setMode }: {
  palette: PaletteName;
  mode: ColorMode;
  setPalette: (palette: PaletteName) => void;
  setMode: (mode: ColorMode) => void;
}) {
  const [view, setView] = useState<View>("listen");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [editor, setEditor] = useState<Station | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Station | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateDialog, setUpdateDialog] = useState<UpdateDialogModel | null>(
    null,
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const showToast = useToast();
  const notify = useCallback<Notify>((message, kind = "info") => {
    showToast({ body: message, type: kind, isAutoHide: kind !== "error" });
  }, [showToast]);
  const { state, role, connected, send } = useRadioSocket((message) =>
    notify(message, "error")
  );

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
    getVersion().then(setVersion).catch(() => undefined);
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

  const installUpdate = useCallback(async () => {
    if (!updateDialog) return;
    const latest = updateDialog.latestVersion;
    setUpdating(true);
    setUpdateDialog((current) =>
      current
        ? { ...current, phase: "requested", message: "Preparing update." }
        : current
    );
    try {
      const update = await beginUpdate();
      setUpdateDialog((current) =>
        current
          ? { ...current, phase: update.state, message: update.message }
          : current
      );
      if (update.state !== "complete") {
        await waitForUpdate(
          latest,
          (status) =>
            setUpdateDialog((current) =>
              current
                ? { ...current, phase: status.state, message: status.message }
                : current
            ),
        );
      }
      setUpdateDialog((current) =>
        current ? { ...current, phase: "complete", message: null } : current
      );
      globalThis.setTimeout(() => globalThis.location.reload(), 900);
    } catch (error) {
      setUpdateDialog((current) =>
        current
          ? { ...current, phase: "failed", message: errorMessage(error) }
          : current
      );
    } finally {
      setUpdating(false);
    }
  }, [updateDialog]);

  const checkUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const nextVersion = await checkForUpdates();
      setVersion(nextVersion);
      const latest = nextVersion.latest;
      if (nextVersion.updateAvailable && latest) {
        const dismissUpdateToast = showToast({
          uniqueID: "airwave-update",
          collisionBehavior: "overwrite",
          body: `Airwave v${latest} is available.`,
          type: "info",
          isAutoHide: false,
          endContent: (
            <Button
              label="Update now"
              variant="primary"
              size="sm"
              icon={<Icon icon={Download} size="sm" />}
              clickAction={() => {
                dismissUpdateToast();
                setUpdateDialog({
                  currentVersion: nextVersion.current,
                  latestVersion: latest,
                  phase: "confirm",
                  message: null,
                });
              }}
            />
          ),
        });
      } else {
        notify(`Airwave ${nextVersion.current} is up to date.`);
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setCheckingUpdates(false);
    }
  }, [notify, showToast]);

  const openUpdateDialog = useCallback(() => {
    if (!version?.updateAvailable || !version.latest) return;
    setSettingsOpen(false);
    setUpdateDialog({
      currentVersion: version.current,
      latestVersion: version.latest,
      phase: "confirm",
      message: null,
    });
  }, [version]);

  const navigation = (
    <SideNav
      header={
        <SideNavHeading
          heading="Airwave"
          subheading={version ? `v${version.current}` : "Internet radio"}
          icon={<Icon icon={RadioTower} color="accent" />}
          headerEndContent={
            <StatusDot
              variant={connected ? "success" : "warning"}
              label={connected ? "Online" : "Reconnecting"}
              isPulsing={!connected}
            />
          }
        />
      }
      collapsible={{
        isCollapsed: sidebarCollapsed,
        onCollapsedChange: setSidebarCollapsed,
        hasButton: true,
        buttonLabel: "Collapse navigation",
      }}
      footer={sidebarCollapsed ? undefined : (
        <VStack gap={3}>
          <Button
            label="Settings"
            variant="secondary"
            icon={<Icon icon={Settings} size="sm" />}
            onClick={() => setSettingsOpen(true)}
          />
          <Text type="supporting" color="secondary">
            {version?.updateAvailable && version.latest
              ? `v${version.latest} available`
              : version
              ? `Version ${version.current}`
              : "Reading version…"}
          </Text>
        </VStack>
      )}
      footerIcons={sidebarCollapsed
        ? (
          <IconButton
            label="Settings"
            tooltip="Settings"
            icon={<Icon icon={Settings} size="sm" />}
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          />
        )
        : undefined}
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
        height="fill"
        contentPadding={0}
        sideNav={navigation}
        mobileNav={{ breakpoint: "md" }}
      >
        {!state
          ? <ReceiverLoading connected={connected} />
          : (
            <VStack gap={0} minHeight="100%">
              {view === "listen"
                ? (
                  <ListenView
                    state={state}
                    stations={stations}
                    stationsLoading={stationsLoading}
                    role={role}
                    notify={notify}
                    onToggle={() =>
                      send({ type: state.playing ? "pause" : "play" })}
                    onPrevious={() => stepStation(-1)}
                    onNext={() => stepStation(1)}
                    onVolume={(volume) => send({ type: "setVolume", volume })}
                    onSetTarget={(target) =>
                      send({ type: "setTarget", target })}
                    onSelect={selectStation}
                    onFavorite={toggleFavorite}
                    onEdit={setEditor}
                    onDelete={setPendingDelete}
                    onAdd={() => setEditor("new")}
                    onDiscover={() => setView("discover")}
                  />
                )
                : (
                  <DiscoverView
                    savedStations={stations}
                    onSaved={refreshStations}
                    onPlay={selectStation}
                    notify={notify}
                  />
                )}
            </VStack>
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
      <UpdateDialog
        model={updateDialog}
        onClose={() => setUpdateDialog(null)}
        onConfirm={installUpdate}
        onRetry={installUpdate}
      />
      {settingsOpen && (
        <SettingsDialog
          palette={palette}
          mode={mode}
          setPalette={setPalette}
          setMode={setMode}
          version={version}
          connected={connected}
          checkingUpdates={checkingUpdates}
          updating={updating}
          onCheckUpdates={checkUpdates}
          onUpdateNow={openUpdateDialog}
          notify={notify}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

async function waitForUpdate(
  version: string,
  onStatus: (status: UpdateStatus) => void,
): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1_500));
    try {
      const status = await getUpdateStatus();
      onStatus(status);
      if (status.state === "complete" && status.version === version) return;
      if (status.state === "failed") {
        throw new Error(status.message || "The update could not be installed.");
      }
    } catch (error) {
      if (error instanceof TypeError) continue;
      throw error;
    }
  }
  throw new Error("The update is taking longer than expected.");
}

function readSetting(key: string): string | null {
  return globalThis.localStorage?.getItem(key) ?? null;
}
