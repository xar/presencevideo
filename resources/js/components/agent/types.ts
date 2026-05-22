export type ToolPayload = Record<string, unknown>;

export type ToolCall = {
    id?: string;
    tool_id?: string;
    tool_name?: string;
    arguments?: ToolPayload;
    reasoning_id?: string | null;
    timestamp?: number;
};

export type ToolResult = {
    id?: string;
    tool_id?: string;
    tool_name?: string;
    result?: unknown;
    successful?: boolean;
    error?: string | null;
    timestamp?: number;
};

export type ToolActivity = {
    id: string;
    name: string;
    arguments?: ToolPayload;
    result?: unknown;
    successful?: boolean;
    error?: string | null;
    status: 'running' | 'completed' | 'failed';
    timestamp?: number;
};

export type ChatMessage = {
    id: string;
    role: 'user' | 'assistant' | 'system' | string;
    content: string;
    tool_calls?: ToolCall[] | null;
    tool_results?: ToolResult[] | null;
    created_at: string;
};
