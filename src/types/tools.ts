export type ToolResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export type ToolHandlerMap = Record<string, ToolHandler>;

export function pickFields(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of allowed) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}
