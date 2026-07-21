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

/**
 * state.json existe mas não pôde ser lido (JSON quebrado ou fora do contrato).
 * É o oposto de "não existe": ali há um squad que provavelmente está rodando,
 * e o dashboard precisa dizer isso em vez de mostrá-lo como inativo.
 */
export interface SquadStateError {
  /** Motivo legível — qual campo quebrou. */
  reason: string;
  /** ISO de quando o servidor detectou. */
  at: string;
}

// WebSocket messages
export type WsMessage =
  | {
      type: "SNAPSHOT";
      squads: SquadInfo[];
      activeStates: Record<string, SquadState>;
      invalidStates: Record<string, SquadStateError>;
    }
  | { type: "SQUAD_UPDATE"; squad: string; state: SquadState }
  | { type: "SQUAD_INVALID"; squad: string; error: SquadStateError }
  | { type: "SQUAD_INACTIVE"; squad: string };
