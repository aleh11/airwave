import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { List } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  History,
  Radio,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getStats } from "../api.ts";
import type { ListeningStats } from "../types.ts";
import {
  errorMessage,
  formatDuration,
  type Notify,
  PageFrame,
  ReceiverLoading,
} from "../ui.tsx";

export function InsightsView({ revision, notify }: {
  revision: number;
  notify: Notify;
}) {
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
    <PageFrame
      eyebrow="Listening log"
      title="Your air time"
      description="A local record of what played and how long the receiver stayed on."
    >
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <StatCard
          label="Listening time"
          value={formatDuration(stats.totalListeningSeconds)}
          icon={Clock3}
        />
        <StatCard
          label="Sessions"
          value={String(stats.totalPlays)}
          icon={History}
        />
        <StatCard
          label="Stations heard"
          value={String(stats.uniqueStations)}
          icon={Radio}
        />
      </Grid>
      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="stretch">
        <Card padding={6}>
          <VStack gap={5}>
            <HStack gap={3} vAlign="center">
              <Icon icon={ChartNoAxesColumnIncreasing} color="accent" />
              <Heading level={2}>Most played</Heading>
            </HStack>
            {stats.mostPlayed.length
              ? stats.mostPlayed.map((station) => (
                <ProgressBar
                  key={`${station.stationId}-${station.stationName}`}
                  label={station.stationName}
                  value={station.plays}
                  max={maxPlays}
                  hasValueLabel
                  formatValueLabel={(value) => `${value} plays`}
                  variant="accent"
                />
              ))
              : (
                <EmptyState
                  isCompact
                  title="Nothing on the chart yet"
                  description="Play a station to start the chart."
                />
              )}
          </VStack>
        </Card>
        <Card padding={0}>
          <VStack gap={4} padding={6}>
            <HStack gap={3} vAlign="center">
              <StatusDot variant="accent" label="History" />
              <Heading level={2}>Recent signal</Heading>
            </HStack>
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
                        <Text
                          type="supporting"
                          color="secondary"
                          hasTabularNumbers
                        >
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
                  title="No listening sessions yet"
                  description="Your recent stations will appear here."
                />
              )}
          </VStack>
        </Card>
      </Grid>
    </PageFrame>
  );
}

function StatCard({ label, value, icon }: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <Card padding={6} variant="muted">
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Icon icon={icon} color="accent" />
          <Text type="label" color="secondary">{label}</Text>
        </HStack>
        <Heading level={2} type="display-2" hasCapsize>{value}</Heading>
      </VStack>
    </Card>
  );
}
