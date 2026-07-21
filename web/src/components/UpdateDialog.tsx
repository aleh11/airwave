import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { UpdateState } from "../types.ts";

export type UpdateDialogPhase = "confirm" | UpdateState;

export interface UpdateDialogModel {
  currentVersion: string;
  latestVersion: string;
  phase: UpdateDialogPhase;
  message: string | null;
}

interface UpdateDialogProps {
  model: UpdateDialogModel | null;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}

const updateSteps = [
  { phase: "requested", label: "Prepare update" },
  { phase: "downloading", label: "Download and verify" },
  { phase: "installing", label: "Install Airwave" },
  { phase: "restarting", label: "Restart and reconnect" },
] as const;

type ProgressPhase = (typeof updateSteps)[number]["phase"];

const progressMessages: Record<ProgressPhase, string> = {
  requested: "Preparing the update on your Airwave device…",
  downloading: "Downloading and verifying the new release…",
  installing: "Installing the new Airwave service…",
  restarting: "Restarting Airwave and reconnecting…",
};

export function UpdateDialog({
  model,
  onClose,
  onConfirm,
  onRetry,
}: UpdateDialogProps) {
  if (!model) return null;

  const canClose = model.phase === "confirm" || model.phase === "failed" ||
    model.phase === "idle" || model.phase === "unavailable";

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && canClose && onClose()}
      purpose={canClose ? "info" : "required"}
    >
      {model.phase === "confirm"
        ? (
          <ConfirmationContent
            model={model}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        )
        : model.phase === "failed" || model.phase === "unavailable" ||
            model.phase === "idle"
        ? (
          <FailureContent
            model={model}
            onClose={onClose}
            onRetry={onRetry}
          />
        )
        : <ProgressContent model={model} />}
    </Dialog>
  );
}

function ConfirmationContent({ model, onClose, onConfirm }: {
  model: UpdateDialogModel;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Layout
      height="auto"
      header={
        <DialogHeader
          title={`Update to Airwave v${model.latestVersion}?`}
          subtitle={`Currently running v${model.currentVersion}`}
        />
      }
      content={
        <LayoutContent isScrollable={false}>
          <VStack gap={2}>
            <Text type="body">
              Airwave will briefly stop playback while it installs the update
              and restarts.
            </Text>
            <Text type="supporting" color="secondary">
              Your stations, schedule, and settings will stay in place.
            </Text>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end">
            <Button label="Not now" variant="secondary" clickAction={onClose} />
            <Button
              label="Update Airwave"
              variant="primary"
              clickAction={onConfirm}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

function ProgressContent({ model }: { model: UpdateDialogModel }) {
  const progressPhase = isProgressPhase(model.phase) ? model.phase : null;
  const activeIndex = progressPhase
    ? updateSteps.findIndex((step) => step.phase === progressPhase)
    : updateSteps.length;
  const isComplete = model.phase === "complete";
  const message = progressPhase
    ? progressMessages[progressPhase]
    : "Airwave is updated. Reconnecting…";

  return (
    <Layout
      height="auto"
      header={
        <DialogHeader
          title={isComplete ? "Update complete" : "Updating Airwave"}
          subtitle={`v${model.currentVersion} → v${model.latestVersion}`}
          hasDivider={false}
        />
      }
      content={
        <LayoutContent isScrollable={false}>
          <VStack gap={6}>
            {isComplete
              ? (
                <HStack gap={3} vAlign="center">
                  <StatusDot
                    variant="success"
                    label="Airwave is updated and reconnecting"
                  />
                  <Text type="body" weight="semibold">
                    Airwave is updated. Reconnecting…
                  </Text>
                </HStack>
              )
              : (
                <Spinner
                  size="lg"
                  label={
                    <Text type="body" weight="semibold">
                      {message}
                    </Text>
                  }
                  aria-label={message}
                />
              )}
            <VStack gap={3}>
              {updateSteps.map((step, index) => {
                const completed = isComplete || index < activeIndex;
                const active = index === activeIndex;
                return (
                  <HStack key={step.phase} gap={3} vAlign="center">
                    <StatusDot
                      variant={completed
                        ? "success"
                        : active
                        ? "accent"
                        : "neutral"}
                      label={completed
                        ? `${step.label} complete`
                        : active
                        ? `${step.label} in progress`
                        : `${step.label} waiting`}
                    />
                    <Text
                      type="body"
                      weight={active ? "semibold" : "normal"}
                      color={!completed && !active ? "secondary" : "primary"}
                    >
                      {step.label}
                    </Text>
                  </HStack>
                );
              })}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

function FailureContent({ model, onClose, onRetry }: {
  model: UpdateDialogModel;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Layout
      height="auto"
      header={
        <DialogHeader
          title="Update stopped"
          subtitle={`Airwave v${model.latestVersion} was not installed`}
        />
      }
      content={
        <LayoutContent isScrollable={false}>
          <VStack gap={2}>
            <HStack gap={3} vAlign="center">
              <StatusDot variant="error" label="Update failed" />
              <Text type="body" weight="semibold">Update failed</Text>
            </HStack>
            <Text type="body">
              {model.message || "The update could not be installed."}
            </Text>
            <Text type="supporting" color="secondary">
              Airwave is still running the previous version.
            </Text>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end">
            <Button label="Close" variant="secondary" clickAction={onClose} />
            <Button label="Try again" variant="primary" clickAction={onRetry} />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

function isProgressPhase(phase: UpdateDialogPhase): phase is ProgressPhase {
  return updateSteps.some((step) => step.phase === phase);
}
