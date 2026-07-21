import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import {
  DateTimeInput,
  type ISODateTimeString,
} from "@astryxdesign/core/DateTimeInput";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { AlarmClock, Moon, Timer } from "lucide-react";
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
      eyebrow="Automatic controls"
      title="Set and forget"
      description="Let the receiver wind down at night or bring a station up at a chosen time."
    >
      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="stretch">
        <Card padding={6} variant="muted">
          <VStack gap={6}>
            <HStack hAlign="between" vAlign="start" gap={4}>
              <VStack gap={2}>
                <Text type="label" color="accent">Sleep timer</Text>
                <Heading level={2}>Fade to quiet</Heading>
              </VStack>
              <Icon icon={Moon} color="accent" size="lg" />
            </HStack>
            <Text color="secondary">
              Playback stops when the timer ends, whether sound is coming from
              this browser or the Pi.
            </Text>
            <HStack gap={2} wrap="wrap">
              {[15, 30, 60].map((minutes) => (
                <Button
                  key={minutes}
                  label={`${minutes} minutes`}
                  variant="secondary"
                  icon={<Icon icon={Timer} size="sm" />}
                  onClick={() => {
                    send({ type: "setSleepTimer", minutes });
                    notify(`${minutes}-minute sleep timer set.`);
                  }}
                />
              ))}
            </HStack>
            {state.sleepTimerEndsAt && (
              <Banner
                status="info"
                title="Sleep timer active"
                description={`Playback stops at ${
                  new Date(state.sleepTimerEndsAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
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
            )}
          </VStack>
        </Card>
        <Card padding={6}>
          <form onSubmit={setAlarm}>
            <VStack gap={5}>
              <HStack hAlign="between" vAlign="start" gap={4}>
                <VStack gap={2}>
                  <Text type="label" color="accent">Radio alarm</Text>
                  <Heading level={2}>Wake the dial</Heading>
                </VStack>
                <Icon icon={AlarmClock} color="accent" size="lg" />
              </HStack>
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
                label="Set alarm"
                icon={<Icon icon={AlarmClock} />}
                isDisabled={!stations.length}
              />
              {state.alarm && (
                <Banner
                  status="success"
                  title="Radio alarm set"
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
            </VStack>
          </form>
        </Card>
      </Grid>
    </PageFrame>
  );
}

function toLocalDateTime(date: Date): ISODateTimeString {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(
    0,
    16,
  ) as ISODateTimeString;
}
