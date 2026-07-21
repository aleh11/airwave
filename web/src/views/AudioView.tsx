import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { List } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowRight,
  Bluetooth,
  BluetoothSearching,
  Headphones,
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
  getAudioStatus,
  pairAudioDevice,
  scanAudioDevices,
  selectAudioOutput,
} from "../api.ts";
import { RaspberryMark } from "../icons.tsx";
import type { BluetoothAudioStatus, BluetoothDevice } from "../types.ts";
import { errorMessage, type Notify, PageFrame } from "../ui.tsx";

export function AudioView({ notify }: { notify: Notify }) {
  const [status, setStatus] = useState<BluetoothAudioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingForget, setPendingForget] = useState<BluetoothDevice | null>(
    null,
  );
  const [forgetting, setForgetting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAudioStatus());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedDevice = useMemo(
    () =>
      status?.devices.find((device) =>
        device.address === status.selectedDeviceAddress
      ) ?? null,
    [status],
  );

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<BluetoothAudioStatus>,
    message: string,
  ) => {
    setPendingAction(key);
    try {
      setStatus(await action());
      notify(message);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  }, [notify]);

  const scan = () =>
    runAction(
      "scan",
      () => scanAudioDevices(),
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
    try {
      setStatus(await forgetAudioDevice(pendingForget.address));
      notify(`${pendingForget.alias} forgotten.`);
      setPendingForget(null);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
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
                clickAction={refresh}
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
              <HStack gap={2} vAlign="center">
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
                      () => getAudioStatus(),
                      "Bluetooth devices refreshed.",
                    )}
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
              devices={status?.devices ?? []}
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
        title="No audio devices found"
        description="Start a scan while your speaker or headphones are in pairing mode."
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
  if (device.paired) return "Ready to connect";
  return "Available to pair";
}
