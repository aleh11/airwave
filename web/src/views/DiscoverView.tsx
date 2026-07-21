import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Play, Save, Search } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { createStation, discoverStations } from "../api.ts";
import type { DiscoveryStation, Station } from "../types.ts";
import {
  EmptyPanel,
  errorMessage,
  type Notify,
  PageFrame,
  stationMetadata,
  StationThumbnail,
} from "../ui.tsx";

export function DiscoverView({ savedStations, onSaved, onPlay, notify }: {
  savedStations: Station[];
  onSaved: () => Promise<void>;
  onPlay: (station: Station) => void;
  notify: Notify;
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
    <PageFrame
      eyebrow="Open directory"
      title="Find a new frequency"
      description="Search thousands of community-maintained streams by name, sound, or country."
    >
      <Card padding={5}>
        <form onSubmit={search}>
          <Grid columns={{ minWidth: 180, max: 4 }} gap={4} align="end">
            <TextInput
              label="Station name"
              value={query.name}
              placeholder="e.g. NTS"
              hasClear
              onChange={(name) => setQuery({ ...query, name })}
            />
            <TextInput
              label="Genre or tag"
              value={query.tag}
              placeholder="e.g. jazz"
              hasClear
              onChange={(tag) => setQuery({ ...query, tag })}
            />
            <TextInput
              label="Country code"
              value={query.country}
              placeholder="ZA"
              hasClear
              onChange={(country) => setQuery({ ...query, country })}
            />
            <Button
              type="submit"
              label={searching ? "Tuning…" : "Search"}
              icon={<Icon icon={Search} />}
              isLoading={searching}
            />
          </Grid>
        </form>
      </Card>
      {searching
        ? (
          <Grid columns={{ minWidth: 260, max: 3 }} gap={4}>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Card padding={5} key={index}>
                <HStack gap={4} vAlign="center">
                  <Skeleton width={56} height={56} radius={2} index={index} />
                  <VStack gap={2} width="100%">
                    <Skeleton width="70%" height={16} index={index} />
                    <Skeleton width="45%" height={12} index={index} />
                  </VStack>
                </HStack>
              </Card>
            ))}
          </Grid>
        )
        : results.length
        ? (
          <Grid columns={{ minWidth: 280, max: 3 }} gap={4} align="stretch">
            {results.map((station) => {
              const saved = savedUrls.has(station.url);
              const busy = savingUrl === station.url;
              return (
                <Card padding={0} key={station.externalId || station.url}>
                  <Layout
                    height="auto"
                    content={
                      <LayoutContent padding={5}>
                        <Item
                          startContent={<StationThumbnail station={station} />}
                          label={station.name}
                          description={`${stationMetadata(station)}\n${
                            station.tags.slice(0, 5).join(" · ")
                          }`}
                          labelLines={1}
                          descriptionLines={2}
                        />
                      </LayoutContent>
                    }
                    footer={
                      <LayoutFooter hasDivider padding={4}>
                        <HStack gap={2} hAlign="end" wrap="wrap">
                          <Button
                            label="Play now"
                            variant="secondary"
                            size="sm"
                            icon={<Icon icon={Play} size="sm" />}
                            isDisabled={busy}
                            onClick={() => save(station, true)}
                          />
                          <Button
                            label={saved ? "Saved" : "Save preset"}
                            size="sm"
                            icon={<Icon icon={Save} size="sm" />}
                            isDisabled={saved}
                            isLoading={busy}
                            onClick={() => save(station, false)}
                          />
                        </HStack>
                      </LayoutFooter>
                    }
                  />
                </Card>
              );
            })}
          </Grid>
        )
        : (
          <EmptyPanel
            title="The dial is open"
            description="Search to bring stations into range."
          />
        )}
    </PageFrame>
  );
}
