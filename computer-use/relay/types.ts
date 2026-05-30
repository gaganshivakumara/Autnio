export type RelayInboundTask = {
  type: "task";
  taskId?: string;
  userId: string;
  sessionId?: string;
  task: string;
};

export type RelayOutboundOutput = {
  type: "output";
  taskId: string;
  sessionId?: string;
  data: string;
};

export type RelayOutboundDone = {
  type: "done";
  taskId: string;
  sessionId?: string;
  result?: string;
};

export type RelayOutboundError = {
  type: "error";
  taskId: string;
  sessionId?: string;
  message: string;
};

export type RelayOutboundMessage =
  | RelayOutboundOutput
  | RelayOutboundDone
  | RelayOutboundError;

export type RelayEvent =
  | { type: "status"; status: "connecting" | "connected" | "closed" | "error" }
  | { type: "log"; message: string }
  | { type: "taskStarted"; taskId: string }
  | { type: "taskOutput"; taskId: string; chunk: string }
  | { type: "taskDone"; taskId: string; result?: string }
  | { type: "taskError"; taskId: string; message: string };

export type RelayOptions = {
  wsEndpoint: string;
  idToken: string;
  oiEndpoint?: string;
  model?: string;
  onEvent?: (event: RelayEvent) => void;
};
