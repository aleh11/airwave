import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type { FormEvent } from "react";
import type { StationDraft } from "../api.ts";
import type { Station } from "../types.ts";
import { errorMessage, type Notify } from "../ui.tsx";

export function StationEditor({ station, onClose, onSave, notify }: {
  station?: Station;
  onClose: () => void;
  onSave: (draft: StationDraft, existing?: Station) => Promise<Station>;
  notify: Notify;
}) {
  const [draft, setDraft] = useState({
    name: station?.name ?? "",
    url: station?.url ?? "",
    favicon: station?.favicon ?? "",
    tags: station?.tags.join(", ") ?? "",
  });
  const [saving, setSaving] = useState(false);
  const formId = "station-editor-form";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.url.trim()) {
      notify("Station name and stream URL are required.", "error");
      return;
    }
    try {
      new URL(draft.url);
    } catch {
      notify("Enter a valid stream URL.", "error");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: draft.name.trim(),
        url: draft.url.trim(),
        favicon: draft.favicon.trim() || null,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        favorite: station?.favorite ?? true,
      }, station);
    } catch (error) {
      notify(errorMessage(error), "error");
      setSaving(false);
    }
  };

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      purpose="form"
      width={560}
      padding={0}
    >
      <Layout
        height="auto"
        header={
          <LayoutHeader padding={0}>
            <DialogHeader
              title={station ? "Edit station" : "Add station"}
              subtitle="Manual preset"
              hasDivider
              onOpenChange={(open) => !open && onClose()}
            />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={6}>
            <form id={formId} onSubmit={submit}>
              <VStack gap={5}>
                <TextInput
                  label="Station name"
                  value={draft.name}
                  placeholder="My favorite station"
                  isRequired
                  onChange={(name) => setDraft({ ...draft, name })}
                />
                <TextInput
                  label="Stream URL"
                  value={draft.url}
                  placeholder="https://example.com/live.mp3"
                  isRequired
                  onChange={(url) => setDraft({ ...draft, url })}
                />
                <TextInput
                  label="Artwork URL"
                  value={draft.favicon}
                  placeholder="https://example.com/logo.jpg"
                  isOptional
                  onChange={(favicon) => setDraft({ ...draft, favicon })}
                />
                <TextInput
                  label="Tags"
                  value={draft.tags}
                  placeholder="jazz, local, talk"
                  isOptional
                  onChange={(tags) => setDraft({ ...draft, tags })}
                />
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter padding={4} hasDivider>
            <HStack gap={3} hAlign="end">
              <Button label="Cancel" variant="ghost" onClick={onClose} />
              <Button
                label="Save station"
                type="submit"
                form={formId}
                isLoading={saving}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
