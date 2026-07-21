import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { VStack } from "@astryxdesign/core/VStack";
import { Radio } from "lucide-react";
import type { ReactNode } from "react";
import type { DiscoveryStation, Station } from "./types.ts";

export type Notify = (message: string, kind?: "info" | "error") => void;

export function PageFrame({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Layout
      height="auto"
      header={
        <LayoutHeader hasDivider padding={6}>
          <VStack gap={2}>
            <Text type="label" color="accent">
              {eyebrow}
            </Text>
            <Heading level={1} type="display-2" textWrap="balance">
              {title}
            </Heading>
            <Text color="secondary" textWrap="balance">
              {description}
            </Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>{children}</VStack>
        </LayoutContent>
      }
    />
  );
}

export function ReceiverLoading({ connected }: { connected: boolean }) {
  return (
    <Card padding={8} minHeight={320}>
      <VStack gap={5} hAlign="center" vAlign="center" minHeight={260}>
        <Icon icon={Radio} color="accent" size="lg" />
        <Heading level={2}>Connecting to Radio Deck</Heading>
        <Text color="secondary">
          {connected
            ? "Synchronising receiver state…"
            : "Opening receiver link…"}
        </Text>
        <ProgressBar
          label="Connecting"
          isLabelHidden
          isIndeterminate
          variant="accent"
        />
      </VStack>
    </Card>
  );
}

export function StationThumbnail({ station }: {
  station: Pick<Station | DiscoveryStation, "name" | "favicon">;
}) {
  return (
    <Thumbnail
      src={station.favicon || undefined}
      alt={station.favicon ? `${station.name} artwork` : undefined}
      label={station.name.slice(0, 2).toUpperCase()}
    />
  );
}

export function EmptyPanel({ title, description }: {
  title: string;
  description: string;
}) {
  return (
    <Card padding={8}>
      <EmptyState
        icon={<Icon icon={Radio} color="accent" size="lg" />}
        title={title}
        description={description}
      />
    </Card>
  );
}

export function stationMetadata(
  station: Pick<
    Station | DiscoveryStation,
    "country" | "codec" | "bitrate" | "tags"
  >,
) {
  return [
    station.country,
    station.codec,
    station.bitrate ? `${station.bitrate} kbps` : null,
  ].filter(Boolean).join(" · ") || station.tags.slice(0, 3).join(" · ") ||
    "Internet stream";
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
