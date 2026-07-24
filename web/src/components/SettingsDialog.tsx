import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Bluetooth,
  Download,
  Moon,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useState } from "react";
import type { Notify } from "../ui.tsx";
import { isPaletteName, type PaletteName, paletteOptions } from "../theme.ts";
import type { VersionInfo } from "../types.ts";
import { BluetoothSettings } from "./BluetoothSettings.tsx";

type ColorMode = "light" | "dark";

export function SettingsDialog({
  palette,
  mode,
  setPalette,
  setMode,
  version,
  connected,
  checkingUpdates,
  updating,
  onCheckUpdates,
  onUpdateNow,
  notify,
  onClose,
}: {
  palette: PaletteName;
  mode: ColorMode;
  setPalette: (palette: PaletteName) => void;
  setMode: (mode: ColorMode) => void;
  version: VersionInfo | null;
  connected: boolean;
  checkingUpdates: boolean;
  updating: boolean;
  onCheckUpdates: () => void;
  onUpdateNow: () => void;
  notify: Notify;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("appearance");
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      purpose="info"
      width={720}
      maxHeight={640}
    >
      <Layout
        height="fill"
        header={
          <DialogHeader
            title="Settings"
            hasDivider
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent padding={6}>
            <VStack gap={5}>
              <TabList
                value={tab}
                onChange={setTab}
                aria-label="Settings sections"
              >
                <Tab
                  value="appearance"
                  label="Appearance"
                  icon={<Icon icon={SlidersHorizontal} size="sm" />}
                />
                <Tab
                  value="output"
                  label="Bluetooth"
                  icon={<Icon icon={Bluetooth} size="sm" />}
                />
                <Tab
                  value="about"
                  label="Software"
                  icon={<Icon icon={RefreshCw} size="sm" />}
                />
              </TabList>
              <VStack minHeight={492} width="100%">
                {tab === "appearance"
                  ? (
                    <AppearanceSettings
                      palette={palette}
                      mode={mode}
                      setPalette={setPalette}
                      setMode={setMode}
                    />
                  )
                  : tab === "output"
                  ? <BluetoothSettings notify={notify} />
                  : (
                    <SoftwareSettings
                      version={version}
                      connected={connected}
                      checkingUpdates={checkingUpdates}
                      updating={updating}
                      onCheckUpdates={onCheckUpdates}
                      onUpdateNow={onUpdateNow}
                    />
                  )}
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

function AppearanceSettings({
  palette,
  mode,
  setPalette,
  setMode,
}: {
  palette: PaletteName;
  mode: ColorMode;
  setPalette: (palette: PaletteName) => void;
  setMode: (mode: ColorMode) => void;
}) {
  return (
    <VStack gap={6} width="100%">
      <Selector
        label="Colour palette"
        value={palette}
        options={paletteOptions}
        startIcon={<Icon icon={Palette} size="sm" />}
        onChange={(value) => isPaletteName(value) && setPalette(value)}
      />
      <Switch
        label="Dark mode"
        labelIcon={<Icon icon={mode === "dark" ? Moon : Sun} size="sm" />}
        labelPosition="start"
        labelSpacing="spread"
        value={mode === "dark"}
        onChange={(dark) => setMode(dark ? "dark" : "light")}
      />
    </VStack>
  );
}

function SoftwareSettings({
  version,
  connected,
  checkingUpdates,
  updating,
  onCheckUpdates,
  onUpdateNow,
}: {
  version: VersionInfo | null;
  connected: boolean;
  checkingUpdates: boolean;
  updating: boolean;
  onCheckUpdates: () => void;
  onUpdateNow: () => void;
}) {
  const updateReady = Boolean(version?.updateAvailable && version?.latest);
  return (
    <VStack gap={4} width="100%">
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <HStack gap={3} vAlign="center">
          <StatusDot
            variant={connected ? "success" : "warning"}
            label={connected ? "Receiver online" : "Reconnecting"}
            isPulsing={!connected}
          />
          <VStack gap={0}>
            <Text type="label">
              {version ? `Version ${version.current}` : "Reading version…"}
            </Text>
            <Text type="supporting" color="secondary">
              {updateReady && version?.latest
                ? `v${version.latest} is available`
                : connected
                ? "Receiver connected"
                : "Waiting for the receiver"}
            </Text>
          </VStack>
        </HStack>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label="Check for updates"
            variant="secondary"
            icon={<Icon icon={RefreshCw} size="sm" />}
            isLoading={checkingUpdates || updating}
            onClick={onCheckUpdates}
          />
          {updateReady && (
            <Button
              label="Update now"
              variant="primary"
              icon={<Icon icon={Download} size="sm" />}
              isLoading={updating}
              onClick={onUpdateNow}
            />
          )}
        </HStack>
      </HStack>
    </VStack>
  );
}
