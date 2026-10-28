export interface MCPConnectionConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}
export declare class MCPClient {
    private config;
    private name;
    private client;
    private transport;
    private isConnected;
    constructor(config: MCPConnectionConfig, name: string);
    connect(): Promise<void>;
    listTools(): Promise<{
        inputSchema: {
            [x: string]: unknown;
            type: "object";
            properties?: Record<string, object> | undefined;
            required?: string[] | undefined;
        };
        name: string;
        description?: string | undefined;
        outputSchema?: {
            [x: string]: unknown;
            type: "object";
            properties?: Record<string, object> | undefined;
            required?: string[] | undefined;
        } | undefined;
        annotations?: {
            title?: string | undefined;
            readOnlyHint?: boolean | undefined;
            destructiveHint?: boolean | undefined;
            idempotentHint?: boolean | undefined;
            openWorldHint?: boolean | undefined;
        } | undefined;
        execution?: {
            taskSupport?: "optional" | "required" | "forbidden" | undefined;
        } | undefined;
        _meta?: Record<string, unknown> | undefined;
        icons?: {
            src: string;
            mimeType?: string | undefined;
            sizes?: string[] | undefined;
            theme?: "light" | "dark" | undefined;
        }[] | undefined;
        title?: string | undefined;
    }[]>;
    callTool(toolName: string, args: Record<string, unknown>, timeoutMs?: number): Promise<any>;
    close(): Promise<void>;
}
