import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
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
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Slider } from "@astryxdesign/core/Slider";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Compass,
  Heart,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";
import type { RadioState, Station } from "../types.ts";
import { stationMetadata, StationThumbnail } from "../ui.tsx";

export function ListenView({
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
}) {
  return (
    <Layout
      height="auto"
      padding={6}
      content={
        <VStack gap={4}>
          {state.target === "appliance" &&
            state.outputStatus.kind === "error" && (
            <Banner
              status="error"
              title="Pi output unavailable"
              description={state.outputStatus.message ||
                "The audio output could not be started."}
            />
          )}
          <Grid columns={{ minWidth: 340, max: 2 }} gap={5} align="stretch">
            <NowPlayingCard
              state={state}
              role={role}
              onToggle={onToggle}
              onPrevious={onPrevious}
              onNext={onNext}
              onVolume={onVolume}
            />
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
          </Grid>
        </VStack>
      }
    />
  );
}

function NowPlayingCard(
  { state, role, onToggle, onPrevious, onNext, onVolume }: {
    state: RadioState;
    role: "player" | "remote";
    onToggle: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onVolume: (volume: number) => void;
  },
) {
  const title = state.station?.name || "No station selected";
  return (
    <Card padding={0} variant="muted">
      <Layout
        height="auto"
        header={
          <LayoutHeader padding={5} hasDivider>
            <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={state.playing ? "success" : "neutral"}
                  label={state.playing ? "Live" : "Stopped"}
                  isPulsing={state.playing}
                />
                <Text type="label">Now playing</Text>
              </HStack>
              <Badge
                variant="info"
                label={state.target === "browser"
                  ? "Browser output"
                  : "Pi output"}
              />
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            <Grid columns={2} gap={6} align="center">
              <AspectRatio ratio={1} fit="cover">
                {state.station?.favicon
                  ? <img src={state.station.favicon} alt={`${title} artwork`} />
                  : (
                    <Card padding={8} variant="gray">
                      <VStack hAlign="center" vAlign="center" height="100%">
                        <Icon icon={Radio} color="accent" size="lg" />
                      </VStack>
                    </Card>
                  )}
              </AspectRatio>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Text type="label" color="accent">
                    {state.playing ? "On air" : "Receiver ready"}
                  </Text>
                  <Heading level={1} type="display-2" textWrap="balance">
                    {title}
                  </Heading>
                  <Text color="secondary" maxLines={2}>
                    {state.nowPlaying ||
                      (state.station
                        ? stationMetadata(state.station)
                        : "Choose a preset from your station library.")}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {state.target === "browser" && role === "remote"
                      ? "Another browser owns playback"
                      : state.target === "appliance"
                      ? state.outputStatus.message ||
                        "Raspberry Pi audio output"
                      : "This browser owns playback"}
                  </Text>
                </VStack>
                <HStack gap={3} vAlign="center" hAlign="center">
                  <IconButton
                    label="Previous favorite"
                    variant="secondary"
                    icon={<Icon icon={SkipBack} />}
                    onClick={onPrevious}
                  />
                  <IconButton
                    label={state.playing ? "Pause" : "Play"}
                    variant="primary"
                    size="lg"
                    icon={<Icon icon={state.playing ? Pause : Play} />}
                    onClick={onToggle}
                  />
                  <IconButton
                    label="Next favorite"
                    variant="secondary"
                    icon={<Icon icon={SkipForward} />}
                    onClick={onNext}
                  />
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
            </Grid>
          </LayoutContent>
        }
      />
    </Card>
  );
}

function StationLibrary({
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
  activeId?: number;
  loading: boolean;
  onSelect: (station: Station) => void;
  onFavorite: (station: Station) => void;
  onEdit: (station: Station) => void;
  onDelete: (station: Station) => void;
  onAdd: () => void;
  onDiscover: () => void;
}) {
  return (
    <Card padding={0}>
      <Layout
        height="auto"
        header={
          <LayoutHeader padding={5} hasDivider>
            <HStack hAlign="between" vAlign="center" gap={3}>
              <VStack gap={1}>
                <Text type="label" color="accent">Presets</Text>
                <Heading level={2}>Station library</Heading>
              </VStack>
              <IconButton
                label="Add custom station"
                icon={<Icon icon={Plus} />}
                variant="secondary"
                onClick={onAdd}
              />
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            {loading
              ? (
                <VStack gap={3} padding={5}>
                  {[0, 1, 2, 3].map((index) => (
                    <HStack gap={3} vAlign="center" key={index}>
                      <Skeleton
                        width={48}
                        height={48}
                        radius={2}
                        index={index}
                      />
                      <VStack gap={2} width="100%">
                        <Skeleton width="60%" height={14} index={index} />
                        <Skeleton width="35%" height={10} index={index} />
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              )
              : stations.length
              ? (
                <List hasDividers density="compact">
                  {stations.map((station) => (
                    <Item
                      key={station.id}
                      as="li"
                      density="compact"
                      isSelected={station.id === activeId}
                      startContent={<StationThumbnail station={station} />}
                      label={station.name}
                      description={stationMetadata(station)}
                      onClick={() => onSelect(station)}
                      endContent={
                        <HStack gap={1}>
                          <IconButton
                            label={station.favorite
                              ? "Remove favorite"
                              : "Add favorite"}
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
                          <IconButton
                            label="Edit station"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={Pencil} size="sm" />}
                            onClick={() => onEdit(station)}
                          />
                          <IconButton
                            label="Delete station"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={Trash2} size="sm" />}
                            onClick={() => onDelete(station)}
                          />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )
              : (
                <EmptyState
                  isCompact
                  icon={<Icon icon={Radio} color="accent" />}
                  title="No presets yet"
                  description="Find a station in the open radio directory."
                />
              )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4} hasDivider>
            <Button
              label="Discover more stations"
              variant="ghost"
              icon={<Icon icon={Compass} />}
              onClick={onDiscover}
            />
          </LayoutFooter>
        }
      />
    </Card>
  );
}
