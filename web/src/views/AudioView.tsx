import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { List } from "@astryxdesign/core/List";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowRight,
  Bluetooth,
  BluetoothSearching,
  Bug,
  Headphones,
  ListFilter,
  Plug,
  RadioTower,
  RefreshCw,
  Speaker,
  Trash2,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectAudioDevice,
  disconnectAudioDevice,
  forgetAudioDevice,
  getAudioDiagnostics,
  getAudioStatus,
  pairAudioDevice,
  scanAudioDevices,
  selectAudioOutput,
} from "../api.ts";
import { RaspberryMark } from "../icons.tsx";
import type {
  BluetoothAudioStatus,
  BluetoothDevice,
  BluetoothDiagnostics,
} from "../types.ts";
import { errorMessage, type Notify, PageFrame } from "../ui.tsx";

export function AudioView({ notify }: { notify: Notify }) {
  const [status, setStatus] = useState<BluetoothAudioStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<BluetoothDiagnostics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [showAllDevices, setShowAllDevices] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<DiagnosticAction | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingForget, setPendingForget] = useState<BluetoothDevice | null>(
    null,
  );
  const [forgetting, setForgetting] = useState(false);

  const loadDiagnostics = useCallback(async (notifyOnError: boolean) => {
    const startedAt = performance.now();
    try {
      const next = await getAudioDiagnostics();
      setDiagnostics(next);
      setStatus(next.status);
      setApiLatencyMs(Math.round(performance.now() - startedAt));
      setApiError(null);
    } catch (error) {
      const message = errorMessage(error);
      setApiError(message);
      if (notifyOnError) notify(message, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadDiagnostics(false);
  }, [loadDiagnostics]);

  const selectedDevice = useMemo(
    () =>
      status?.devices.find((device) =>
        device.address === status.selectedDeviceAddress
      ) ?? null,
    [status],
  );

  const audioDevices = useMemo(
    () => status?.devices.filter((device) => device.audioCapable) ?? [],
    [status],
  );
  const visibleDevices = showAllDevices ? status?.devices ?? [] : audioDevices;

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<BluetoothAudioStatus>,
    message: string,
  ) => {
    setPendingAction(key);
    setLastAction({
      name: diagnosticActionName(key),
      state: "running",
      completedAt: null,
      error: null,
    });
    try {
      setStatus(await action());
      setLastAction({
        name: diagnosticActionName(key),
        state: "success",
        completedAt: new Date().toISOString(),
        error: null,
      });
      notify(message);
    } catch (error) {
      const message = errorMessage(error);
      setLastAction({
        name: diagnosticActionName(key),
        state: "error",
        completedAt: new Date().toISOString(),
        error: message,
      });
      notify(message, "error");
    } finally {
      await loadDiagnostics(false);
      setPendingAction(null);
    }
  }, [loadDiagnostics, notify]);

  const scan = () =>
    runAction(
      "scan",
      () => scanAudioDevices(12, false),
      "Bluetooth scan complete.",
    );

  const pair = (device: BluetoothDevice) =>
    runAction(
      `pair:${device.address}`,
      async () => {
        await pairAudioDevice(device.address);
        return await connectAudioDevice(device.address);
      },
      `${device.alias} paired and selected.`,
    );

  const connect = (device: BluetoothDevice) =>
    runAction(
      `connect:${device.address}`,
      () => connectAudioDevice(device.address),
      `${device.alias} selected.`,
    );

  const disconnect = (device: BluetoothDevice) =>
    runAction(
      `disconnect:${device.address}`,
      () => disconnectAudioDevice(device.address),
      `${device.alias} disconnected.`,
    );

  const usePiAudio = () =>
    runAction(
      "local",
      () => selectAudioOutput(null),
      "Pi audio selected.",
    );

  const forget = async () => {
    if (!pendingForget) return;
    setForgetting(true);
    setLastAction({
      name: "Forget device",
      state: "running",
      completedAt: null,
      error: null,
    });
    try {
      setStatus(await forgetAudioDevice(pendingForget.address));
      notify(`${pendingForget.alias} forgotten.`);
      setLastAction({
        name: "Forget device",
        state: "success",
        completedAt: new Date().toISOString(),
        error: null,
      });
      setPendingForget(null);
    } catch (error) {
      const message = errorMessage(error);
      setLastAction({
        name: "Forget device",
        state: "error",
        completedAt: new Date().toISOString(),
        error: message,
      });
      notify(message, "error");
    } finally {
      await loadDiagnostics(false);
      setForgetting(false);
    }
  };

  const busy = pendingAction !== null || forgetting;

  return (
    <>
      <PageFrame
        eyebrow="Receiver output"
        title="Audio"
        description="Pair a Bluetooth speaker or headphones, then choose where the Pi plays."
      >
        {!loading && apiError && (
          <Banner
            status="error"
            title="Bluetooth API check failed"
            description={apiError}
            endContent={
              <Button
                label="Retry API check"
                variant="ghost"
                size="sm"
                icon={<Icon icon={RefreshCw} size="sm" />}
                clickAction={() => loadDiagnostics(true)}
              />
            }
          />
        )}
        {!loading && status && !status.available && (
          <Banner
            status="error"
            title="Bluetooth unavailable"
            description={status.error ||
              "The Pi could not reach its Bluetooth adapter."}
            endContent={
              <Button
                label="Try again"
                variant="ghost"
                size="sm"
                icon={<Icon icon={RefreshCw} size="sm" />}
                clickAction={() => loadDiagnostics(true)}
              />
            }
          />
        )}
        {!loading && status?.available && !status.powered && (
          <Banner
            status="warning"
            title="Bluetooth adapter is off"
            description="Scanning will switch it on and look for nearby audio devices."
          />
        )}
        <CurrentOutput
          loading={loading}
          status={status}
          selectedDevice={selectedDevice}
          busy={busy}
          localPending={pendingAction === "local"}
          onUsePiAudio={usePiAudio}
        />
        <Section padding={0}>
          <VStack gap={0}>
            <HStack
              gap={4}
              padding={5}
              hAlign="between"
              vAlign="center"
              wrap="wrap"
            >
              <VStack gap={1}>
                <Heading level={2}>Bluetooth devices</Heading>
                <Text color="secondary">
                  Put your speaker or headphones in pairing mode before
                  scanning.
                </Text>
              </VStack>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <IconButton
                  label="Refresh Bluetooth devices"
                  tooltip="Refresh devices"
                  variant="ghost"
                  icon={<Icon icon={RefreshCw} size="sm" />}
                  isLoading={pendingAction === "refresh"}
                  isDisabled={busy}
                  clickAction={() =>
                    runAction(
                      "refresh",
                      () => getAudioStatus(false),
                      "Bluetooth devices refreshed.",
                    )}
                />
                <Switch
                  label="Show all devices"
                  value={showAllDevices}
                  onChange={setShowAllDevices}
                />
                <Button
                  label="Scan for devices"
                  variant="primary"
                  icon={<Icon icon={BluetoothSearching} size="sm" />}
                  isLoading={pendingAction === "scan"}
                  isDisabled={busy || status?.available === false}
                  onClick={scan}
                />
              </HStack>
            </HStack>
            <DeviceList
              loading={loading}
              devices={visibleDevices}
              showAllDevices={showAllDevices}
              selectedAddress={status?.selectedDeviceAddress ?? null}
              pendingAction={pendingAction}
              busy={busy}
              onPair={pair}
              onConnect={connect}
              onDisconnect={disconnect}
              onForget={setPendingForget}
            />
          </VStack>
        </Section>
        <DiagnosticsPanel
          diagnostics={diagnostics}
          apiError={apiError}
          apiLatencyMs={apiLatencyMs}
          loading={loading}
          lastAction={lastAction}
          totalDevices={status?.devices.length ?? 0}
          audioDevices={audioDevices.length}
          isRefreshing={pendingAction === "refresh"}
          isBusy={busy}
          onRefresh={() =>
            runAction(
              "refresh",
              () => getAudioStatus(false),
              "Bluetooth diagnostics refreshed.",
            )}
        />
      </PageFrame>
      <AlertDialog
        isOpen={Boolean(pendingForget)}
        onOpenChange={(open) => !open && setPendingForget(null)}
        title="Forget Bluetooth device?"
        description={pendingForget
          ? `${pendingForget.alias} will need to be paired again before the Pi can use it.`
          : "This device will need to be paired again."}
        actionLabel="Forget device"
        isActionLoading={forgetting}
        onAction={forget}
      />
    </>
  );
}

interface DiagnosticAction {
  name: string;
  state: "running" | "success" | "error";
  completedAt: string | null;
  error: string | null;
}

type DiagnosticVariant =
  | "success"
  | "warning"
  | "error"
  | "accent"
  | "neutral";

interface DiagnosticStep {
  label: string;
  detail: string;
  variant: DiagnosticVariant;
  pulsing?: boolean;
}

function DiagnosticsPanel({
  diagnostics,
  apiError,
  apiLatencyMs,
  loading,
  lastAction,
  totalDevices,
  audioDevices,
  isRefreshing,
  isBusy,
  onRefresh,
}: {
  diagnostics: BluetoothDiagnostics | null;
  apiError: string | null;
  apiLatencyMs: number | null;
  loading: boolean;
  lastAction: DiagnosticAction | null;
  totalDevices: number;
  audioDevices: number;
  isRefreshing: boolean;
  isBusy: boolean;
  onRefresh: () => void;
}) {
  const bluetoothStatus = diagnostics?.status;
  const lastPower = diagnostics?.lastPower;
  const lastScan = diagnostics?.lastScan;
  const steps: DiagnosticStep[] = [
    loading
      ? {
        label: "Airwave API",
        detail: "Checking endpoint",
        variant: "accent",
        pulsing: true,
      }
      : apiError
      ? { label: "Airwave API", detail: apiError, variant: "error" }
      : {
        label: "Airwave API",
        detail: apiLatencyMs === null ? "Responding" : `${apiLatencyMs} ms`,
        variant: "success",
      },
    !bluetoothStatus
      ? { label: "BlueZ", detail: "No result", variant: "neutral" }
      : bluetoothStatus.available
      ? {
        label: "BlueZ",
        detail: bluetoothStatus.adapterName || "Controller found",
        variant: "success",
      }
      : {
        label: "BlueZ",
        detail: bluetoothStatus.error || "Controller unavailable",
        variant: "error",
      },
    !bluetoothStatus?.available
      ? { label: "Controller", detail: "Waiting for BlueZ", variant: "neutral" }
      : bluetoothStatus.powered
      ? { label: "Controller", detail: "Powered on", variant: "success" }
      : lastPower?.state === "error"
      ? {
        label: "Controller",
        detail: lastPower.error || "Power failed",
        variant: "error",
      }
      : { label: "Controller", detail: "Powered off", variant: "warning" },
    !lastScan
      ? { label: "Discovery", detail: "Not run yet", variant: "neutral" }
      : lastScan.state === "running"
      ? {
        label: "Discovery",
        detail: "Scanning nearby devices",
        variant: "accent",
        pulsing: true,
      }
      : lastScan.state === "success"
      ? {
        label: "Discovery",
        detail: formatDuration(lastScan.durationMs),
        variant: "success",
      }
      : {
        label: "Discovery",
        detail: lastScan.error || "Scan failed",
        variant: "error",
      },
    totalDevices > 0
      ? {
        label: "Visibility",
        detail: `${audioDevices} audio · ${totalDevices} total`,
        variant: "success",
      }
      : {
        label: "Visibility",
        detail: "No devices reported",
        variant: "warning",
      },
  ];
  const diagnosticBundle = JSON.stringify(
    {
      checkedAt: diagnostics?.checkedAt ?? new Date().toISOString(),
      api: {
        ok: !apiError && Boolean(diagnostics),
        latencyMs: apiLatencyMs,
        error: apiError,
      },
      visibleDevices: { total: totalDevices, audio: audioDevices },
      lastUiAction: lastAction,
      bluetooth: diagnostics,
    },
    null,
    2,
  );

  return (
    <Section padding={0}>
      <VStack gap={0}>
        <HStack
          gap={4}
          padding={5}
          hAlign="between"
          vAlign="center"
          wrap="wrap"
        >
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Icon icon={Bug} color="accent" size="sm" />
              <Heading level={2}>Bluetooth diagnostics</Heading>
            </HStack>
            <Text color="secondary">
              Follow the production signal path and copy the evidence if a stage
              fails.
            </Text>
          </VStack>
          <Button
            label="Refresh diagnostics"
            variant="secondary"
            size="sm"
            icon={<Icon icon={RefreshCw} size="sm" />}
            isLoading={isRefreshing}
            isDisabled={isBusy}
            onClick={onRefresh}
          />
        </HStack>
        <Section variant="muted" padding={5}>
          <HStack gap={3} vAlign="center" wrap="wrap">
            {steps.map((step, index) => (
              <HStack key={step.label} gap={3} vAlign="center">
                <DiagnosticStepView step={step} />
                {index < steps.length - 1 && (
                  <Icon icon={ArrowRight} color="secondary" size="sm" />
                )}
              </HStack>
            ))}
          </HStack>
        </Section>
        <Collapsible
          defaultIsOpen={false}
          trigger={
            <HStack gap={2} vAlign="center">
              <Icon icon={ListFilter} size="sm" />
              <Text type="label">Production details</Text>
            </HStack>
          }
        >
          <VStack gap={5} padding={5}>
            <MetadataList columns="multi">
              <MetadataListItem label="Controller">
                {bluetoothStatus?.adapterName || "Not reported"}
              </MetadataListItem>
              <MetadataListItem label="Controller address">
                {bluetoothStatus?.adapterAddress || "Not reported"}
              </MetadataListItem>
              <MetadataListItem label="API checked">
                {formatDiagnosticTime(diagnostics?.checkedAt)}
              </MetadataListItem>
              <MetadataListItem label="Last power check">
                {lastPower
                  ? `${lastPower.state} · ${lastPower.attempts} attempts`
                  : "Not run since startup"}
              </MetadataListItem>
              <MetadataListItem label="Last discovery">
                {lastScan
                  ? `${lastScan.state} · ${formatDuration(lastScan.durationMs)}`
                  : "Not run since startup"}
              </MetadataListItem>
              <MetadataListItem label="Last UI action">
                {lastAction
                  ? `${lastAction.name} · ${lastAction.state}`
                  : "No action in this browser"}
              </MetadataListItem>
            </MetadataList>
            <CodeBlock
              title="airwave-bluetooth-diagnostics.json"
              language="json"
              code={diagnosticBundle}
              width="100%"
              maxHeight={320}
              isWrapped
            />
          </VStack>
        </Collapsible>
      </VStack>
    </Section>
  );
}

function DiagnosticStepView({ step }: { step: DiagnosticStep }) {
  return (
    <VStack gap={1}>
      <HStack gap={2} vAlign="center">
        <StatusDot
          variant={step.variant}
          label={`${step.label}: ${step.detail}`}
          isPulsing={step.pulsing}
        />
        <Text type="label">{step.label}</Text>
      </HStack>
      <Text type="supporting" color="secondary">{step.detail}</Text>
    </VStack>
  );
}

function CurrentOutput({
  loading,
  status,
  selectedDevice,
  busy,
  localPending,
  onUsePiAudio,
}: {
  loading: boolean;
  status: BluetoothAudioStatus | null;
  selectedDevice: BluetoothDevice | null;
  busy: boolean;
  localPending: boolean;
  onUsePiAudio: () => void;
}) {
  const selectedAddress = status?.selectedDeviceAddress ?? null;
  const usingBluetooth = Boolean(selectedAddress);
  const outputName = selectedDevice?.alias ??
    (usingBluetooth ? "Saved Bluetooth device" : "Pi audio");
  const connectionLabel = selectedDevice?.connected
    ? "Connected"
    : usingBluetooth
    ? "Waiting for device"
    : "Local output";
  const connectionVariant = selectedDevice?.connected
    ? "success"
    : usingBluetooth
    ? "warning"
    : "neutral";

  return (
    <Section variant="muted" padding={6}>
      {loading
        ? <Skeleton width="100%" height={72} />
        : (
          <HStack gap={5} hAlign="between" vAlign="center" wrap="wrap">
            <HStack gap={4} vAlign="center" wrap="wrap">
              <Icon icon={RadioTower} color="accent" size="lg" />
              <Icon icon={ArrowRight} color="secondary" size="sm" />
              {usingBluetooth
                ? <Icon icon={deviceIcon(selectedDevice)} size="lg" />
                : <Icon icon={RaspberryMark} color="accent" size="lg" />}
              <VStack gap={1}>
                <Text type="label" color="accent">Current Pi output</Text>
                <Heading level={2}>{outputName}</Heading>
                <HStack gap={2} vAlign="center">
                  <StatusDot
                    variant={connectionVariant}
                    label={connectionLabel}
                    isPulsing={usingBluetooth && !selectedDevice?.connected}
                  />
                  <Text type="supporting" color="secondary">
                    {connectionLabel}
                  </Text>
                </HStack>
              </VStack>
            </HStack>
            {usingBluetooth && (
              <Button
                label="Use Pi audio"
                variant="secondary"
                icon={<Icon icon={RaspberryMark} size="sm" />}
                isLoading={localPending}
                isDisabled={busy}
                onClick={onUsePiAudio}
              />
            )}
          </HStack>
        )}
    </Section>
  );
}

function DeviceList({
  loading,
  devices,
  showAllDevices,
  selectedAddress,
  pendingAction,
  busy,
  onPair,
  onConnect,
  onDisconnect,
  onForget,
}: {
  loading: boolean;
  devices: BluetoothDevice[];
  showAllDevices: boolean;
  selectedAddress: string | null;
  pendingAction: string | null;
  busy: boolean;
  onPair: (device: BluetoothDevice) => void;
  onConnect: (device: BluetoothDevice) => void;
  onDisconnect: (device: BluetoothDevice) => void;
  onForget: (device: BluetoothDevice) => void;
}) {
  if (loading) {
    return (
      <VStack gap={3} padding={5}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} width="100%" height={48} index={index} />
        ))}
      </VStack>
    );
  }
  if (!devices.length) {
    return (
      <EmptyState
        isCompact
        icon={<Icon icon={BluetoothSearching} color="accent" size="lg" />}
        title={showAllDevices
          ? "No Bluetooth devices found"
          : "No audio devices identified"}
        description={showAllDevices
          ? "Start a scan while the nearby device is in pairing mode."
          : "Scan again or turn on Show all devices to inspect everything BlueZ can see."}
      />
    );
  }
  return (
    <List hasDividers density="compact">
      {devices.map((device) => {
        const selected = device.address === selectedAddress;
        const rowStatus = selected
          ? device.connected ? "Selected" : "Selected · Offline"
          : device.connected
          ? "Connected"
          : device.paired
          ? "Paired"
          : "Nearby";
        const rowVariant = selected && device.connected
          ? "success"
          : selected
          ? "warning"
          : device.connected
          ? "accent"
          : "neutral";
        return (
          <Item
            key={device.address}
            as="li"
            density="spacious"
            align="start"
            isSelected={selected}
            startContent={
              <Icon icon={deviceIcon(device)} color="accent" size="lg" />
            }
            label={device.alias}
            description={`${device.address} · ${deviceDescription(device)}`}
            endContent={
              <HStack gap={2} vAlign="center" wrap="wrap">
                <HStack gap={2} vAlign="center">
                  <StatusDot variant={rowVariant} label={rowStatus} />
                  <Text type="supporting" color="secondary">{rowStatus}</Text>
                </HStack>
                {!device.paired
                  ? (
                    <Button
                      label="Pair"
                      size="sm"
                      variant="secondary"
                      icon={<Icon icon={Plug} size="sm" />}
                      isLoading={pendingAction === `pair:${device.address}`}
                      isDisabled={busy}
                      onClick={() => onPair(device)}
                    />
                  )
                  : !device.audioCapable
                  ? (
                    <Text type="supporting" color="secondary">
                      Not an audio output
                    </Text>
                  )
                  : selected && device.connected
                  ? (
                    <Button
                      label="Disconnect"
                      size="sm"
                      variant="ghost"
                      icon={<Icon icon={Unplug} size="sm" />}
                      isLoading={pendingAction ===
                        `disconnect:${device.address}`}
                      isDisabled={busy}
                      onClick={() => onDisconnect(device)}
                    />
                  )
                  : (
                    <Button
                      label="Use output"
                      size="sm"
                      variant="secondary"
                      icon={<Icon icon={Bluetooth} size="sm" />}
                      isLoading={pendingAction === `connect:${device.address}`}
                      isDisabled={busy}
                      onClick={() => onConnect(device)}
                    />
                  )}
                {device.paired && (
                  <IconButton
                    label={`Forget ${device.alias}`}
                    tooltip="Forget device"
                    size="sm"
                    variant="ghost"
                    icon={<Icon icon={Trash2} size="sm" />}
                    isDisabled={busy}
                    onClick={() => onForget(device)}
                  />
                )}
              </HStack>
            }
          />
        );
      })}
    </List>
  );
}

function deviceIcon(device: BluetoothDevice | null) {
  const icon = device?.icon ?? "";
  if (icon.includes("head")) return Headphones;
  if (icon.includes("speaker") || icon === "audio-card") return Speaker;
  return Bluetooth;
}

function deviceDescription(device: BluetoothDevice): string {
  if (device.connected) return "Bluetooth audio connected";
  if (!device.audioCapable && device.paired) return "No audio profile reported";
  if (!device.audioCapable) return "Audio profile not known until pairing";
  if (device.paired) return "Ready to connect";
  return "Available to pair";
}

function diagnosticActionName(key: string): string {
  const action = key.split(":", 1)[0];
  if (action === "scan") return "Device scan";
  if (action === "refresh") return "Diagnostics refresh";
  if (action === "pair") return "Pair device";
  if (action === "connect") return "Connect device";
  if (action === "disconnect") return "Disconnect device";
  if (action === "local") return "Select Pi audio";
  return action;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "In progress";
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(1)} s`;
}

function formatDiagnosticTime(value: string | undefined): string {
  if (!value) return "Not checked";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
