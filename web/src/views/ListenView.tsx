import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { List } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Slider } from "@astryxdesign/core/Slider";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Clock3,
  Compass,
  Heart,
  History,
  Monitor,
  Pause,
  Pencil,
  Play,
  Plus,
  RadioTower,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getStats } from "../api.ts";
import {
  formatFrequency,
  stationFrequency,
  TunerDial,
} from "../components/TunerDial.tsx";
import { RaspberryMark } from "../icons.tsx";
import type {
  ListeningStats,
  PlaybackTarget,
  RadioState,
  Station,
} from "../types.ts";
import {
  formatDuration,
  type Notify,
  stationMetadata,
  StationThumbnail,
} from "../ui.tsx";

export function ListenView({
  state,
  stations,
  stationsLoading,
  role,
  notify,
  onToggle,
  onPrevious,
  onNext,
  onVolume,
  onSetTarget,
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
  notify: Notify;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolume: (volume: number) => void;
  onSetTarget: (target: PlaybackTarget) => void;
  onSelect: (station: Station) => void;
  onFavorite: (station: Station) => void;
  onEdit: (station: Station) => void;
  onDelete: (station: Station) => void;
  onAdd: () => void;
  onDiscover: () => void;
}) {
  const [stats, setStats] = useState<ListeningStats | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() =>
      notify("Listening history could not be loaded.", "error")
    );
  }, [state.revision, notify]);

  return (
    <Layout
      height="auto"
      content={
        <LayoutContent padding={6}>
          <HStack hAlign="center" vAlign="start" width="100%">
            <VStack gap={5} maxWidth={1120} width="100%">
              {state.target === "appliance" &&
                state.outputStatus.kind === "error" && (
                <Banner
                  status="error"
                  title="Pi output unavailable"
                  description={state.outputStatus.message ||
                    "The audio output could not be started."}
                />
              )}
              <NowPlayingCard
                state={state}
                role={role}
                onToggle={onToggle}
                onPrevious={onPrevious}
                onNext={onNext}
                onVolume={onVolume}
                onSetTarget={onSetTarget}
              />
              <LibraryPanel
                stations={stations}
                activeId={state.station?.id}
                loading={stationsLoading}
                stats={stats}
                onSelect={onSelect}
                onFavorite={onFavorite}
                onEdit={onEdit}
                onDelete={onDelete}
                onAdd={onAdd}
                onDiscover={onDiscover}
              />
            </VStack>
          </HStack>
        </LayoutContent>
      }
    />
  );
}

function NowPlayingCard(
  { state, role, onToggle, onPrevious, onNext, onVolume, onSetTarget }: {
    state: RadioState;
    role: "player" | "remote";
    onToggle: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onVolume: (volume: number) => void;
    onSetTarget: (target: PlaybackTarget) => void;
  },
) {
  const station = state.station;
  const title = station?.name || "Choose a station";
  const frequency = stationFrequency(station?.id ?? null);
  const live = state.playing;
  const statusLabel = live ? "On air" : station ? "Tuned · paused" : "Standby";
  const sourceLabel = state.target === "browser" && role === "remote"
    ? "Controlled here · playing in another browser"
    : state.target === "appliance"
    ? state.outputStatus.message || "Playing through the Pi"
    : "Playing in this browser";

  return (
    <Card padding={5} variant="muted">
      <VStack gap={5}>
        <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={live ? "success" : "neutral"}
              label={statusLabel}
              isPulsing={live}
            />
            <Text type="label" color={live ? "accent" : "secondary"}>
              {statusLabel}
            </Text>
          </HStack>
          <SegmentedControl
            label="Playback output"
            value={state.target}
            onChange={(target) =>
              isPlaybackTarget(target) && onSetTarget(target)}
            size="sm"
          >
            <SegmentedControlItem
              value="browser"
              label="Browser"
              icon={<Icon icon={Monitor} size="sm" />}
            />
            <SegmentedControlItem
              value="appliance"
              label="Pi"
              icon={<Icon icon={RaspberryMark} size="sm" />}
            />
          </SegmentedControl>
        </HStack>

        <VStack className="airwave-dial-frame" gap={2}>
          <HStack hAlign="between" vAlign="end" gap={3}>
            <Text type="label" color="secondary">FM band</Text>
            <HStack gap={2} vAlign="end">
              <Heading level={2} type="display-3">
                {formatFrequency(frequency)}
              </Heading>
              <Text type="label" color="secondary">MHz</Text>
            </HStack>
          </HStack>
          <TunerDial
            frequency={frequency}
            live={live}
            tuned={Boolean(station)}
          />
        </VStack>

        <HStack gap={5} hAlign="between" vAlign="center" wrap="wrap">
          <HStack gap={4} vAlign="center">
            <VStack width={96}>
              <AspectRatio ratio={1} fit="cover">
                {station?.favicon
                  ? <img src={station.favicon} alt={`${title} artwork`} />
                  : (
                    <Card padding={5} variant="gray">
                      <VStack hAlign="center" vAlign="center" height="100%">
                        <Icon icon={RadioTower} color="accent" size="lg" />
                      </VStack>
                    </Card>
                  )}
              </AspectRatio>
            </VStack>
            <VStack gap={1} maxWidth={340}>
              <Heading level={1} type="display-3" textWrap="balance">
                {title}
              </Heading>
              <Text color="secondary" maxLines={2}>
                {state.nowPlaying ||
                  (station
                    ? stationMetadata(station)
                    : "Pick a preset or discover a new frequency.")}
              </Text>
              <Text type="supporting" color="secondary">{sourceLabel}</Text>
            </VStack>
          </HStack>
          <HStack gap={3} vAlign="center">
            <IconButton
              label="Previous favorite"
              variant="secondary"
              icon={<Icon icon={SkipBack} />}
              onClick={onPrevious}
            />
            <IconButton
              label={live ? "Pause" : "Play"}
              variant="primary"
              size="lg"
              icon={<Icon icon={live ? Pause : Play} />}
              onClick={onToggle}
            />
            <IconButton
              label="Next favorite"
              variant="secondary"
              icon={<Icon icon={SkipForward} />}
              onClick={onNext}
            />
          </HStack>
        </HStack>

        <Slider
          label="Volume"
          min={0}
          max={100}
          value={state.volume}
          valueDisplay="text"
          formatValue={(value) => `${value}%`}
          onChange={onVolume}
        />
      </VStack>
    </Card>
  );
}

function LibraryPanel({
  stations,
  activeId,
  loading,
  stats,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onAdd,
  onDiscover,
}: {
  stations: Station[];
  activeId?: number;
  loading: boolean;
  stats: ListeningStats | null;
  onSelect: (station: Station) => void;
  onFavorite: (station: Station) => void;
  onEdit: (station: Station) => void;
  onDelete: (station: Station) => void;
  onAdd: () => void;
  onDiscover: () => void;
}) {
  const [tab, setTab] = useState("presets");
  return (
    <Card padding={0}>
      <Layout
        height="auto"
        header={
          <LayoutHeader padding={4} hasDivider>
            <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
              <TabList
                value={tab}
                onChange={setTab}
                size="sm"
                aria-label="Listen details"
              >
                <Tab
                  value="presets"
                  label="Presets"
                  icon={<Icon icon={RadioTower} size="sm" />}
                />
                <Tab
                  value="history"
                  label="History"
                  icon={<Icon icon={History} size="sm" />}
                />
              </TabList>
              {tab === "presets" && (
                <IconButton
                  label="Add custom station"
                  icon={<Icon icon={Plus} />}
                  variant="secondary"
                  onClick={onAdd}
                />
              )}
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            {tab === "presets"
              ? (
                <PresetList
                  stations={stations}
                  activeId={activeId}
                  loading={loading}
                  onSelect={onSelect}
                  onFavorite={onFavorite}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )
              : <ListeningHistory stats={stats} />}
          </LayoutContent>
        }
        footer={tab === "presets"
          ? (
            <LayoutFooter padding={4} hasDivider>
              <Button
                label="Discover stations"
                variant="ghost"
                icon={<Icon icon={Compass} />}
                onClick={onDiscover}
              />
            </LayoutFooter>
          )
          : undefined}
      />
    </Card>
  );
}

function PresetList({
  stations,
  activeId,
  loading,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
}: {
  stations: Station[];
  activeId?: number;
  loading: boolean;
  onSelect: (station: Station) => void;
  onFavorite: (station: Station) => void;
  onEdit: (station: Station) => void;
  onDelete: (station: Station) => void;
}) {
  if (loading) {
    return (
      <VStack gap={3} padding={5}>
        {[0, 1, 2, 3].map((index) => (
          <HStack gap={3} vAlign="center" key={index}>
            <Skeleton width={48} height={48} radius={2} index={index} />
            <VStack gap={2} width="100%">
              <Skeleton width="60%" height={14} index={index} />
              <Skeleton width="35%" height={10} index={index} />
            </VStack>
          </HStack>
        ))}
      </VStack>
    );
  }
  if (!stations.length) {
    return (
      <EmptyState
        isCompact
        icon={<Icon icon={RadioTower} color="accent" />}
        title="No presets yet"
        description="Find a station in the open radio directory."
      />
    );
  }
  return (
    <List hasDividers density="balanced">
      {stations.map((station) => (
        <Item
          key={station.id}
          as="li"
          density="balanced"
          isSelected={station.id === activeId}
          startContent={<StationThumbnail station={station} />}
          label={station.name}
          description={stationMetadata(station)}
          endContent={
            <HStack gap={1}>
              <IconButton
                label={`Play ${station.name}`}
                variant={station.id === activeId ? "primary" : "ghost"}
                size="sm"
                icon={<Icon icon={Play} size="sm" />}
                onClick={() => onSelect(station)}
              />
              <IconButton
                label={station.favorite ? "Remove favorite" : "Add favorite"}
                variant="ghost"
                size="sm"
                icon={
                  <Icon
                    icon={Heart}
                    color={station.favorite ? "error" : "secondary"}
                    size="sm"
                  />
                }
                onClick={() => onFavorite(station)}
              />
              <MoreMenu
                label={`More actions for ${station.name}`}
                size="sm"
                items={[
                  {
                    label: "Edit station",
                    icon: Pencil,
                    onClick: () => onEdit(station),
                  },
                  { type: "divider" },
                  {
                    label: "Delete station",
                    icon: Trash2,
                    onClick: () => onDelete(station),
                  },
                ]}
              />
            </HStack>
          }
        />
      ))}
    </List>
  );
}

function ListeningHistory({ stats }: { stats: ListeningStats | null }) {
  if (!stats) {
    return (
      <VStack gap={3} padding={5}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} width="100%" height={40} index={index} />
        ))}
      </VStack>
    );
  }
  return (
    <VStack gap={5} padding={5}>
      <Grid columns={{ minWidth: 100, max: 3 }} gap={4}>
        <HistoryMetric
          label="Listening"
          value={formatDuration(stats.totalListeningSeconds)}
          icon={Clock3}
        />
        <HistoryMetric
          label="Sessions"
          value={String(stats.totalPlays)}
          icon={History}
        />
        <HistoryMetric
          label="Stations"
          value={String(stats.uniqueStations)}
          icon={RadioTower}
        />
      </Grid>
      {stats.recent.length
        ? (
          <List hasDividers density="compact">
            {stats.recent.slice(0, 8).map((entry) => (
              <Item
                key={entry.id}
                as="li"
                density="compact"
                marker={
                  <StatusDot
                    variant={entry.endedAt ? "neutral" : "success"}
                    label={entry.endedAt ? "Ended" : "Playing"}
                  />
                }
                label={entry.stationName}
                description={entry.nowPlaying ||
                  new Date(entry.startedAt).toLocaleString()}
                endContent={
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {formatDuration(entry.durationSeconds)}
                  </Text>
                }
              />
            ))}
          </List>
        )
        : (
          <EmptyState
            isCompact
            title="No listening history yet"
            description="Your recent stations will appear here."
          />
        )}
    </VStack>
  );
}

function isPlaybackTarget(value: string): value is PlaybackTarget {
  return value === "browser" || value === "appliance";
}

function HistoryMetric({ label, value, icon }: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center">
        <Icon icon={icon} color="accent" size="sm" />
        <Text type="supporting" color="secondary">{label}</Text>
      </HStack>
      <Heading level={3}>{value}</Heading>
    </VStack>
  );
}
