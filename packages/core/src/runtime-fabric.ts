import {
  desiredScheduledState,
  type LocalClock,
  type ScheduleClosePolicy,
  type ScheduledServiceState,
  type ScheduleWindow,
} from "./service-schedule.js";

export type RuntimeControlPlane =
  | { mode: "lite" }
  | { mode: "full-local"; serverUrl?: string }
  | { mode: "remote"; serverUrl: string };

export type RuntimeTargetKind =
  | "host"
  | "docker"
  | "openhands-local"
  | "openhands-agent-server"
  | "prime-agent"
  | "hermes"
  | "paperclip"
  | "grok-build"
  | "custom-cli"
  | "custom-http"
  | "mcp";

export interface RuntimeTargetDefinition {
  id: string;
  kind: RuntimeTargetKind;
  name: string;
  enabled: boolean;
  windows: ScheduleWindow[];
  closePolicy?: ScheduleClosePolicy;
  /** Adapter-specific non-secret configuration. Secrets stay in the secret store. */
  config?: Record<string, unknown>;
}

export interface RuntimeFabric {
  controlPlane: RuntimeControlPlane;
  targets: RuntimeTargetDefinition[];
}

export function createRuntimeFabric(
  controlPlane: RuntimeControlPlane,
  targets: readonly RuntimeTargetDefinition[],
): RuntimeFabric {
  return {
    controlPlane: { ...controlPlane },
    targets: targets.map(cloneRuntimeTarget),
  };
}

export function enabledRuntimeTargets(fabric: RuntimeFabric): RuntimeTargetDefinition[] {
  return fabric.targets.filter((target) => target.enabled);
}

export function desiredRuntimeTargetState(
  target: RuntimeTargetDefinition,
  clock: LocalClock,
  activeInteractiveSessions = 0,
): ScheduledServiceState {
  return desiredScheduledState(
    {
      enabled: target.enabled,
      windows: target.windows,
      closePolicy: target.closePolicy,
    },
    clock,
    activeInteractiveSessions,
  );
}

export function cloneRuntimeTarget(target: RuntimeTargetDefinition): RuntimeTargetDefinition {
  return {
    ...target,
    windows: target.windows.map((window) => ({
      ...window,
      ...(window.days ? { days: [...window.days] } : {}),
    })),
    ...(target.config ? { config: { ...target.config } } : {}),
  };
}
