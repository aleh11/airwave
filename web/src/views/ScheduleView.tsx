import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import {
  DateTimeInput,
  type ISODateTimeString,
} from "@astryxdesign/core/DateTimeInput";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { AlarmClock, Moon, TimerReset } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRadioSocket } from "../hooks/useRadioSocket.ts";
import type { RadioState, Station } from "../types.ts";
import type { Notify } from "../ui.tsx";
import { PageFrame } from "../ui.tsx";

export function ScheduleView({ state, stations, send, notify }: {
  state: RadioState;
  stations: Station[];
  send: ReturnType<typeof useRadioSocket>["send"];
  notify: Notify;
}) {
  const [alarmAt, setAlarmAt] = useState<ISODateTimeString | undefined>(
    toLocalDateTime(new Date(Date.now() + 3_600_000)),
  );
  const [stationId, setStationId] = useState(
    String(state.station?.id ?? stations[0]?.id ?? ""),
  );

  const setAlarm = (event: FormEvent) => {
    event.preventDefault();
    if (!alarmAt || !stationId) {
      notify("Choose a future time and station.", "error");
      return;
    }
    const at = new Date(alarmAt);
    if (at.getTime() <= Date.now()) {
      notify("Alarm time must be in the future.", "error");
      return;
    }
    send({
      type: "setAlarm",
      alarm: { at: at.toISOString(), stationId: Number(stationId) },
    });
    notify("Alarm set.");
  };

  return (
    <PageFrame
      eyebrow="Automatic playback"
      title="Schedule"
      description="Set a sleep timer or wake up to one of your presets."
    >
      <Grid columns={{ minWidth: 420, max: 2 }} gap={5} align="stretch">
        <Section variant="muted" padding={6}>
          <VStack gap={5}>
            <HStack hAlign="between" vAlign="start" gap={4}>
              <VStack gap={2}>
                <Text type="label" color="accent">Sleep timer</Text>
                <Heading level={2}>Stop after</Heading>
              </VStack>
              <Icon icon={Moon} color="accent" size="lg" />
            </HStack>
            <Text color="secondary">
              Playback stops on both Browser and Pi when the timer ends.
            </Text>
            <HStack gap={2} wrap="wrap">
              {[15, 30, 60, 90].map((minutes) => (
                <Button
                  key={minutes}
                  label={`${minutes} min`}
                  variant="secondary"
                  icon={<Icon icon={TimerReset} size="sm" />}
                  onClick={() => {
                    send({ type: "setSleepTimer", minutes });
                    notify(`${minutes}-minute sleep timer set.`);
                  }}
                />
              ))}
            </HStack>
            {state.sleepTimerEndsAt
              ? (
                <Banner
                  status="info"
                  title="Timer running"
                  description={`Playback stops at ${
                    formatTime(state.sleepTimerEndsAt)
                  }.`}
                  endContent={
                    <Button
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      onClick={() => send({ type: "clearSleepTimer" })}
                    />
                  }
                />
              )
              : (
                <HStack gap={2} vAlign="center">
                  <StatusDot
                    variant="neutral"
                    label="No sleep timer active"
                  />
                  <Text type="supporting" color="secondary">
                    No timer running
                  </Text>
                </HStack>
              )}
          </VStack>
        </Section>
        <Section variant="muted" padding={6}>
          <form onSubmit={setAlarm}>
            <VStack gap={5}>
              <HStack hAlign="between" vAlign="start" gap={4}>
                <VStack gap={2}>
                  <Text type="label" color="accent">Radio alarm</Text>
                  <Heading level={2}>Wake up to</Heading>
                </VStack>
                <Icon icon={AlarmClock} color="accent" size="lg" />
              </HStack>
              {state.alarm && (
                <Banner
                  status="success"
                  title="Alarm ready"
                  description={new Date(state.alarm.at).toLocaleString()}
                  endContent={
                    <Button
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      onClick={() => send({ type: "clearAlarm" })}
                    />
                  }
                />
              )}
              <DateTimeInput
                label="Start time"
                value={alarmAt}
                min={toLocalDateTime(new Date())}
                onChange={setAlarmAt}
                hasClear
                hourFormat="24h"
                timeIncrement={5}
              />
              <Selector
                label="Station"
                value={stationId}
                placeholder="Choose a preset"
                options={stations.map((station) => ({
                  value: String(station.id),
                  label: station.name,
                }))}
                onChange={setStationId}
              />
              <Button
                type="submit"
                label={state.alarm ? "Update alarm" : "Set alarm"}
                icon={<Icon icon={AlarmClock} />}
                isDisabled={!stations.length}
              />
            </VStack>
          </form>
        </Section>
      </Grid>
    </PageFrame>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateTime(date: Date): ISODateTimeString {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(
    0,
    16,
  ) as ISODateTimeString;
}
