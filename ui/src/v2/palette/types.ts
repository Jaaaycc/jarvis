/**
 * Shape returned by `GET /api/palette/search`. Mirrors the daemon-side
 * `PaletteResult` in `src/daemon/api-routes.ts`. Designed to map directly
 * onto `<InlineCard>` props when the user picks an object result.
 */
export type PaletteResultType =
  | "workflow"
  | "memory"
  | "tool"
  | "agent"
  | "authority"
  | "log";

export type PaletteResult = {
  type: PaletteResultType;
  id: string;
  ref: string;
  title: string;
  summary?: string;
  meta?: string;
  status?: { label: string; tone: "ok" | "warn" | "neutral" | "accent" };
};

/**
 * Room navigation entries shown in the palette when the query is empty
 * or matches a Room name.
 */
export type PaletteNavEntry = {
  key:
    | "tools"
    | "logs"
    | "agents"
    | "workflows"
    | "memory"
    | "authority"
    | "calendar"
    | "goals"
    | "tasks"
    | "content"
    | "workspaces"
    | "settings"
    | "analytics"
    | "imagegen"
    | "emailmktg"
    | "meta"
    | "marketing"
    | "videogen"
    | "n8n";
  label: string;
  hint: string;
};

export const ROOM_NAV_ENTRIES: PaletteNavEntry[] = [
  // ── Marketing & Business ──────────────────────────────────────
  { key: "marketing",  label: "Marketing",       hint: "Daily posts, content, Facebook publishing" },
  { key: "videogen",   label: "Video Studio",    hint: "AI-generated reels for Built2Win" },
  { key: "n8n",        label: "n8n Workflows",   hint: "Automation workflows & execution monitor" },
  { key: "meta",       label: "Meta Business",   hint: "Facebook/Instagram ads + commerce" },
  { key: "analytics",  label: "Analytics",       hint: "Search Console + Google Analytics" },
  { key: "emailmktg",  label: "Email Marketing", hint: "Campaigns, leads, automated outreach" },
  // ── Content & Planning ────────────────────────────────────────
  { key: "content",    label: "Content",         hint: "Drafts, scheduled, published" },
  { key: "calendar",   label: "Calendar",        hint: "Today's meetings + commitments" },
  { key: "goals",      label: "Goals",           hint: "OKRs + scoring" },
  { key: "tasks",      label: "Tasks",           hint: "Kanban + priorities" },
  // ── System ────────────────────────────────────────────────────
  { key: "workflows",  label: "Workflows",       hint: "Agent automation flows" },
  { key: "agents",     label: "Agents",          hint: "Specialist agent roster" },
  { key: "memory",     label: "Memory",          hint: "What Jarvis knows" },
  { key: "settings",   label: "Settings",        hint: "Providers, voice, integrations" },
  // ── Advanced ─────────────────────────────────────────────────
  { key: "imagegen",   label: "Image Creator",   hint: "AI image generation" },
  { key: "tools",      label: "Tools",           hint: "Capability catalog" },
  { key: "authority",  label: "Authority",       hint: "Scopes and approvals" },
  { key: "logs",       label: "Logs",            hint: "Event stream" },
  { key: "workspaces", label: "Workspaces",      hint: "Dev projects" },
];

/**
 * Map a palette Room nav key to the `ObjectType` used by `<InlineCard>`.
 */
export function navKeyToObjectType(key: PaletteNavEntry["key"]): import("../thread/types").ObjectType {
  switch (key) {
    case "workflows":  return "workflow";
    case "memory":     return "memory";
    case "tools":      return "tool";
    case "agents":     return "agent";
    case "authority":  return "authority";
    case "logs":       return "log";
    default:           return key as import("../thread/types").ObjectType;
  }
}
