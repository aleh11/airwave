import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { List } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Play,
  RadioTower,
  Save,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { createStation, discoverStations } from "../api.ts";
import type { DiscoveryStation, Station } from "../types.ts";
import {
  errorMessage,
  type Notify,
  PageFrame,
  stationMetadata,
  StationThumbnail,
} from "../ui.tsx";

type SearchScope = "station" | "genre" | "country";

const scopeOptions = [
  { value: "station", label: "Station name" },
  { value: "genre", label: "Genre" },
  { value: "country", label: "Country code" },
];

const suggestions: Array<{ label: string; value: string; scope: SearchScope }> =
  [
    { label: "Jazz", value: "jazz", scope: "genre" },
    { label: "News", value: "news", scope: "genre" },
    { label: "Ambient", value: "ambient", scope: "genre" },
    { label: "Classical", value: "classical", scope: "genre" },
    { label: "South Africa", value: "ZA", scope: "country" },
  ];

export function DiscoverView({ savedStations, onSaved, onPlay, notify }: {
  savedStations: Station[];
  onSaved: () => Promise<void>;
  onPlay: (station: Station) => void;
  notify: Notify;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("station");
  const [results, setResults] = useState<DiscoveryStation[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const savedUrls = new Set(savedStations.map((station) => station.url));

  const runSearch = async (term: string, nextScope: SearchScope) => {
    if (!term.trim()) {
      notify("Enter something to search for.", "error");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    try {
      setResults(
        await discoverStations({
          name: nextScope === "station" ? term : "",
          tag: nextScope === "genre" ? term : "",
          country: nextScope === "country" ? term : "",
        }),
      );
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSearching(false);
    }
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    runSearch(query, scope);
  };

  const searchSuggestion = (value: string, nextScope: SearchScope) => {
    setQuery(value);
    setScope(nextScope);
    runSearch(value, nextScope);
  };

  const save = async (station: DiscoveryStation, play: boolean) => {
    const existing = savedStations.find((saved) => saved.url === station.url);
    if (existing) {
      if (play) onPlay(existing);
      else notify(`${existing.name} is already in your presets.`);
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
      eyebrow="Open radio directory"
      title="Discover"
      description="Find a station by name, genre, or country and save it as a preset."
    >
      <Section variant="muted" padding={5}>
        <form onSubmit={search}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="end" wrap="wrap">
              <TextInput
                label="Search stations"
                value={query}
                placeholder={scope === "station"
                  ? "Try NTS, KEXP, or Radio Paradise"
                  : scope === "genre"
                  ? "Try jazz, ambient, or news"
                  : "Try ZA, GB, or JP"}
                startIcon={<Icon icon={Search} size="sm" />}
                hasClear
                width="100%"
                onChange={setQuery}
              />
              <Selector
                label="Search by"
                value={scope}
                options={scopeOptions}
                startIcon={<Icon icon={SlidersHorizontal} size="sm" />}
                onChange={(value) => setScope(value as SearchScope)}
              />
              <Button
                type="submit"
                label={searching ? "Searching…" : "Search"}
                icon={<Icon icon={Search} />}
                isLoading={searching}
              />
            </HStack>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="supporting" color="secondary">Try</Text>
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.label}
                  label={suggestion.label}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    searchSuggestion(suggestion.value, suggestion.scope)}
                />
              ))}
            </HStack>
          </VStack>
        </form>
      </Section>
      {searching ? <DiscoverySkeleton /> : results.length
        ? (
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center">
              <Heading level={2}>Stations in range</Heading>
              <Badge label={results.length} variant="neutral" />
            </HStack>
            <Section padding={0}>
              <List hasDividers density="spacious">
                {results.map((station) => {
                  const saved = savedUrls.has(station.url);
                  const busy = savingUrl === station.url;
                  return (
                    <Item
                      key={station.externalId || station.url}
                      as="li"
                      align="start"
                      density="spacious"
                      startContent={<StationThumbnail station={station} />}
                      label={station.name}
                      description={
                        <VStack gap={1}>
                          <Text type="supporting" color="secondary">
                            {stationMetadata(station)}
                          </Text>
                          {station.tags.length > 0 && (
                            <Text
                              type="supporting"
                              color="secondary"
                              maxLines={1}
                            >
                              {station.tags.slice(0, 5).join(" · ")}
                            </Text>
                          )}
                        </VStack>
                      }
                      endContent={
                        <HStack gap={1}>
                          <IconButton
                            label={`Play ${station.name}`}
                            variant="secondary"
                            size="sm"
                            icon={<Icon icon={Play} size="sm" />}
                            isDisabled={busy}
                            onClick={() => save(station, true)}
                          />
                          <IconButton
                            label={saved
                              ? `${station.name} is saved`
                              : `Save ${station.name}`}
                            variant={saved ? "secondary" : "primary"}
                            size="sm"
                            icon={<Icon icon={Save} size="sm" />}
                            isDisabled={saved}
                            isLoading={busy}
                            onClick={() => save(station, false)}
                          />
                        </HStack>
                      }
                    />
                  );
                })}
              </List>
            </Section>
          </VStack>
        )
        : (
          <Section padding={8}>
            <EmptyState
              icon={<Icon icon={RadioTower} color="accent" size="lg" />}
              title={hasSearched ? "No stations found" : "The dial is open"}
              description={hasSearched
                ? "Try a broader term or search by a different field."
                : "Search above or start with one of the suggestions."}
            />
          </Section>
        )}
    </PageFrame>
  );
}

function DiscoverySkeleton() {
  return (
    <Section padding={5}>
      <VStack gap={4}>
        {[0, 1, 2, 3, 4].map((index) => (
          <HStack gap={4} vAlign="center" key={index}>
            <Skeleton width={48} height={48} radius={2} index={index} />
            <VStack gap={2} width="100%">
              <Skeleton width="55%" height={16} index={index} />
              <Skeleton width="35%" height={12} index={index} />
            </VStack>
          </HStack>
        ))}
      </VStack>
    </Section>
  );
}
