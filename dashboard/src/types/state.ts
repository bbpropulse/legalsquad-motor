// state.json structure — matches Pipeline Runner output
export interface AgentDesk {
  col: number;
  row: number;
}

export type AgentStatus =
  | "idle"
  | "working"
  | "delivering"
  | "done"
  | "checkpoint";

export interface Agent {
  id: string;
  name: string;
  icon: string;
  status: AgentStatus;
  /** Frase curta do que o agente está fazendo agora (ex.: "pesquisando STJ"). Opcional. */
  activity?: string;
  desk: AgentDesk;
}

/** Entrada do feed de atividades (derivada das mudanças de estado). */
export interface FeedEntry {
  id: string;
  at: number;
  kind: "step" | "handoff" | "status";
  text: string;
}

export interface Handoff {
  from: string;
  to: string;
  message: string;
  completedAt: string;
}

export type SquadStatus =
  | "idle"
  | "running"
  | "completed"
  | "checkpoint"
  | "failed";

export interface SquadState {
  squad: string;
  status: SquadStatus;
  step: {
    current: number;
    total: number;
    label: string;
  };
  agents: Agent[];
  handoff: Handoff | null;
  startedAt: string | null;
  updatedAt: string;
  /** Definido pelo runner ao concluir/abortar (também copiado para o histórico). */
  completedAt?: string;
  failedAt?: string;
}

// Squad metadata from squad.yaml
export interface SquadInfo {
  code: string;
  name: string;
  description: string;
  icon: string;
  agents: string[]; // agent file paths
}

// WebSocket messages
export type WsMessage =
  | { type: "SNAPSHOT"; squads: SquadInfo[]; activeStates: Record<string, SquadState> }
  | { type: "SQUAD_UPDATE"; squad: string; state: SquadState }
  | { type: "SQUAD_INACTIVE"; squad: string };
