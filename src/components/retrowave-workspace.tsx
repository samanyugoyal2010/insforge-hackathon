"use client";

import { AnimatedAIChat } from "@/components/ui/animated-ai-chat";
import {
  ProjectToolDock,
  type ProjectToolId,
} from "@/components/project-tool-dock";
import { WorkspaceTemplatesPage } from "@/components/workspace-templates-page";
import Dock from "@/components/ui/dock";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import {
  createProjectId,
  clearWorkspaceStorage,
  readWorkspace,
  writeWorkspace,
  type ChatMsg,
  type MockProject,
  type MockWorkspaceState,
} from "@/lib/mock-workspace";
import { CadShellPanel } from "@/components/cad-shell-panel";
import { BomPanel } from "@/components/bom-panel";
import { CollabPanel } from "@/components/collab-panel";
import { FirmwarePanel } from "@/components/firmware-panel";
import { OrderPanel } from "@/components/order-panel";
import { ChatFirstReplySnake } from "@/components/chat-first-reply-snake";
import { ChatSuggestionsPanel } from "@/components/chat-suggestions-panel";
import { ChatMarkdown } from "@/components/chat-markdown";
import { PCBViewer } from "@/components/pcb/pcb-viewer";
import { ArPreviewPanel } from "@/components/ar-preview-panel";
import { persistBomForProject, useBom } from "@/hooks/use-bom";
import { useCadShell } from "@/hooks/use-cad-shell";
import { useChatSplitWidth } from "@/hooks/use-chat-split";
import {
  generateDemoBomDocument,
} from "@/lib/demo-bom";
import {
  clearCircuitronForProject,
  loadCircuitronForProject,
  persistCircuitronForProject,
} from "@/lib/circuitron-persist";
import { setPcbFlushHandler } from "@/lib/pcb-persist-bridge";
import { restoreStripeCheckoutLocalSnapshotIfNeeded } from "@/lib/stripe-checkout-local-snapshot";
import { downloadJsonFile, sanitizeExportSlug } from "@/lib/download-json";
import {
  clearLandingPromptDraft,
  peekLandingPromptDraft,
} from "@/lib/landing-prompt-draft";
import {
  PCB_ENGINE_STORAGE_KEY,
  type PcbEngine,
  parsePcbEngine,
} from "@/lib/pcb-engine";
import {
  CAD_ENGINE_STORAGE_KEY,
  type CadEngine,
  parseCadEngine,
} from "@/lib/cad-engine";
import {
  getSession,
  hydrateAuthSession,
  subscribeAuthSession,
} from "@/lib/supabase-auth";
import {
  ORDERS_SESSION_PREFIX,
  pullWorkspaceFromCloud,
  pushLocalWorkspaceIfCloudEmpty,
  pushWorkspaceToCloud,
} from "@/lib/workspace-sync";
import { cn } from "@/lib/utils";
import {
  applyLegacyShellPatch,
  documentToSyntheticShell,
} from "@/lib/cad-document";
import { dualStorageGet, dualStorageRemove, dualStorageSet } from "@/lib/dual-storage";
import type { ShellParams } from "@/lib/cad-shell";
// PCB board import removed - now handled by Circuitron
import {
  normalizeBomLine,
  type AgentStateSnapshot,
} from "@/lib/agent/contracts";
import { dedupeRepeatedAssistantReply } from "@/lib/agent/sanitize-reply";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ClipboardList,
  CircuitBoard,
  Cpu,
  PencilLine,
  Search,
  SlidersHorizontal,
  PenTool,
  FolderKanban,
  Glasses,
  Home,
  LayoutTemplate,
  Plus,
  Settings,
  ShoppingBag,
  Users2,
  FileCode2,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

function formatRelative(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatProjectTime(ts: number) {
  const d = Date.now() - ts;
  if (d < 86400000) return formatRelative(ts);
  if (d < 86400000 * 7) return `${Math.floor(d / 86400000)}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function normalizeAgentPrompt(raw: string) {
  // PromptInputBox may wrap content as: "[Search: ...]" or "[Think: ...]"
  return raw
    .replace(/^\[(Search|Think):\s*/i, "")
    .replace(/\]$/g, "")
    .trim();
}

function parseFirstNumber(re: RegExp, text: string): number | null {
  const m = re.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return n;
}

type ShellOps = Partial<{
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wallMm: number;
  cornerRadiusMm: number;
  scale: number;
}>;

function parseShellOps(text: string): ShellOps {
  const t = text.toLowerCase();
  const ops: ShellOps = {};

  ops.lengthMm =
    parseFirstNumber(/(?:length|depth)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    ops.lengthMm;
  ops.widthMm =
    parseFirstNumber(/(?:width)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    ops.widthMm;
  ops.heightMm =
    parseFirstNumber(/(?:height)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    parseFirstNumber(/(?:tall)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    ops.heightMm;
  ops.wallMm =
    parseFirstNumber(/(?:wall|thickness)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    ops.wallMm;
  ops.cornerRadiusMm =
    parseFirstNumber(
      /(?:radius|corner)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
      t,
    ) ?? ops.cornerRadiusMm;

  if (/\b(small|compact|portable)\b/.test(t)) ops.scale = 0.85;
  if (/\b(large|bigger|full[-\s]?size)\b/.test(t)) ops.scale = 1.15;

  if (/\b(enclosure|case|shell|housing)\b/.test(t)) {
    if (ops.wallMm == null) ops.wallMm = 2.4;
    if (ops.cornerRadiusMm == null) ops.cornerRadiusMm = 3;
  }

  return ops;
}

type PcbOps = Partial<{
  widthMm: number;
  heightMm: number;
  layerCount: number;
  minTraceMm: number;
  minClearanceMm: number;
  viaDrillMm: number;
  gridMm: number;
  scale: number;
}>;

function parsePcbOps(text: string): PcbOps {
  const t = text.toLowerCase();
  const ops: PcbOps = {};

  ops.widthMm =
    parseFirstNumber(
      /(?:board\s*)?(?:width)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
      t,
    ) ?? ops.widthMm;
  ops.heightMm =
    parseFirstNumber(
      /(?:board\s*)?(?:height)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
      t,
    ) ?? ops.heightMm;
  ops.layerCount =
    parseFirstNumber(/(?:layers?)\s*[:=]?\s*(\d+)/i, t) ?? ops.layerCount;
  ops.minTraceMm =
    parseFirstNumber(
      /(?:min\s*trace|mintrace|trace)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
      t,
    ) ?? ops.minTraceMm;
  ops.minClearanceMm =
    parseFirstNumber(
      /(?:min\s*clearance|minclearance|clearance)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
      t,
    ) ?? ops.minClearanceMm;
  ops.viaDrillMm =
    parseFirstNumber(/(?:via\s*(?:drill|diameter)|via)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ??
    ops.viaDrillMm;
  ops.gridMm =
    parseFirstNumber(/(?:grid)\s*[:=]?\s*(\d+(?:\.\d+)?)/i, t) ?? ops.gridMm;

  if (/\b(small|compact|portable)\b/.test(t)) ops.scale = 0.85;
  if (/\b(large|bigger|full[-\s]?size)\b/.test(t)) ops.scale = 1.15;

  if (/\b(more|increase)\s*layers?\b/.test(t) && ops.layerCount == null) {
    ops.layerCount = 6;
  }

  if (/\b(pcb|board|layout)\b/.test(t)) {
    if (ops.layerCount == null) ops.layerCount = 4;
    if (ops.gridMm == null) ops.gridMm = 0.5;
    if (ops.minTraceMm == null) ops.minTraceMm = 0.2;
    if (ops.minClearanceMm == null) ops.minClearanceMm = 0.2;
  }

  return ops;
}

const ROUTE_BASE = "/dashboard";

const dialogSurface =
  "rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl md:p-6";

type DockTab = "Home" | "Projects" | "Templates" | "Settings";
type AgentToolCall =
  | { tool: "update_cad"; args: Record<string, unknown> }
  | { tool: "update_pcb"; args: Record<string, unknown> }
  | { tool: "append_bom_lines"; args: { lines?: Array<Record<string, unknown>> } }
  | { tool: "replace_bom"; args: { lines?: Array<Record<string, unknown>> } };

export function RetrowaveWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const checkoutUrlParam = searchParams.get("checkout");
  const stripeSessionUrlParam = searchParams.get("session_id");

  const [ws, setWs] = useState<MockWorkspaceState>(() => readWorkspace());
  const [generatingByProject, setGeneratingByProject] = useState<
    Record<string, number>
  >({});

  type ModelId = "auto" | "mini" | "base" | "node0";
  const activeAgentModel: ModelId = "auto";
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("Home");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [pcbEngine, setPcbEngine] = useState<PcbEngine>(() => {
    if (typeof window === "undefined") return "pcbflow";
    try {
      return parsePcbEngine(localStorage.getItem(PCB_ENGINE_STORAGE_KEY));
    } catch {
      return "pcbflow";
    }
  });

  const [cadEngine, setCadEngine] = useState<CadEngine>(() => {
    if (typeof window === "undefined") return "cadam";
    try {
      return parseCadEngine(localStorage.getItem(CAD_ENGINE_STORAGE_KEY));
    } catch {
      return "cadam";
    }
  });

  const setCadEnginePersisted = useCallback((eng: CadEngine) => {
    setCadEngine(eng);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CAD_ENGINE_STORAGE_KEY, eng);
      } catch {}
    }
  }, []);
  const [newName, setNewName] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [homeInject, setHomeInject] = useState({ key: 0, text: "" });
  const [projectTool, setProjectToolInner] = useState<ProjectToolId>("cad");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);

  const [invalidProjectParam, setInvalidProjectParam] = useState<
    string | null
  >(null);

  const [cloudHydrated, setCloudHydrated] = useState(false);

  /**
   * `activeId` is normally driven by `?project=`. Right after creating a board,
   * the URL can lag one frame behind `ws` — users briefly saw the Projects list
   * instead of chat + CAD/PCB. Latch the new id until the query param matches.
   */
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  const CHAT_MIN_PCT = 18;
  const CHAT_MAX_PCT = 52;
  const CHAT_DEFAULT_PCT = 28;

  const {
    containerRef: chatSplitRef,
    chatWidthPct,
    onResizePointerDown,
    isDragging: chatSplitDragging,
    onResizeKeyDown,
  } = useChatSplitWidth({
    defaultPct: CHAT_DEFAULT_PCT,
    minPct: CHAT_MIN_PCT,
    maxPct: CHAT_MAX_PCT,
  });

  const projectToolItems = useMemo(
    () =>
      [
        { id: "cad" as const, label: "CAD", icon: PenTool },
        { id: "pcb" as const, label: "PCB", icon: CircuitBoard },
        { id: "bom" as const, label: "BOM", icon: ClipboardList },
        { id: "code" as const, label: "Code", icon: FileCode2 },
        { id: "ar" as const, label: "AR guide", icon: Glasses },
        { id: "order" as const, label: "Order", icon: ShoppingBag },
      ] as const,
    [],
  );

  const activeId = useMemo(() => {
    const urlId =
      projectParam && ws.projects.some((p) => p.id === projectParam)
        ? projectParam
        : null;
    const pendingOk =
      pendingProjectId &&
      ws.projects.some((p) => p.id === pendingProjectId)
        ? pendingProjectId
        : null;
    // New board from Home while `?project=` still points at another board: URL
    // wins in the old logic and chat/tools stayed on the wrong project.
    if (pendingOk && projectParam !== pendingOk) return pendingOk;
    if (urlId) return urlId;
    if (pendingOk) return pendingOk;
    return null;
  }, [projectParam, ws.projects, pendingProjectId]);

  const activeIdRef = useRef<string | null>(null);
  /** After pre-Stripe localStorage restore, do not pull cloud (would overwrite snapshot). */
  const skipCloudPullAfterStripeLocalRestoreRef = useRef(false);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const setProjectTool = useCallback(
    (id: ProjectToolId) => {
      setProjectToolInner(id);
      if (activeId) {
        try {
          sessionStorage.setItem(`node0-project-tool:${activeId}`, id);
        } catch {
          /* ignore */
        }
      }
    },
    [activeId],
  );

  const activeProject = useMemo(
    () => ws.projects.find((p) => p.id === activeId),
    [ws.projects, activeId],
  );

  const exportDownloadSlug = useMemo(() => {
    if (!activeId) return "draft";
    const name = activeProject?.name?.trim();
    if (name && name.length >= 2) return sanitizeExportSlug(name);
    return sanitizeExportSlug(activeId);
  }, [activeId, activeProject?.name]);

  const { cad: cadShell, setCad: setCadShell } = useCadShell(
    activeId,
    cloudHydrated,
  );
  // PCB state is now managed by Circuitron, no longer need usePcbBoard hook
  const { document: bomDocument, setDocument: setBomDocument } = useBom(
    activeId,
    cloudHydrated,
  );
  const [firmwareCode, setFirmwareCode] = useState("");
  const [cadTechnicalMode, setCadTechnicalMode] = useState(false);
  const [pcbTechnicalMode, setPcbTechnicalMode] = useState(false);
  const [circuitronResults, setCircuitronResults] = useState<any>(null);
  const circuitronResultsRef = useRef<any>(null);
  useEffect(() => {
    circuitronResultsRef.current = circuitronResults;
  }, [circuitronResults]);

  useEffect(() => {
    setPcbFlushHandler(() => {
      const id = activeIdRef.current;
      const cr = circuitronResultsRef.current;
      if (id && cr != null) persistCircuitronForProject(id, cr);
    });
    return () => setPcbFlushHandler(null);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setCadTechnicalMode(false);
      setPcbTechnicalMode(false);
      setCircuitronResults(null);
      setTeamOpen(false);
      return;
    }

    const loadedCr = loadCircuitronForProject(activeId);
    setCircuitronResults(loadedCr ?? null);
    try {
      setFirmwareCode(dualStorageGet(`node0-firmware:${activeId}`) ?? "");
    } catch {
      setFirmwareCode("");
    }

    setCadAgentWarnings([]);

    try {
      const v =
        sessionStorage.getItem(`node0-cad-technical:${activeId}`) ??
        sessionStorage.getItem(`node0-cad-developer:${activeId}`);
      setCadTechnicalMode(v === "1");
      setPcbTechnicalMode(
        sessionStorage.getItem(`node0-pcb-technical:${activeId}`) === "1",
      );

      const toolRaw = sessionStorage.getItem(
        `node0-project-tool:${activeId}`,
      ) as ProjectToolId | null;
      const valid: ProjectToolId[] = [
        "cad",
        "pcb",
        "bom",
        "code",
        "ar",
        "order",
      ];
      if (toolRaw && valid.includes(toolRaw)) {
        setProjectToolInner(toolRaw);
      } else {
        setProjectToolInner("cad");
      }
    } catch {
      setCadTechnicalMode(false);
      setPcbTechnicalMode(false);
      setProjectToolInner("cad");
    }
  }, [activeId, cloudHydrated]);

  useEffect(() => {
    if (!activeId) return;
    try {
      dualStorageSet(`node0-firmware:${activeId}`, firmwareCode);
    } catch {
      /* ignore */
    }
  }, [activeId, firmwareCode]);

  useEffect(() => {
    if (!activeId || !cloudHydrated) return;
    if (circuitronResults == null) return;
    const projectId = activeId;
    const payload = circuitronResults;
    const t = window.setTimeout(() => {
      persistCircuitronForProject(projectId, payload);
    }, 400);
    return () => window.clearTimeout(t);
  }, [activeId, cloudHydrated, circuitronResults]);

  const setCadTechnicalModePersisted = useCallback((next: boolean) => {
    setCadTechnicalMode(next);
    if (!activeId) return;
    try {
      sessionStorage.setItem(
        `node0-cad-technical:${activeId}`,
        next ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [activeId]);

  const setPcbTechnicalModePersisted = useCallback((next: boolean) => {
    setPcbTechnicalMode(next);
    if (!activeId) return;
    try {
      sessionStorage.setItem(
        `node0-pcb-technical:${activeId}`,
        next ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [activeId]);

  const dockActiveLabel = useMemo(() => {
    if (activeId) return "Projects";
    return tab;
  }, [activeId, tab]);

  useEffect(() => {
    if (!cloudHydrated) return;
    if (!projectParam) {
      setInvalidProjectParam(null);
      return;
    }

    if (activeId) {
      setInvalidProjectParam(null);
      return;
    }

    setTab("Projects");
    setInvalidProjectParam(projectParam);

    const t = window.setTimeout(() => {
      router.replace(ROUTE_BASE, { scroll: false });
    }, 900);

    return () => window.clearTimeout(t);
  }, [projectParam, activeId, router, cloudHydrated]);

  useEffect(() => {
    if (activeId) setTab("Projects");
  }, [activeId]);

  useEffect(() => {
    if (!pendingProjectId) return;
    if (projectParam === pendingProjectId) setPendingProjectId(null);
  }, [projectParam, pendingProjectId]);

  useEffect(() => {
    let mounted = true;

    const syncEmail = async () => {
      const session = await getSession();
      if (!mounted) return;
      setAccountEmail(session?.user.email ?? null);
      setWs(readWorkspace());
    };

    void syncEmail();
    const unsubscribe = subscribeAuthSession(() => {
      void syncEmail();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateAuthSession();
        const session = await getSession();
        if (!session?.user?.id) {
          if (!cancelled) setWs(readWorkspace());
          return;
        }

        if (skipCloudPullAfterStripeLocalRestoreRef.current) {
          if (!cancelled) setWs(readWorkspace());
          return;
        }

        const checkoutSuccessQuery = checkoutUrlParam === "success";
        const restored = restoreStripeCheckoutLocalSnapshotIfNeeded(
          session.user.id,
          { checkoutSuccessQuery },
        );
        if (cancelled) return;

        if (restored) {
          skipCloudPullAfterStripeLocalRestoreRef.current = true;
          if (!cancelled) setWs(readWorkspace());
        } else {
          const hadRemote = await pullWorkspaceFromCloud();
          if (cancelled) return;
          if (!hadRemote) {
            await pushLocalWorkspaceIfCloudEmpty();
          }
          if (cancelled) return;
          if (!cancelled) setWs(readWorkspace());
        }
      } catch {
        if (!cancelled) setWs(readWorkspace());
      } finally {
        if (!cancelled) setCloudHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkoutUrlParam, stripeSessionUrlParam]);

  useEffect(() => {
    if (!cloudHydrated) return;
    /** Avoid pushing before `readWorkspace()` can use the user id: empty state would DELETE all rows in Supabase. */
    if (ws.projects.length === 0) return;
    const t = window.setTimeout(() => {
      void pushWorkspaceToCloud();
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    activeId,
    cloudHydrated,
    ws,
    cadShell,
    bomDocument,
    circuitronResults,
    firmwareCode,
  ]);

  useEffect(() => {
    if (!cloudHydrated || ws.projects.length === 0) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      void pushWorkspaceToCloud();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [activeId, cloudHydrated, ws.projects.length]);

  const sortedProjects = useMemo(
    () => [...ws.projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [ws.projects],
  );

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return sortedProjects;
    return sortedProjects.filter((p) => {
      const hay = `${p.name} ${p.tagline}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projectSearch, sortedProjects]);

  const messages = activeId ? ws.messages[activeId] ?? [] : [];
  const assistantDraftCount = activeId
    ? generatingByProject[activeId] ?? 0
    : 0;
  const assistantDrafting = assistantDraftCount > 0;
  const hasAssistantReply = messages.some((m) => m.role === "assistant");
  const awaitingFirstAssistant =
    Boolean(activeId) && assistantDrafting && !hasAssistantReply;

  // Convert circuitron / mock results to PCBViewer format
  const pcbFiles = useMemo(() => {
    const cr = circuitronResults as
      | {
          workspaceFiles?: Record<string, string>;
          files?: Record<string, string | undefined>;
          pcbSource?: string;
        }
      | null
      | undefined;
    if (!cr) return undefined;

    const wf =
      cr.workspaceFiles &&
      typeof cr.workspaceFiles === "object" &&
      Object.keys(cr.workspaceFiles).length > 0
        ? cr.workspaceFiles
        : cr.files &&
            typeof cr.files["schematic.svg"] === "string"
          ? (cr.files as Record<string, string>)
          : null;
    if (!wf) return undefined;

    const schematicContent =
      wf["schematic.svg"] ??
      Object.entries(wf).find(
        ([k, v]) =>
          k.toLowerCase().endsWith(".svg") &&
          typeof v === "string" &&
          !k.toLowerCase().includes("layout_board") &&
          !k.toLowerCase().includes("pcb_3d"),
      )?.[1];
    const pcbContent =
      wf["layout.kicad_pcb"] ??
      wf["layout_board.svg"] ??
      wf["pcb_3d.wrl"] ??
      Object.entries(wf).find(([k]) => k.endsWith(".kicad_pcb"))?.[1];
    const netlistContent =
      wf["netlist.net"] ??
      Object.entries(wf).find(([k]) => k.toLowerCase().endsWith(".net"))?.[1];
    const skidlContent =
      wf["design.skidl"] ??
      Object.entries(wf).find(
        ([k]) => k.toLowerCase().includes("skidl") && k.endsWith(".py"),
      )?.[1];

    const synthetic = cr.pcbSource === "mock";
    const files: Record<string, unknown> = {};

    if (schematicContent) {
      files.schematic = {
        originalPath: "schematic.svg",
        processedPath: "schematic.svg",
        type: "svg",
        content: schematicContent,
        metadata: {
          readyForBrowser: true,
          size: schematicContent.length,
          syntheticLayout: synthetic,
          created: new Date(),
          optimized: false,
          sourceFormat:
            cr.pcbSource === "pcbflow" ? "pcbflow_kicad_style_svg" : "svg",
        },
      };
    }

    if (pcbContent) {
      const isKicad = /^\(kicad_pcb\b/m.test(pcbContent.trim());
      files.pcb = {
        originalPath: isKicad ? "layout.kicad_pcb" : "pcbflow_layout.svg",
        processedPath: isKicad ? "layout.kicad_pcb" : "pcbflow_layout.svg",
        type: isKicad ? "kicad_pcb" : "svg",
        content: pcbContent,
        metadata: {
          readyForBrowser: true,
          size: pcbContent.length,
          syntheticLayout: synthetic,
          created: new Date(),
          optimized: false,
          sourceFormat: isKicad ? "kicad_pcb" : "svg_preview",
        },
      };
    }

    if (netlistContent) {
      files.netlist = {
        originalPath: "netlist.net",
        processedPath: "netlist.net",
        type: "netlist",
        content: netlistContent,
        metadata: { readyForBrowser: true, size: netlistContent.length },
      };
    }

    if (skidlContent) {
      files.skidl = {
        originalPath: "design.skidl",
        processedPath: "design.skidl",
        type: "skidl",
        content: skidlContent,
        metadata: { readyForBrowser: true, size: skidlContent.length },
      };
    }

    return Object.keys(files).length > 0 ? files : undefined;
  }, [circuitronResults]);

  const pcbRawFiles = useMemo(() => {
    const cr = circuitronResults as
      | {
          workspaceFiles?: Record<string, string>;
          files?: Record<string, string | undefined>;
        }
      | null
      | undefined;
    if (!cr) return undefined;
    if (
      cr.workspaceFiles &&
      typeof cr.workspaceFiles === "object" &&
      Object.keys(cr.workspaceFiles).length > 0
    ) {
      return cr.workspaceFiles;
    }
    if (cr.files && typeof cr.files === "object") {
      return Object.fromEntries(
        Object.entries(cr.files).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
    return undefined;
  }, [circuitronResults]);

  const persist = useCallback((next: MockWorkspaceState) => {
    setWs(next);
    writeWorkspace(next);
  }, []);

  const openProject = useCallback(
    (id: string) => {
      setPendingProjectId(null);
      router.replace(`${ROUTE_BASE}?project=${id}`, { scroll: false });
    },
    [router],
  );

  const goBoardHome = useCallback(() => {
    setPendingProjectId(null);
    router.replace(ROUTE_BASE, { scroll: false });
  }, [router]);

  useEffect(() => {
    const draft = peekLandingPromptDraft();
    if (!draft) return;
    setHomeInject({ key: Date.now(), text: draft });
    setTab("Home");
    goBoardHome();
    const id = requestAnimationFrame(() => clearLandingPromptDraft());
    return () => cancelAnimationFrame(id);
  }, [goBoardHome]);

  const scrollBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [activeId, messages.length, assistantDraftCount, scrollBottom]);

  const filesToDataUrls = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    return Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Failed to read image file."));
            reader.readAsDataURL(file);
          }),
      ),
    );
  }, []);

  const [currentAbortController, setCurrentAbortController] = useState<AbortController | null>(null);
  const [cadAgentWarnings, setCadAgentWarnings] = useState<string[]>([]);

  const cancelCurrentRequest = useCallback(() => {
    if (currentAbortController) {
      currentAbortController.abort();
      setCurrentAbortController(null);
    }
  }, [currentAbortController]);

  const pushAssistantReply = useCallback(
    async (
      projectId: string,
      userMsg: string,
      agentModel: ModelId,
      files: File[] = [],
    ) => {
      try {
        // Create new abort controller for this request
        const abortController = new AbortController();
        setCurrentAbortController(abortController);
        if (activeIdRef.current === projectId) {
          setCadAgentWarnings([]);
        }

        const projectName =
          ws.projects.find((p) => p.id === projectId)?.name ?? "Untitled board";
        const images = files.length > 0 ? await filesToDataUrls(files) : [];
        const applyToolCallsToPanels = (toolCalls: AgentToolCall[]) => {
          if (activeIdRef.current !== projectId || toolCalls.length === 0) return;
          for (const call of toolCalls) {
            // Do NOT apply update_cad here. Streaming tool_calls only run
            // applyCadToolArgs (CSG) on the client — OpenSCAD runs on the server
            // inside executeToolCalls. Applying early flashes wrong geometry, strips
            // openscad when cadFeatures replace the doc, then "done" replaces with
            // STL after PCB — feels like CAD "breaks" when the board finishes.
            // Final CAD always comes from nextState.cad on event "done".
            if (call.tool === "update_pcb") {
              // PCB updates are now handled by Circuitron - no local state update needed
              console.log("PCB update request will be handled by Circuitron");
            }
            if (
              call.tool === "replace_bom" &&
              call.args &&
              Array.isArray(call.args.lines)
            ) {
              setBomDocument({
                lines: call.args.lines
                  .filter(
                    (line): line is Record<string, unknown> =>
                      Boolean(line) && typeof line === "object",
                  )
                  .map((line, index) => normalizeBomLine(line, index)),
              });
            }
            if (
              call.tool === "append_bom_lines" &&
              call.args &&
              Array.isArray(call.args.lines)
            ) {
              setBomDocument((prev) => ({
                lines: [
                  ...prev.lines,
                  ...(call.args?.lines || [])
                    .filter(
                      (line): line is Record<string, unknown> =>
                        Boolean(line) && typeof line === "object",
                    )
                    .map((line, index) => normalizeBomLine(line, index)),
                ],
              }));
            }
          }
        };

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            message: userMsg,
            projectName,
            images,
            conversationContext: (ws.messages[projectId] ?? [])
              .slice(-8)
              .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
              .join("\n"),
            currentCad: cadShell,
            currentPcb: null, // PCB state now handled by Circuitron
            currentBom: bomDocument,
            stream: true,
            pcbEngine,
            cadEngine,
          }),
        });
        const decodeEventData = (line: string) => {
          const raw = line.replace(/^data:\s*/, "");
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return null;
          }
        };
        let streamReply = "";
        const streamToolCalls: AgentToolCall[] = [];
        const streamExecutionLines: string[] = [];
        let streamError: string | null = null;

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const lines = block
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              const eventLine = lines.find((s) => s.startsWith("event:"));
              const dataLine = lines.find((s) => s.startsWith("data:"));
              if (!eventLine || !dataLine) continue;
              const eventName = eventLine.replace(/^event:\s*/, "").trim();
              const data = decodeEventData(dataLine);
              if (!data) continue;

              // Handle typing indicator
              if (eventName === "typing") {
                setWs((cur) => {
                  const project = cur.projects.find((p) => p.id === projectId);
                  if (!project) return cur;
                  const existing = cur.messages[projectId] ?? [];
                  const nextMessages = [...existing];

                  // Add typing indicator if not already present
                  if (
                    nextMessages.length === 0 ||
                    nextMessages[nextMessages.length - 1]?.role !== "typing"
                  ) {
                    nextMessages.push({
                      role: "typing",
                      text: typeof data.message === "string" ? data.message : "AI is typing...",
                    } as ChatMsg);
                  }

                  const next: MockWorkspaceState = {
                    ...cur,
                    projects: cur.projects.map((p) =>
                      p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
                    ),
                    messages: { ...cur.messages, [projectId]: nextMessages },
                  };
                  writeWorkspace(next);
                  return next;
                });
                continue;
              }

              // Handle token streaming
              if (eventName === "token") {
                setWs((cur) => {
                  const project = cur.projects.find((p) => p.id === projectId);
                  if (!project) return cur;
                  const existing = cur.messages[projectId] ?? [];
                  const nextMessages = [...existing];

                  // Remove typing indicator and start streaming response
                  const lastMessage = nextMessages[nextMessages.length - 1];
                  if (lastMessage?.role === "typing") {
                    nextMessages.pop();
                  }

                  // Append token to streaming response
                  const streamingMessage = nextMessages[nextMessages.length - 1];
                  const piece = typeof data.token === "string" ? data.token : "";
                  if (streamingMessage?.role === "assistant-streaming") {
                    const i = nextMessages.length - 1;
                    nextMessages[i] = {
                      ...streamingMessage,
                      text: streamingMessage.text + piece,
                    };
                  } else {
                    nextMessages.push({
                      role: "assistant-streaming",
                      text: piece,
                    } as ChatMsg);
                  }

                  const next: MockWorkspaceState = {
                    ...cur,
                    projects: cur.projects.map((p) =>
                      p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
                    ),
                    messages: { ...cur.messages, [projectId]: nextMessages },
                  };
                  writeWorkspace(next);
                  return next;
                });
                continue;
              }

              // Handle progress updates
              if (eventName === "progress") {
                setWs((cur) => {
                  const project = cur.projects.find((p) => p.id === projectId);
                  if (!project) return cur;
                  const existing = cur.messages[projectId] ?? [];
                  const nextMessages = [...existing];

                  // Update or add progress message
                  const lastMessage = nextMessages[nextMessages.length - 1];
                  if (lastMessage?.role === "progress") {
                    lastMessage.text = (typeof data.message === "string" ? data.message : null) || "Processing...";
                  } else {
                    // Remove typing indicator if present
                    if (lastMessage?.role === "typing") {
                      nextMessages.pop();
                    }
                    nextMessages.push({
                      role: "progress",
                      text: (typeof data.message === "string" ? data.message : null) || "Processing...",
                    } as ChatMsg);
                  }

                  const next: MockWorkspaceState = {
                    ...cur,
                    projects: cur.projects.map((p) =>
                      p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
                    ),
                    messages: { ...cur.messages, [projectId]: nextMessages },
                  };
                  writeWorkspace(next);
                  return next;
                });
                continue;
              }

              // Handle tool calls
              if (eventName === "tool_call") {
                const toolCall = data as unknown as AgentToolCall;
                applyToolCallsToPanels([toolCall]);
                streamToolCalls.push(toolCall);
                continue;
              }

              // Handle tool results
              if (eventName === "tool_result") {
                const tr = data as Record<string, unknown>;
                const summary =
                  typeof tr.summary === "string" ? tr.summary : "";
                streamExecutionLines.push(summary);
                if (
                  activeIdRef.current === projectId &&
                  tr.tool === "update_cad" &&
                  Array.isArray(tr.warnings)
                ) {
                  const w = tr.warnings.filter(
                    (x): x is string =>
                      typeof x === "string" && x.trim().length > 0,
                  );
                  if (w.length > 0) {
                    setCadAgentWarnings((prev) => [
                      ...new Set([...prev, ...w]),
                    ]);
                  }
                }
                continue;
              }
              if (eventName === "done") {
                const reply = data.reply;
                if (typeof reply === "string") streamReply = reply;
                const calls = Array.isArray(data.toolCalls)
                  ? (data.toolCalls as AgentToolCall[])
                  : [];
                const summaries = Array.isArray(data.toolResults)
                  ? (data.toolResults as Array<{ summary?: string }>)
                      .map((r) => r.summary)
                      .filter((s): s is string => Boolean(s))
                  : [];
                streamToolCalls.length = 0;
                streamToolCalls.push(...calls);
                streamExecutionLines.push(...summaries);
                const nextState = data.nextState as AgentStateSnapshot | undefined;
                if (
                  nextState &&
                  activeIdRef.current === projectId &&
                  (nextState.cad ||
                    nextState.bom ||
                    nextState.circuitronResults ||
                    typeof nextState.firmware === "string")
                ) {
                  // Update CAD and BOM state
                  if (nextState.cad) {
                    setCadShell(nextState.cad);
                  }
                  if (nextState.bom) {
                    setBomDocument(nextState.bom);
                  }
                  // Update Circuitron results for PCB viewer
                  if (nextState.circuitronResults) {
                    setCircuitronResults(nextState.circuitronResults);
                    persistCircuitronForProject(
                      projectId,
                      nextState.circuitronResults,
                    );
                  }
                  if (typeof nextState.firmware === "string") {
                    setFirmwareCode(nextState.firmware);
                  }
                } else {
                  applyToolCallsToPanels(calls);
                }

                // Convert streaming message to final assistant message
                setWs((cur) => {
                  const project = cur.projects.find((p) => p.id === projectId);
                  if (!project) return cur;
                  const existing = cur.messages[projectId] ?? [];

                  // Remove progress messages and convert streaming to final
                  const filteredMessages = existing.filter(
                    (msg) => msg.role !== "progress" && msg.role !== "typing",
                  );

                  // Convert streaming message to final assistant message
                  const lastMessage = filteredMessages[filteredMessages.length - 1];
                  if (lastMessage?.role === "assistant-streaming") {
                    const fromServer =
                      typeof streamReply === "string" && streamReply.trim() !== ""
                        ? streamReply
                        : lastMessage.text;
                    const idx = filteredMessages.length - 1;
                    filteredMessages[idx] = {
                      ...lastMessage,
                      role: "assistant",
                      text: dedupeRepeatedAssistantReply(fromServer),
                    };
                  } else if (streamReply) {
                    // Add final message if no streaming occurred
                    filteredMessages.push({
                      role: "assistant",
                      text: dedupeRepeatedAssistantReply(streamReply),
                    } as ChatMsg);
                  }

                  const ns = nextState;
                  const next: MockWorkspaceState = {
                    ...cur,
                    projects: cur.projects.map((p) => {
                      if (p.id !== projectId) return p;
                      const title = ns?.projectTitle?.trim();
                      const tag = ns?.projectTagline?.trim();
                      return {
                        ...p,
                        updatedAt: Date.now(),
                        ...(title ? { name: title.slice(0, 72) } : {}),
                        ...(tag ? { tagline: tag.slice(0, 140) } : {}),
                      };
                    }),
                    messages: { ...cur.messages, [projectId]: filteredMessages },
                  };
                  writeWorkspace(next);
                  return next;
                });
                continue;
              }
              if (eventName === "error") {
                streamError =
                  typeof data.error === "string"
                    ? data.error
                    : "Unknown AI error.";
              }

              if (eventName === "cancelled") {
                streamError = "Request was cancelled by user";
                break; // Stop processing when cancelled
              }
            }
          }
        } else {
          const payload = (await response.json().catch(() => ({}))) as {
            reply?: string;
            error?: string;
            toolCalls?: AgentToolCall[];
            toolResults?: Array<{
              summary?: string;
              tool?: string;
              warnings?: unknown;
            }>;
            nextState?: AgentStateSnapshot;
          };
          streamReply = payload.reply ?? "";
          streamError = payload.error ?? null;
          if (activeIdRef.current === projectId) {
            const nw: string[] = [];
            for (const r of payload.toolResults ?? []) {
              if (
                r.tool === "update_cad" &&
                Array.isArray(r.warnings)
              ) {
                for (const x of r.warnings) {
                  if (typeof x === "string" && x.trim())
                    nw.push(x.trim());
                }
              }
            }
            if (nw.length > 0) {
              setCadAgentWarnings((prev) => [...new Set([...prev, ...nw])]);
            }
          }
          if (Array.isArray(payload.toolCalls)) {
            streamToolCalls.push(...payload.toolCalls);
          }
          const nsNonStream = payload.nextState;
          if (
            nsNonStream &&
            activeIdRef.current === projectId &&
            (nsNonStream.cad ||
              nsNonStream.bom ||
              nsNonStream.circuitronResults ||
              typeof nsNonStream.firmware === "string")
          ) {
            if (nsNonStream.cad) {
              setCadShell(nsNonStream.cad);
            }
            if (nsNonStream.bom) {
              setBomDocument(nsNonStream.bom);
            }
            if (nsNonStream.circuitronResults) {
              setCircuitronResults(nsNonStream.circuitronResults);
              persistCircuitronForProject(
                projectId,
                nsNonStream.circuitronResults,
              );
            }
            if (typeof nsNonStream.firmware === "string") {
              setFirmwareCode(nsNonStream.firmware);
            }
          } else if (Array.isArray(payload.toolCalls)) {
            applyToolCallsToPanels(payload.toolCalls);
          }
          if (
            nsNonStream &&
            activeIdRef.current === projectId &&
            (nsNonStream.projectTitle?.trim() ||
              nsNonStream.projectTagline?.trim())
          ) {
            setWs((cur) => {
              const next: MockWorkspaceState = {
                ...cur,
                projects: cur.projects.map((p) => {
                  if (p.id !== projectId) return p;
                  const title = nsNonStream.projectTitle?.trim();
                  const tag = nsNonStream.projectTagline?.trim();
                  return {
                    ...p,
                    updatedAt: Date.now(),
                    ...(title ? { name: title.slice(0, 72) } : {}),
                    ...(tag ? { tagline: tag.slice(0, 140) } : {}),
                  };
                }),
              };
              writeWorkspace(next);
              return next;
            });
          }
          streamExecutionLines.push(
            ...(payload.toolResults ?? [])
              .map((r) => r.summary)
              .filter((s): s is string => Boolean(s)),
          );
        }
        const replyText =
          streamReply ||
          (streamError
            ? `AI error: ${streamError}`
            : "AI did not return a response.");

        // Only add legacy final message if streaming failed or wasn't used
        if (!response.ok || !response.body || !streamReply) {
          setWs((cur) => {
            const project = cur.projects.find((p) => p.id === projectId);
            if (!project) return cur;

            const prior = [...(cur.messages[projectId] ?? [])];
            const lastPrior = prior[prior.length - 1];
            if (
              response.ok &&
              lastPrior?.role === "assistant" &&
              String(lastPrior.text ?? "").trim().length > 0 &&
              !String(lastPrior.text).startsWith("Working… step ")
            ) {
              return cur;
            }

            const doc = generateDemoBomDocument(project, userMsg);
            const toolCalls = streamToolCalls;
            const executionLines = streamExecutionLines;

            const normalized = normalizeAgentPrompt(userMsg);
            const shellOps = parseShellOps(normalized);
            const pcbOps = parsePcbOps(normalized);

          const wantsShell = /\b(enclosure|case|shell|housing|length|depth|width|height|wall|radius)\b/i.test(
            normalized,
          );
          const wantsPcb = /\b(pcb|board|layout|layers?|min\s*trace|min\s*clearance|via|grid)\b/i.test(
            normalized,
          );

          let applyShell = true;
          let applyPcb = true;
          if (agentModel === "mini") {
            applyShell = false;
            applyPcb = false;
          } else if (agentModel === "base") {
            applyShell = wantsShell;
            applyPcb = wantsPcb;
          }

          let effectiveShellOps: ShellOps = shellOps;
          let effectivePcbOps: PcbOps = pcbOps;

          if (!applyShell) effectiveShellOps = {};
          if (!applyPcb) effectivePcbOps = {};

          // "base" is less agentic: ignore scale hints and only apply explicit fields/defaults.
          if (agentModel === "base") {
            if (effectiveShellOps.scale != null) delete effectiveShellOps.scale;
            if (effectivePcbOps.scale != null) delete effectivePcbOps.scale;
          }

          const hasShellOps = Object.keys(effectiveShellOps).length > 0;
          const hasPcbOps = Object.keys(effectivePcbOps).length > 0;

          queueMicrotask(() => {
            if (activeIdRef.current === projectId) {
              if (toolCalls.length === 0) {
                setBomDocument(doc);
                setCadShell((prev) => {
                  if (!hasShellOps) return prev;
                  const base = documentToSyntheticShell(prev);
                  let L = base.lengthMm;
                  let W = base.widthMm;
                  let H = base.heightMm;
                  if (effectiveShellOps.scale != null) {
                    L *= effectiveShellOps.scale;
                    W *= effectiveShellOps.scale;
                    H *= effectiveShellOps.scale;
                  }
                  if (effectiveShellOps.lengthMm != null)
                    L = effectiveShellOps.lengthMm;
                  if (effectiveShellOps.widthMm != null)
                    W = effectiveShellOps.widthMm;
                  if (effectiveShellOps.heightMm != null)
                    H = effectiveShellOps.heightMm;
                  const patch: Partial<ShellParams> = {
                    lengthMm: L,
                    widthMm: W,
                    heightMm: H,
                  };
                  if (effectiveShellOps.wallMm != null)
                    patch.wallMm = effectiveShellOps.wallMm;
                  if (effectiveShellOps.cornerRadiusMm != null)
                    patch.cornerRadiusMm = effectiveShellOps.cornerRadiusMm;
                  return applyLegacyShellPatch(prev, patch);
                });
                // PCB operations are now handled by Circuitron
                console.log("PCB operations skipped - handled by Circuitron");
              }
            } else {
              persistBomForProject(projectId, doc);
            }
          });

          const reply: ChatMsg = {
            role: "assistant",
            text: dedupeRepeatedAssistantReply(
              executionLines.length > 0
                ? `${replyText}\n\nAgent steps:\n${executionLines.map((line) => `- ${line}`).join("\n")}`
                : replyText,
            ),
          };
          const existingMessages = [...(cur.messages[projectId] ?? [])];
          if (
            existingMessages.length > 0 &&
            existingMessages[existingMessages.length - 1]?.role === "assistant" &&
            existingMessages[existingMessages.length - 1]?.text.startsWith("Working… step ")
          ) {
            existingMessages.pop();
          }
          const next: MockWorkspaceState = {
            ...cur,
            projects: cur.projects.map((p) =>
              p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
            ),
            messages: {
              ...cur.messages,
              [projectId]: [...existingMessages, reply],
            },
          };
          writeWorkspace(next);
          return next;
        });
        }
      } catch (error) {
        // Handle cancellation and other errors
        const errorMessage =
          error instanceof Error && error.name === 'AbortError'
            ? "Request was cancelled"
            : error instanceof Error
            ? error.message
            : "Unknown error occurred";

        // Add error message to chat
        setWs((cur) => {
          const project = cur.projects.find((p) => p.id === projectId);
          if (!project) return cur;

          const errorMsg: ChatMsg = {
            role: "assistant",
            text: `Error: ${errorMessage}`,
          };

          const existing = cur.messages[projectId] ?? [];
          const nextMessages = [...existing.filter(m => m.role !== "typing" && m.role !== "progress" && m.role !== "assistant-streaming"), errorMsg];

          const next: MockWorkspaceState = {
            ...cur,
            projects: cur.projects.map((p) =>
              p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
            ),
            messages: { ...cur.messages, [projectId]: nextMessages },
          };
          writeWorkspace(next);
          return next;
        });
      } finally {
        // Clear "drafting" indicator for this project.
        setGeneratingByProject((cur) => {
          const current = cur[projectId] ?? 0;
          if (current <= 1) {
            const copy = { ...cur };
            delete copy[projectId];
            return copy;
          }
          return { ...cur, [projectId]: current - 1 };
        });

        // Clear abort controller
        setCurrentAbortController(null);
      }
    },
    [
      filesToDataUrls,
      setBomDocument,
      setCadShell,
      // setPcbBoard removed - PCB handled by Circuitron
      cadShell,
      // pcbBoard removed - PCB handled by Circuitron
      bomDocument,
      ws.messages,
      ws.projects,
      pcbEngine,
    ],
  );

  const handleSend = useCallback(
    (raw: string, fileList?: File[]) => {
      const text = raw.trim();
      const files = fileList ?? [];
      if ((!text && files.length === 0) || !activeId) return;
      if (generatingByProject[activeId] && generatingByProject[activeId] > 0) {
        return;
      }

      setGeneratingByProject((cur) => ({
        ...cur,
        [activeId]: (cur[activeId] ?? 0) + 1,
      }));

      const userMsg: ChatMsg = {
        role: "user",
        text:
          text ||
          `[${files.length} image${files.length > 1 ? "s" : ""} attached]`,
      };
      setWs((cur) => {
        const next: MockWorkspaceState = {
          ...cur,
          projects: cur.projects.map((p) =>
            p.id === activeId ? { ...p, updatedAt: Date.now() } : p,
          ),
          messages: {
            ...cur.messages,
            [activeId]: [...(cur.messages[activeId] ?? []), userMsg],
          },
        };
        writeWorkspace(next);
        return next;
      });

      void pushAssistantReply(activeId, userMsg.text, activeAgentModel, files);
    },
    [activeId, activeAgentModel, generatingByProject, pushAssistantReply],
  );

  const chatSuggestionContext = useMemo(() => {
    if (!activeId) return "";
    const msgs = ws.messages[activeId] ?? [];
    return msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`,
      )
      .join("\n");
  }, [activeId, ws.messages]);

  const [chatSuggestions, setChatSuggestions] = useState<string[]>([]);
  const [chatSuggestionsLoading, setChatSuggestionsLoading] = useState(false);
  const [chatSuggestionsError, setChatSuggestionsError] = useState<
    string | null
  >(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  const fetchChatSuggestions = useCallback(
    async (signal: AbortSignal) => {
      if (!activeId) return;
      const projectName =
        ws.projects.find((p) => p.id === activeId)?.name ?? "Untitled board";
      setChatSuggestionsLoading(true);
      setChatSuggestionsError(null);
      try {
        const res = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            projectName,
            conversationContext: chatSuggestionContext,
            activeTool: projectTool,
            bomLineCount: bomDocument.lines.length,
            cadFeatureCount: cadShell.features.length,
          }),
        });
        const data = (await res.json()) as {
          suggestions?: string[];
          error?: string;
        };
        if (signal.aborted) return;
        if (!res.ok) {
          setChatSuggestionsError(data.error ?? "Suggestions failed.");
          setChatSuggestions([]);
          return;
        }
        setChatSuggestions(
          Array.isArray(data.suggestions)
            ? data.suggestions.slice(0, 3)
            : [],
        );
      } catch (e) {
        if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
          return;
        }
        setChatSuggestionsError(
          e instanceof Error ? e.message : "Suggestions failed.",
        );
        setChatSuggestions([]);
      } finally {
        if (!signal.aborted) {
          setChatSuggestionsLoading(false);
        }
      }
    },
    [
      activeId,
      ws.projects,
      chatSuggestionContext,
      projectTool,
      bomDocument.lines.length,
      cadShell.features.length,
    ],
  );

  useEffect(() => {
    if (!activeId) {
      suggestionsAbortRef.current?.abort();
      setChatSuggestions([]);
      setChatSuggestionsError(null);
      setChatSuggestionsLoading(false);
      return;
    }
    if (assistantDrafting) return;

    suggestionsAbortRef.current?.abort();
    const ac = new AbortController();
    suggestionsAbortRef.current = ac;
    const t = window.setTimeout(() => {
      void fetchChatSuggestions(ac.signal);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [
    activeId,
    assistantDrafting,
    chatSuggestionContext,
    projectTool,
    bomDocument.lines.length,
    cadShell.features.length,
    fetchChatSuggestions,
  ]);

  const refreshChatSuggestions = useCallback(() => {
    if (!activeId || assistantDrafting) return;
    suggestionsAbortRef.current?.abort();
    const ac = new AbortController();
    suggestionsAbortRef.current = ac;
    void fetchChatSuggestions(ac.signal);
  }, [activeId, assistantDrafting, fetchChatSuggestions]);

  const createProject = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const id = createProjectId();
    const project: MockProject = {
      id,
      name,
      tagline: "Describe below — design loads here",
      updatedAt: Date.now(),
    };
    const next: MockWorkspaceState = {
      projects: [project, ...ws.projects],
      messages: { ...ws.messages, [id]: [] },
    };
    setPendingProjectId(id);
    persist(next);
    setNewName("");
    setNewOpen(false);
    setTab("Projects");
    router.replace(`${ROUTE_BASE}?project=${id}`, { scroll: false });
  }, [newName, persist, router, ws.messages, ws.projects]);

  const startRenameProject = useCallback(
    (id: string) => {
      const p = ws.projects.find((x) => x.id === id);
      setRenameTargetId(id);
      setRenameName(p?.name ?? "");
      setRenameOpen(true);
    },
    [ws.projects],
  );

  const applyRenameProject = useCallback(() => {
    if (!renameTargetId) return;
    const name = renameName.trim();
    if (!name) return;

    const next: MockWorkspaceState = {
      ...ws,
      projects: ws.projects.map((p) =>
        p.id === renameTargetId ? { ...p, name, updatedAt: Date.now() } : p,
      ),
    };

    persist(next);
    setRenameOpen(false);
    setRenameTargetId(null);
    setRenameName("");
  }, [persist, renameName, renameTargetId, ws]);

  const startDeleteProject = useCallback((id: string) => {
    setDeleteTargetId(id);
    setDeleteOpen(true);
  }, []);

  const applyDeleteProject = useCallback(() => {
    if (!deleteTargetId) return;

    const nextMessages = { ...ws.messages };
    delete nextMessages[deleteTargetId];

    const next: MockWorkspaceState = {
      projects: ws.projects.filter((p) => p.id !== deleteTargetId),
      messages: nextMessages,
    };

    persist(next);
    clearCircuitronForProject(deleteTargetId);
    dualStorageRemove(`node0-bom:${deleteTargetId}`);
    dualStorageRemove(`node0-cad-shell:${deleteTargetId}`);
    dualStorageRemove(`node0-project-tool:${deleteTargetId}`);
    dualStorageRemove(`node0-firmware:${deleteTargetId}`);
    dualStorageRemove(ORDERS_SESSION_PREFIX + deleteTargetId);
    dualStorageRemove(`node0-cad-technical:${deleteTargetId}`);
    dualStorageRemove(`node0-cad-developer:${deleteTargetId}`);
    dualStorageRemove(`node0-pcb-technical:${deleteTargetId}`);
    void pushWorkspaceToCloud();
    setDeleteOpen(false);
    setDeleteTargetId(null);
    setGeneratingByProject((cur) => {
      const copy = { ...cur };
      delete copy[deleteTargetId];
      return copy;
    });
  }, [deleteTargetId, persist, ws.messages, ws.projects]);

  const resetWorkspace = useCallback(() => {
    clearWorkspaceStorage();
    const next = readWorkspace();
    setWs(next);
    void pushWorkspaceToCloud();
    setGeneratingByProject({});
    setProjectToolInner("cad");
    setCadTechnicalMode(false);
    setPcbTechnicalMode(false);
    setProjectSearch("");
    setNewOpen(false);
    setRenameOpen(false);
    setDeleteOpen(false);
    setTeamOpen(false);
    setPendingProjectId(null);
    setTab("Projects");
    router.replace(ROUTE_BASE, { scroll: false });
  }, [router]);

  const exportWorkspace = useCallback(() => {
    const snapshot = readWorkspace();
    downloadJsonFile(`node0-workspace-${Date.now()}`, snapshot);
  }, []);

  const handleWorkspacePrompt = useCallback(
    (raw: string, fileList?: File[]) => {
      const text = raw.trim();
      const hasFiles = Boolean(fileList && fileList.length > 0);
      if (!text && !hasFiles) return;

      const id = createProjectId();
      const cleaned = text.replace(/\s+/g, " ").trim();
      const short =
        cleaned.length > 42 ? `${cleaned.slice(0, 42).trim()}…` : cleaned;
      const name = short || "New idea";

    const project: MockProject = {
      id,
      name,
      tagline: hasFiles
        ? `${fileList!.length} attachment${fileList!.length > 1 ? "s" : ""}`
        : "Loading design…",
      updatedAt: Date.now(),
    };

      const displayText =
        text ||
        (hasFiles
          ? `[${fileList!.length} image${fileList!.length > 1 ? "s" : ""} attached]`
          : "");

      const userMsg: ChatMsg = { role: "user", text: displayText };
      const next: MockWorkspaceState = {
        projects: [project, ...ws.projects],
        messages: { ...ws.messages, [id]: [userMsg] },
      };
      setPendingProjectId(id);
      persist(next);
      setTab("Projects");
      router.replace(`${ROUTE_BASE}?project=${id}`, { scroll: false });

      setGeneratingByProject((cur) => ({
        ...cur,
        [id]: (cur[id] ?? 0) + 1,
      }));

      void pushAssistantReply(id, displayText, activeAgentModel, fileList ?? []);
    },
    [
      persist,
      pushAssistantReply,
      router,
      ws.messages,
      ws.projects,
      activeAgentModel,
    ],
  );

  const selectProject = useCallback(
    (id: string) => {
      openProject(id);
    },
    [openProject],
  );

  const goTab = useCallback(
    (next: DockTab) => {
      setTab(next);
      goBoardHome();
    },
    [goBoardHome],
  );

  const applyTemplateToHome = useCallback(
    (prompt: string) => {
      setHomeInject({ key: Date.now(), text: prompt });
      goTab("Home");
    },
    [goTab],
  );

  const dockItems = useMemo(
    () => [
      {
        icon: Home,
        label: "Home" as const,
        onClick: () => goTab("Home"),
      },
      {
        icon: FolderKanban,
        label: "Projects" as const,
        onClick: () => goTab("Projects"),
      },
      {
        icon: LayoutTemplate,
        label: "Templates" as const,
        onClick: () => goTab("Templates"),
      },
      {
        icon: Settings,
        label: "Settings" as const,
        onClick: () => goTab("Settings"),
      },
    ],
    [goTab],
  );

  const headerTitle = useMemo(() => {
    if (activeId && activeProject) return activeProject.name;
    switch (tab) {
      case "Home":
        return "New board";
      case "Projects":
        return "Boards";
      case "Templates":
        return "Templates";
      case "Settings":
        return "Settings";
      default:
        return "Workspace";
    }
  }, [activeId, activeProject, tab]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col bg-[#070709] text-zinc-100">
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-[calc(4rem+env(safe-area-inset-top))]",
          activeId
            ? "min-h-0 overflow-hidden"
            : "min-h-0 overflow-y-auto overscroll-y-contain",
        )}
      >
        {!activeId ? (
          <header className="sticky top-0 z-[38] shrink-0 px-4 pb-3 pt-1 sm:px-6 md:px-8">
            <div
              className={cn(
                "relative isolate overflow-hidden rounded-2xl",
                "border border-white/[0.18]",
                "bg-zinc-950/[0.92] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),0_18px_50px_rgba(0,0,0,0.55)]",
                "ring-1 ring-inset ring-white/[0.12]",
              )}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
                aria-hidden
              />
              <div className="relative px-4 py-3 sm:px-5 sm:py-3.5">
                <h1 className="font-heading text-lg font-semibold leading-snug tracking-[-0.02em] text-zinc-50 sm:text-xl">
                  {headerTitle}
                </h1>
                {invalidProjectParam ? (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    Board not found. Redirecting to your boards…
                  </p>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        {activeId && activeProject ? (
          <header className="sticky top-0 z-[38] shrink-0 overflow-visible border-b border-white/[0.06] bg-[#070709] px-4 py-2.5 sm:px-6 md:px-8">
            <div className="flex min-h-10 items-center justify-between gap-3">
              <h2 className="min-w-0 flex-1 truncate font-heading text-base font-semibold tracking-[-0.02em] text-zinc-50 sm:text-lg">
                {activeProject.name}
              </h2>
              <div className="flex items-center gap-2">
                {projectTool === "cad" || projectTool === "pcb" ? (
                  <button
                    type="button"
                    aria-pressed={
                      projectTool === "cad"
                        ? cadTechnicalMode
                        : pcbTechnicalMode
                    }
                    aria-label={
                      (projectTool === "cad"
                        ? cadTechnicalMode
                        : pcbTechnicalMode)
                        ? "Hide technical tools"
                        : "Show technical tools"
                    }
                    onClick={() => {
                      if (projectTool === "cad") {
                        setCadTechnicalModePersisted(!cadTechnicalMode);
                      } else {
                        setPcbTechnicalModePersisted(!pcbTechnicalMode);
                      }
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap shadow-sm transition-colors sm:text-sm",
                      (projectTool === "cad"
                        ? cadTechnicalMode
                        : pcbTechnicalMode)
                        ? "border-zinc-500/90 bg-zinc-800 text-zinc-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-zinc-700"
                        : "border-zinc-600/90 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800",
                    )}
                  >
                    <SlidersHorizontal
                      className="size-3.5 text-zinc-300"
                      strokeWidth={2}
                    />
                    Technical
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTeamOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-600/90 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 shadow-sm transition-colors hover:border-zinc-500 hover:bg-zinc-800 sm:text-sm"
                >
                  <Users2 className="size-3.5 text-zinc-300" strokeWidth={2} />
                  Team
                </button>
              </div>
            </div>
          </header>
        ) : null}

        <main
          className={cn(
            "relative z-10 flex min-w-0 flex-col bg-[#070709]",
            activeId
              ? "min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]"
              : "shrink-0 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.75rem+env(safe-area-inset-bottom))]",
          )}
        >
          <motion.div
            key={activeId ? `project-${activeId}` : `tab-${tab}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "flex min-h-0 w-full flex-col",
              activeId ? "min-h-0 flex-1 overflow-hidden" : "shrink-0",
            )}
          >
          {activeId ? (
            <div
              ref={chatSplitRef}
              className="flex min-h-0 flex-1 flex-col md:flex-row"
              style={
                {
                  ["--chat-width-pct"]: `${chatWidthPct}%`,
                } as CSSProperties
              }
            >
              <motion.aside
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                className={cn(
                  "relative flex min-h-0 w-full flex-col border-white/[0.08] bg-[#070709]",
                  "min-h-0 flex-1 border-b md:flex-none md:border-b-0",
                  "md:min-w-[18%] md:max-w-[52%] md:shrink-0 md:overflow-hidden md:border-r",
                  "md:w-[var(--chat-width-pct)]",
                )}
              >
                <ChatSuggestionsPanel
                  suggestions={chatSuggestions}
                  loading={chatSuggestionsLoading}
                  error={chatSuggestionsError}
                  disabled={assistantDrafting}
                  onPick={(text) => handleSend(text)}
                  onRefresh={refreshChatSuggestions}
                />
                <div
                  ref={scrollRef}
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4",
                    "md:max-h-[min(55vh,28rem)]",
                    "[scrollbar-width:thin]",
                    "[scrollbar-color:rgba(255,255,255,0.12)_transparent]",
                    "[&::-webkit-scrollbar]:w-1.5",
                    "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
                    "[&::-webkit-scrollbar-track]:bg-transparent",
                  )}
                >
                  <div className="space-y-3">
                    {messages.length === 0 ? (
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/25 px-4 py-6 text-center">
                        <div className="mx-auto flex size-8 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900/80 text-zinc-500">
                          <Cpu className="size-3.5" strokeWidth={1.75} />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                          Tell us what you're building to get started.
                        </p>
                      </div>
                    ) : null}

                    {messages.map((m, i) => (
                      <motion.div
                        key={`${activeId}-${i}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                          "flex",
                          m.role === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[min(100%,min(36rem,92vw))] rounded-2xl px-3 py-2 text-[13px] leading-relaxed sm:max-w-[min(100%,40rem)]",
                            m.role === "user"
                              ? "rounded-br-md border border-zinc-600/50 bg-zinc-800 text-zinc-100"
                              : m.role === "typing"
                              ? "rounded-bl-md border border-zinc-700 bg-zinc-800/80 text-zinc-400"
                              : m.role === "progress"
                              ? "rounded-bl-md border border-blue-800/50 bg-blue-900/30 text-blue-300"
                              : m.role === "assistant-streaming"
                              ? "rounded-bl-md border border-zinc-800 bg-zinc-900/90 text-zinc-300 animate-pulse"
                              : "rounded-bl-md border border-zinc-800 bg-zinc-900/90 text-zinc-300",
                          )}
                        >
                          {m.role === "typing" && (
                            <div className="flex items-center gap-2">
                              <span>{m.text}</span>
                              <div className="flex gap-1">
                                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                                <div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                              </div>
                            </div>
                          )}
                          {m.role === "progress" && (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 animate-spin rounded-full border border-blue-400 border-t-transparent" />
                              <span>{m.text}</span>
                            </div>
                          )}
                          {(m.role === "assistant" || m.role === "assistant-streaming") && (
                            <ChatMarkdown content={m.text} />
                          )}
                          {m.role === "user" && <span>{m.text}</span>}
                        </div>
                      </motion.div>
                    ))}

                    {assistantDrafting ? (
                      <motion.div
                        key="assistant-drafting"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex justify-start"
                      >
                        <div className="max-w-[min(100%,18rem)] rounded-2xl border border-zinc-800 bg-zinc-900/85 px-3 py-2">
                          <p className="text-[13px] leading-relaxed text-zinc-200">
                            Node0 is drafting your updates
                            <span className="ml-1 animate-pulse text-zinc-400">
                              …
                            </span>
                          </p>
                          <div className="mt-2 space-y-2">
                            <div className="h-2 w-20 animate-pulse rounded-full bg-white/[0.08]" />
                            <div className="h-2 w-28 animate-pulse rounded-full bg-white/[0.08]" />
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 border-t border-zinc-800/90 bg-[#070709] p-2 sm:p-2.5">
                  {assistantDrafting ? (
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <p className="text-[11px] text-zinc-400">
                        Drafting your board updates...
                      </p>
                      {currentAbortController && (
                        <button
                          type="button"
                          onClick={cancelCurrentRequest}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                        >
                          <X className="size-3" />
                          Stop
                        </button>
                      )}
                    </div>
                  ) : null}
                  <PromptInputBox
                    placeholder="Message…"
                    isLoading={assistantDrafting}
                    onSend={(msg, fileList) => handleSend(msg, fileList)}
                    className="[&_[data-ai-prompt-box]]:rounded-2xl"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Resize chat width"
                  aria-orientation="horizontal"
                  role="slider"
                  aria-valuemin={CHAT_MIN_PCT}
                  aria-valuemax={CHAT_MAX_PCT}
                  aria-valuenow={Math.round(chatWidthPct * 10) / 10}
                  tabIndex={0}
                  className={cn(
                    "absolute inset-y-0 right-0 z-10 hidden w-2 cursor-col-resize touch-none border-0 bg-transparent p-0 md:block",
                    "select-none outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    chatSplitDragging && "bg-white/[0.06]",
                  )}
                  onPointerDown={onResizePointerDown}
                  onKeyDown={onResizeKeyDown}
                />
              </motion.aside>

              <motion.section
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#070709]"
              >
                {awaitingFirstAssistant ? (
                  <ChatFirstReplySnake />
                ) : (
                  <>
                <div className="shrink-0 border-b border-white/[0.06] bg-[#070709] px-3 py-2.5 sm:px-4">
                  <ProjectToolDock
                    items={[...projectToolItems]}
                    activeId={projectTool}
                    onSelect={setProjectTool}
                  />
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    projectTool === "pcb"
                      ? "flex flex-col overflow-hidden p-0"
                      : cn(
                          "overflow-y-auto",
                          projectTool === "cad" || projectTool === "bom"
                            ? "p-0"
                            : "px-4 py-5 sm:px-6",
                        ),
                  )}
                >
                  {projectTool === "cad" && activeId ? (
                    <div id="project-tool-panel-cad" className="h-full min-h-0">
                      <CadShellPanel
                        cad={cadShell}
                        onCadChange={setCadShell}
                        technicalMode={cadTechnicalMode}
                        exportSlug={exportDownloadSlug}
                        agentToolWarnings={cadAgentWarnings}
                        className="h-full min-h-0"
                      />
                    </div>
                  ) : projectTool === "pcb" && activeId ? (
                    <div
                      id="project-tool-panel-pcb"
                      className="flex min-h-0 min-w-0 flex-1 flex-col"
                    >
                      <div className="flex min-h-0 flex-1 flex-basis-0 flex-col gap-2">
                        {Array.isArray(
                          (circuitronResults as { pcbWarnings?: string[] } | null)
                            ?.pcbWarnings,
                        ) &&
                        (circuitronResults as { pcbWarnings: string[] }).pcbWarnings
                          .length > 0 ? (
                          <div
                            className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95"
                            role="status"
                          >
                            {(circuitronResults as { pcbWarnings: string[] }).pcbWarnings.join(
                              " ",
                            )}
                          </div>
                        ) : null}
                        <PCBViewer
                          files={pcbFiles as Parameters<typeof PCBViewer>[0]["files"]}
                          loading={false}
                          className="min-h-0 min-w-0 flex-1 flex-basis-0"
                        />
                      </div>
                    </div>
                  ) : projectTool === "bom" && activeId ? (
                    <div id="project-tool-panel-bom" className="h-full min-h-0">
                      <BomPanel
                        document={bomDocument}
                        onChange={setBomDocument}
                        exportSlug={exportDownloadSlug}
                        className="h-full min-h-0"
                      />
                    </div>
                  ) : projectTool === "code" && activeId ? (
                    <div id="project-tool-panel-code" className="h-full min-h-0">
                      <FirmwarePanel
                        code={firmwareCode}
                        onChange={setFirmwareCode}
                        projectName={activeProject?.name}
                        className="h-full min-h-0"
                      />
                    </div>
                  ) : projectTool === "ar" && activeId ? (
                    <div id="project-tool-panel-ar" className="h-full min-h-0">
                      <ArPreviewPanel
                        projectId={activeId}
                        projectName={activeProject?.name}
                        cad={cadShell}
                        circuitron={circuitronResults}
                        className="h-full min-h-0"
                      />
                    </div>
                  ) : projectTool === "order" && activeId ? (
                    <div id="project-tool-panel-order" className="h-full min-h-0">
                      <OrderPanel
                        key={activeId}
                        projectId={activeId}
                        className="h-full min-h-0"
                      />
                    </div>
                  ) : null}
                </div>
                  </>
                )}
              </motion.section>
            </div>
          ) : tab === "Home" ? (
            <AnimatedAIChat
              placeholder="Describe something you want to build…"
              homeInjectKey={homeInject.key}
              homeInjectText={homeInject.text}
              onSend={(msg, files) => handleWorkspacePrompt(msg, files)}
            />
          ) : tab === "Projects" ? (
            <div className="px-4 py-6 sm:px-6 md:px-10">
              <div className="mx-auto flex max-w-2xl flex-col gap-5">
                <div className="max-w-md">
                  <label htmlFor="project-search" className="sr-only">
                    Search boards
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                      strokeWidth={1.75}
                    />
                    <input
                      id="project-search"
                      type="search"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search boards by name or intent…"
                      autoComplete="off"
                      className={cn(
                        "w-full rounded-xl border border-white/[0.1] bg-white/[0.04] py-2 pl-9 pr-3",
                        "text-sm text-zinc-100 placeholder:text-zinc-600",
                        "outline-none ring-0",
                        "transition-colors focus:border-white/[0.18] focus:bg-white/[0.06]",
                      )}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTab("Home");
                      goBoardHome();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1]"
                  >
                    <SquarePen className="size-4 text-zinc-400" />
                    New board
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-4 py-2 text-sm text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
                  >
                    <Plus className="size-4" />
                    Named…
                  </button>
                </div>
                {filteredProjects.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-sm leading-relaxed text-zinc-600">
                      {projectSearch.trim()
                        ? "No boards match that search."
                        : "No boards yet—start from Home or create a named board."}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1]"
                      >
                        <Plus className="size-4 text-zinc-400" />
                        Create a named board
                      </button>
                      <button
                        type="button"
                        onClick={() => goTab("Templates")}
                        className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-4 py-2 text-sm text-zinc-400 transition hover:border-white/[0.12] hover:text-zinc-200"
                      >
                        <LayoutTemplate className="size-4" />
                        Browse templates
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {filteredProjects.map((p) => (
                      <li key={p.id}>
                        <div
                          onClick={() => selectProject(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") selectProject(p.id);
                          }}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "flex w-full flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5 text-left transition",
                            "hover:border-white/[0.1] hover:bg-white/[0.05]",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium text-zinc-200">
                                {p.name}
                              </span>
                              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-zinc-600">
                                {p.tagline}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Rename ${p.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRenameProject(p.id);
                                }}
                                className="inline-flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                              >
                                <PencilLine className="size-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${p.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startDeleteProject(p.id);
                                }}
                                className="inline-flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-zinc-600">
                              Updated {formatProjectTime(p.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : tab === "Templates" ? (
            <WorkspaceTemplatesPage onUseTemplate={applyTemplateToHome} />
          ) : (
            <div className="px-4 py-8 sm:px-6 md:px-10">
              <div className="mx-auto max-w-2xl">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-5">
                  <h2 className="font-heading text-lg font-semibold text-zinc-100">
                    Workspace
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    Controls for this demo workspace stored in your browser
                    session.
                  </p>
                  <p className="mt-3 text-sm text-zinc-300">
                    Signed in as{" "}
                    <span className="font-mono text-zinc-100">
                      {accountEmail ?? "No active session"}
                    </span>
                  </p>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={resetWorkspace}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15"
                    >
                      Reset workspace
                    </button>
                    <button
                      type="button"
                      onClick={exportWorkspace}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1]"
                    >
                      Export workspace
                    </button>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-5">
                  <h3 className="font-heading text-base font-semibold text-zinc-100">
                    PCB engine
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    Board generation runs on PCBFlow when the agent calls{" "}
                    <span className="font-mono text-zinc-400">update_pcb</span>.
                    Run{" "}
                    <span className="font-mono text-zinc-400">npm run setup:pcbflow</span>{" "}
                    once (creates <span className="font-mono">.venv-pcbflow</span>{" "}
                    with pcbflow from GitHub + shapely≥2.0.1). The app uses that
                    Python automatically unless{" "}
                    <span className="font-mono">NODE0_PYTHON</span> is set. Runs
                    AI-generated code locally (trusted environments only).
                  </p>
                  <fieldset className="mt-4 space-y-3">
                    <legend className="sr-only">PCB engine</legend>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/[0.14]">
                      <input
                        type="radio"
                        name="pcb-engine"
                        className="mt-1"
                        checked={pcbEngine === "pcbflow"}
                        onChange={() => {
                          setPcbEngine("pcbflow");
                          try {
                            localStorage.setItem(
                              PCB_ENGINE_STORAGE_KEY,
                              "pcbflow",
                            );
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-200">
                          PCBFlow
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                          OpenAI synthesizes a pcbflow script; the server runs it
                          with <span className="font-mono">.venv-pcbflow</span>{" "}
                          if present, else{" "}
                          <span className="font-mono">NODE0_PYTHON</span> or{" "}
                          <span className="font-mono">python3</span>.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                </div>

                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-5">
                  <h3 className="font-heading text-base font-semibold text-zinc-100">
                    CAD engine
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                    Select the CAD engine used to generate the 3D enclosure models.
                  </p>
                  <fieldset className="mt-4 space-y-3">
                    <legend className="sr-only">CAD engine</legend>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/[0.14]">
                      <input
                        type="radio"
                        name="cad-engine"
                        className="mt-1"
                        checked={cadEngine === "cadam"}
                        onChange={() => setCadEnginePersisted("cadam")}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-200">
                          CADAM (Legacy)
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                          The original biro-bun CAD synthesis engine.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/[0.14]">
                      <input
                        type="radio"
                        name="cad-engine"
                        className="mt-1"
                        checked={cadEngine === "cadium"}
                        onChange={() => setCadEnginePersisted("cadium")}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-200">
                          Cadium (Agentic)
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                          An agentic engine capable of parametric regex-based patch updates for lightning-fast edits.
                        </span>
                      </span>
                    </label>
                  </fieldset>
                </div>

                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
                  <h3 className="font-heading text-base font-semibold text-zinc-100">
                    Keyboard shortcuts
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-500">
                    <li className="flex flex-wrap gap-x-2">
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        Enter
                      </kbd>
                      sends a message
                    </li>
                    <li className="flex flex-wrap gap-x-2">
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        Shift
                      </kbd>
                      + <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">Enter</kbd>{" "}
                      adds a newline
                    </li>
                    <li className="flex flex-wrap gap-x-2">
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        ArrowLeft
                      </kbd>
                      /{" "}
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        ArrowRight
                      </kbd>
                      navigates the tool rail
                    </li>
                    <li className="flex flex-wrap gap-x-2">
                      Focus the chat resize handle and use{" "}
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        ArrowLeft
                      </kbd>
                      /{" "}
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        ArrowRight
                      </kbd>{" "}
                      to adjust chat width
                    </li>
                    <li className="flex flex-wrap gap-x-2">
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        Ctrl
                      </kbd>{" "}
                      /{" "}
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        Cmd
                      </kbd>{" "}
                      +{" "}
                      <kbd className="rounded border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 text-xs text-zinc-300">
                        Enter
                      </kbd>{" "}
                      applies JSON definitions in technical mode
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          </motion.div>
        </main>
      </div>

      {!activeId ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-28 bg-gradient-to-t from-[#070709] via-[#070709]/72 to-transparent"
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.35rem,calc(env(safe-area-inset-bottom)+1rem))] pt-4">
            <div className="pointer-events-auto w-full max-w-md sm:max-w-lg">
              <Dock items={dockItems} activeLabel={dockActiveLabel} />
            </div>
          </div>
        </>
      ) : null}

      <Dialog.Root open={teamOpen} onOpenChange={setTeamOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[201] h-[min(88vh,52rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-0 shadow-xl focus:outline-none",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <Dialog.Title className="sr-only">Team collaboration</Dialog.Title>
            <Dialog.Description className="sr-only">
              Invite and manage team access for this project.
            </Dialog.Description>
            <CollabPanel
              projectId={activeId}
              projectName={activeProject?.name}
              className="h-full"
              onTeamAssigned={(teamId) => {
                setWs((cur) => {
                  const next: MockWorkspaceState = {
                    ...cur,
                    projects: cur.projects.map((p) =>
                      p.id === activeId ? { ...p, teamId, updatedAt: Date.now() } : p,
                    ),
                  };
                  writeWorkspace(next);
                  return next;
                });
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 focus:outline-none",
              dialogSurface,
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold text-zinc-100">
                Name this board
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Creates a blank thread you can open from Projects.
            </Dialog.Description>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createProject();
              }}
              placeholder="e.g. USB-C PD bench"
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={createProject}
                disabled={!newName.trim()}
                className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
              >
                Open
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setRenameTargetId(null);
            setRenameName("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 focus:outline-none",
              dialogSurface,
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold text-zinc-100">
                Rename board
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Updates the board name.
            </Dialog.Description>
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyRenameProject();
              }}
              placeholder="e.g. USB-C PD bench"
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={applyRenameProject}
                disabled={!renameTargetId || !renameName.trim()}
                className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTargetId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 focus:outline-none",
              dialogSurface,
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold text-zinc-100">
                Delete board?
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              This removes the board and its chat thread from your workspace.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={applyDeleteProject}
                disabled={!deleteTargetId}
                className="rounded-lg bg-zinc-100 px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
