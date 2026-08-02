/**
 * Codex backend powered by `codex app-server` over stdio JSONL.
 *
 * The app-server thread id is persisted as sdkSessionId, so CA sessions can
 * resume and fork without translating their conversation history.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent } from '@craft-agent/core/types';
import type { FileAttachment } from '../utils/files.ts';
import { BaseAgent } from './base-agent.ts';
import { AbortReason, type BackendConfig, type ChatOptions } from './backend/types.ts';
import { EventQueue } from './backend/event-queue.ts';
import { getBackendRuntime } from './backend/internal/driver-types.ts';
import { getCredentialManager } from '../credentials/manager.ts';
import type { LLMQueryRequest, LLMQueryResult } from './llm-tool.ts';
import { getSessionPath, getSessionPlansPath } from '../sessions/storage.ts';
import { getSessionScopedToolCallbacks } from './session-scoped-tools.ts';
import { executeBrowserToolCommand } from './browser-tool-runtime.ts';
import { saveBinaryResponse } from '../utils/binary-detection.ts';
import { normalizeCodexModelId } from './runtime-types.ts';
import {
  getSessionToolRegistry,
  errorResponse,
  type SessionToolContext,
  type ToolResult,
} from '@craft-agent/session-tools-core';
import { attachSessionSelfManagementBindings } from './session-self-management-bindings.ts';

type JsonObject = Record<string, unknown>;
type RpcId = string | number;
const CODEX_RESUME_TIMEOUT_MS = 3_000;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' ? value as JsonObject : {};
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<RpcId, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
  }>();
  onMessage: ((message: JsonObject) => void) | null = null;
  onExit: ((error: Error) => void) | null = null;

  constructor(
    private readonly executable: string,
    private readonly args: string[],
    private readonly env: NodeJS.ProcessEnv,
    private readonly cwd: string,
  ) {}

  async start(): Promise<void> {
    if (this.process) return;
    const child = spawn(this.executable, ['app-server', '--stdio', ...this.args], {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    createInterface({ input: child.stdout }).on('line', line => {
      if (!line.trim()) return;
      try {
        const message = JSON.parse(line) as JsonObject;
        const id = message.id as RpcId | undefined;
        if (id !== undefined && ('result' in message || 'error' in message)) {
          const waiter = this.pending.get(id);
          if (waiter) {
            this.pending.delete(id);
            if (waiter.timer) clearTimeout(waiter.timer);
            if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
            else waiter.resolve(message.result);
            return;
          }
        }
        this.onMessage?.(message);
      } catch {
        // app-server stdout is specified as JSONL; ignore a malformed diagnostic line.
      }
    });
    child.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) console.warn(`[Codex app-server] ${text}`);
    });
    child.once('error', error => this.failAll(error));
    child.once('exit', (code, signal) => {
      const error = new Error(`Codex app-server exited (${code ?? signal ?? 'unknown'})`);
      this.failAll(error);
      this.onExit?.(error);
      this.process = null;
    });

    await this.request('initialize', {
      clientInfo: { name: 'craft-agent', title: 'Craft Agent', version: '1.0.0' },
      capabilities: null,
    });
    this.notify('initialized');
  }

  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const waiter: {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer?: ReturnType<typeof setTimeout>;
      } = { resolve, reject };
      if (timeoutMs) {
        waiter.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.pending.set(id, waiter);
      this.write({ method, id, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  respond(id: RpcId, result: unknown): void {
    this.write({ id, result });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }

  private write(message: JsonObject): void {
    if (!this.process?.stdin.writable) throw new Error('Codex app-server is not running');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failAll(error: Error): void {
    for (const waiter of this.pending.values()) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }
}

export class CodexAgent extends BaseAgent {
  protected backendName = 'Codex';
  private client: CodexAppServerClient | null = null;
  private queue = new EventQueue();
  private processing = false;
  private threadId: string | null = null;
  private turnId: string | null = null;
  private pendingApprovals = new Map<string, { rpcId: RpcId; method: string }>();
  private completedText = new Map<string, string>();
  private lastErrorMessage: string | null = null;
  private callbackServer: HttpServer | null = null;
  private callbackPort = 0;

  constructor(config: BackendConfig) {
    super({ ...config, model: config.model ? normalizeCodexModelId(config.model) : config.model }, 'deepseek-v4-flash');
  }

  private async createClient(): Promise<CodexAppServerClient> {
    await this.ensureCallbackServer();
    const runtime = getBackendRuntime(this.config);
    const connectionSlug = this.config.connectionSlug;
    const apiKey = connectionSlug
      ? await getCredentialManager().getLlmApiKey(connectionSlug)
      : null;
    const baseUrl = typeof runtime.baseUrl === 'string' && runtime.baseUrl.trim()
      ? runtime.baseUrl.trim()
      : runtime.piAuthProvider === 'deepseek'
        ? 'https://api.deepseek.com'
        : undefined;

    const args = [
      '-c', 'model_provider="craft_agent"',
      '-c', `model=${tomlString(this._model)}`,
      '-c', 'model_providers.craft_agent.name="Craft Agent"',
      '-c', 'model_providers.craft_agent.env_key="CRAFT_CODEX_API_KEY"',
      '-c', 'model_providers.craft_agent.wire_api="responses"',
      '-c', 'model_providers.craft_agent.requires_openai_auth=false',
    ];
    if (baseUrl) args.push('-c', `model_providers.craft_agent.base_url=${tomlString(baseUrl)}`);
    if (this.config.poolServerUrl) {
      args.push('-c', `mcp_servers.sources.url=${tomlString(this.config.poolServerUrl)}`);
    }
    const paths = asObject(runtime.paths);
    const sessionServer = typeof paths.sessionServer === 'string' ? paths.sessionServer : undefined;
    const nodeRuntime = typeof paths.node === 'string' ? paths.node : undefined;
    if (sessionServer && nodeRuntime) {
      const sessionArgs = [
        sessionServer,
        '--session-id', this._sessionId,
        '--workspace-root', this.config.workspace.rootPath,
        '--plans-folder', getSessionPlansPath(this.config.workspace.rootPath, this._sessionId),
        '--working-directory', this.workingDirectory,
        '--callback-port', String(this.callbackPort),
      ];
      args.push(
        '-c', `mcp_servers.session.command=${tomlString(nodeRuntime)}`,
        '-c', `mcp_servers.session.args=${JSON.stringify(sessionArgs)}`,
      );
    }

    const codexExecutable = process.env.CRAFT_CODEX_PATH?.trim()
      || (typeof paths.codexCli === 'string' ? paths.codexCli : 'codex');
    const codexHome = join(this.config.workspace.rootPath, '..', '..', 'codex-app-server');
    mkdirSync(codexHome, { recursive: true });
    const client = new CodexAppServerClient(codexExecutable, args, {
      ...process.env,
      ...this.config.envOverrides,
      CODEX_HOME: codexHome,
      ...(apiKey ? { CRAFT_CODEX_API_KEY: apiKey } : {}),
    }, this.workingDirectory);
    await client.start();
    return client;
  }

  private async ensureCallbackServer(): Promise<void> {
    if (this.callbackServer) return;
    this.callbackServer = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = asObject(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        let result: unknown;
        if (req.url === '/call-llm') {
          result = await this.preExecuteCallLlm(body);
        } else if (req.url === '/spawn-session') {
          result = await this.preExecuteSpawnSession(body);
        } else if (req.url === '/browser-tool') {
          result = await this.executeBrowserTool(body);
        } else if (req.url === '/session-tool') {
          result = await this.executeSessionTool(body);
        } else {
          res.statusCode = 404;
          result = { error: 'Unknown callback endpoint' };
        }
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.callbackServer!.once('error', reject);
      this.callbackServer!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.callbackServer.address();
    this.callbackPort = typeof address === 'object' && address ? address.port : 0;
  }

  private async executeSessionTool(body: JsonObject): Promise<ToolResult> {
    const name = typeof body.name === 'string' ? body.name : '';
    const definition = getSessionToolRegistry().get(name);
    if (!definition?.handler) return errorResponse(`Unknown session tool: ${name || '(missing)'}`);

    const context = { sessionId: this._sessionId } as SessionToolContext;
    attachSessionSelfManagementBindings(context, this._sessionId);
    return definition.handler(context, asObject(body.arguments));
  }

  private async executeBrowserTool(args: JsonObject): Promise<{ content?: string; error?: string }> {
    const browserFns = getSessionScopedToolCallbacks(this._sessionId)?.browserPaneFns;
    if (!browserFns) return { error: 'Browser window controls are not available.' };
    const result = await executeBrowserToolCommand({
      command: (args.command as string | string[]) ?? '',
      fns: browserFns,
      sessionId: this._sessionId,
    });
    let content = result.output;
    if (result.image) {
      const extension = result.image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const saved = saveBinaryResponse(
        getSessionPath(this.config.workspace.rootPath, this._sessionId),
        `browser-screenshot.${extension}`,
        Buffer.from(result.image.data, 'base64'),
        result.image.mimeType,
      );
      if (saved.type === 'file_download') content += `\n\nSaved screenshot: ${saved.path}`;
    }
    return { content };
  }

  private async ensureThread(): Promise<void> {
    if (!this.client) {
      this.client = await this.createClient();
      const client = this.client;
      client.onMessage = message => this.handleMessage(message);
      client.onExit = error => {
        if (this.client === client) {
          this.client = null;
          this.threadId = null;
        }
        if (!this.processing) return;
        this.queue.enqueue({ type: 'error', message: error.message });
        this.queue.complete();
      };
    }
    if (this.threadId) return;

    const existing = this.config.session?.sdkSessionId;
    const branchFrom = this.config.session?.branchFromSdkSessionId;
    let result: unknown;
    if (branchFrom) {
      result = await this.client.request('thread/fork', {
        threadId: branchFrom,
        lastTurnId: this.config.session?.branchFromSdkTurnId ?? null,
        model: this._model,
        cwd: this.workingDirectory,
        approvalPolicy: this.approvalPolicy(),
      });
    } else if (existing) {
      try {
        result = await this.client.request('thread/resume', {
          threadId: existing,
          model: this._model,
          cwd: this.workingDirectory,
          approvalPolicy: this.approvalPolicy(),
        }, CODEX_RESUME_TIMEOUT_MS);
      } catch (error) {
        console.warn(
          `[Codex] Could not resume thread ${existing}; starting a fresh thread instead: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.config.onSdkSessionIdCleared?.();
        result = await this.startThread();
      }
    } else {
      result = await this.startThread();
    }
    const thread = asObject(asObject(result).thread);
    this.threadId = typeof thread.id === 'string' ? thread.id : null;
    if (!this.threadId) throw new Error('Codex app-server did not return a thread id');
    this.config.onSdkSessionIdUpdate?.(this.threadId);
  }

  private startThread(): Promise<unknown> {
    return this.client!.request('thread/start', {
      model: this._model,
      modelProvider: 'craft_agent',
      cwd: this.workingDirectory,
      approvalPolicy: this.approvalPolicy(),
      sandbox: this.getPermissionMode() === 'allow-all' ? 'danger-full-access' : 'workspace-write',
    });
  }

  private approvalPolicy(): 'never' | 'on-request' {
    return this.getPermissionMode() === 'allow-all' ? 'never' : 'on-request';
  }

  protected async *chatImpl(message: string, attachments?: FileAttachment[], options?: ChatOptions): AsyncGenerator<AgentEvent> {
    await this.ensureThread();
    this.queue.reset();
    this.processing = true;
    this.completedText.clear();
    this.lastErrorMessage = null;
    const attachmentNote = attachments?.length
      ? `\n\nAttached files:\n${attachments.map(item => item.path).join('\n')}`
      : '';
    const effort = this.codexEffort(options?.thinkingOverride ?? this._thinkingLevel);
    try {
      const result = asObject(await this.client!.request('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text: `${message}${attachmentNote}` }],
        cwd: this.workingDirectory,
        model: this._model,
        ...(effort ? { effort } : {}),
        approvalPolicy: this.approvalPolicy(),
      }));
      this.turnId = typeof asObject(result.turn).id === 'string' ? asObject(result.turn).id as string : null;
      yield* this.queue.drain();
    } finally {
      this.processing = false;
      this.turnId = null;
    }
  }

  private handleMessage(message: JsonObject): void {
    const method = typeof message.method === 'string' ? message.method : '';
    const params = asObject(message.params);

    if (message.id !== undefined && (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval')) {
      const requestId = String(message.id);
      this.pendingApprovals.set(requestId, { rpcId: message.id as RpcId, method });
      const command = typeof params.command === 'string' ? params.command : undefined;
      this.onPermissionRequest?.({
        requestId,
        toolName: method.includes('fileChange') ? 'apply_patch' : 'Bash',
        command,
        description: typeof params.reason === 'string' ? params.reason : (command || 'Codex requests permission'),
        type: method.includes('fileChange') ? 'file_write' : 'bash',
      });
      return;
    }

    if (method === 'item/agentMessage/delta') {
      const delta = typeof params.delta === 'string' ? params.delta : '';
      if (delta) this.queue.enqueue({ type: 'text_delta', text: delta, turnId: String(params.turnId ?? '') || undefined });
      return;
    }
    if (method === 'item/started') {
      const item = asObject(params.item);
      const event = this.toolStartEvent(item, params);
      if (event) this.queue.enqueue(event);
      return;
    }
    if (method === 'item/completed') {
      const item = asObject(params.item);
      if (item.type === 'agentMessage' && typeof item.text === 'string') {
        const id = String(item.id ?? '');
        if (!this.completedText.has(id)) {
          this.completedText.set(id, item.text);
          this.queue.enqueue({ type: 'text_complete', text: item.text, turnId: String(params.turnId ?? '') || undefined });
        }
      } else {
        const event = this.toolResultEvent(item, params);
        if (event) this.queue.enqueue(event);
      }
      return;
    }
    if (method === 'error') {
      const error = asObject(params.error);
      const errorMessage = String(error.message ?? params.message ?? 'Codex app-server error');
      this.lastErrorMessage = errorMessage;
      this.queue.enqueue({ type: 'error', message: errorMessage });
      return;
    }
    if (method === 'turn/completed') {
      const turn = asObject(params.turn);
      if (turn.status === 'failed') {
        const errorMessage = String(asObject(turn.error).message ?? 'Codex turn failed');
        if (errorMessage !== this.lastErrorMessage) this.queue.enqueue({ type: 'error', message: errorMessage });
      }
      this.queue.enqueue({ type: 'complete' });
      this.queue.complete();
    }
  }

  private codexEffort(level: string): string | undefined {
    if (level === 'off') return undefined;
    return level === 'max' ? 'xhigh' : level;
  }

  private toolStartEvent(item: JsonObject, params: JsonObject): AgentEvent | null {
    const id = String(item.id ?? '');
    const turnId = String(params.turnId ?? '') || undefined;
    if (item.type === 'commandExecution') return { type: 'tool_start', toolName: 'Bash', toolUseId: id, input: { command: item.command }, turnId };
    if (item.type === 'fileChange') return { type: 'tool_start', toolName: 'apply_patch', toolUseId: id, input: { changes: item.changes }, turnId };
    if (item.type === 'mcpToolCall') return { type: 'tool_start', toolName: String(item.tool ?? 'mcp'), toolUseId: id, input: asObject(item.arguments), turnId };
    if (item.type === 'webSearch') return { type: 'tool_start', toolName: 'web_search', toolUseId: id, input: asObject(item.action), turnId };
    return null;
  }

  private toolResultEvent(item: JsonObject, params: JsonObject): AgentEvent | null {
    const id = String(item.id ?? '');
    const turnId = String(params.turnId ?? '') || undefined;
    if (item.type === 'commandExecution') return { type: 'tool_result', toolName: 'Bash', toolUseId: id, result: String(item.aggregatedOutput ?? ''), isError: item.status === 'failed' || (typeof item.exitCode === 'number' && item.exitCode !== 0), turnId };
    if (item.type === 'fileChange') return { type: 'tool_result', toolName: 'apply_patch', toolUseId: id, result: JSON.stringify(item.changes ?? []), isError: item.status === 'failed', turnId };
    if (item.type === 'mcpToolCall') {
      const toolName = String(item.tool ?? 'mcp');
      if (!item.error && item.server === 'session') this.handleSessionMcpToolCompletion(toolName, asObject(item.arguments));
      return { type: 'tool_result', toolName, toolUseId: id, result: JSON.stringify(item.result ?? item.error ?? ''), isError: !!item.error, turnId };
    }
    if (item.type === 'webSearch') return { type: 'tool_result', toolName: 'web_search', toolUseId: id, result: JSON.stringify(item.action ?? ''), isError: false, turnId };
    return null;
  }

  async abort(): Promise<void> {
    if (this.client && this.threadId && this.turnId) {
      await this.client.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId }).catch(() => undefined);
    }
  }

  forceAbort(_reason: AbortReason): void {
    void this.abort();
  }

  redirect(message: string): boolean {
    if (!this.client || !this.threadId || !this.turnId) return false;
    void this.client.request('turn/steer', { threadId: this.threadId, turnId: this.turnId, input: [{ type: 'text', text: message }] });
    return true;
  }

  isProcessing(): boolean { return this.processing; }

  override getSessionId(): string | null { return this.threadId; }

  override setModel(model: string): void { super.setModel(normalizeCodexModelId(model)); }

  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending || !this.client) return;
    this.pendingApprovals.delete(requestId);
    const decision = allowed ? (alwaysAllow ? 'acceptForSession' : 'accept') : 'decline';
    this.client.respond(pending.rpcId, { decision });
  }

  async runMiniCompletion(prompt: string): Promise<string | null> {
    try { return (await this.queryLlm({ prompt })).text || null; } catch { return null; }
  }

  async queryLlm(request: LLMQueryRequest): Promise<LLMQueryResult> {
    const requestModel = normalizeCodexModelId(request.model || this._model);
    const client = await this.createClient();
    let text = '';
    let doneResolve!: () => void;
    let doneReject!: (error: Error) => void;
    const done = new Promise<void>((resolve, reject) => { doneResolve = resolve; doneReject = reject; });
    client.onMessage = message => {
      const params = asObject(message.params);
      if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') text += params.delta;
      if (message.method === 'turn/completed') doneResolve();
      if (message.method === 'error') doneReject(new Error(String(params.message ?? 'Codex query failed')));
    };
    client.onExit = doneReject;
    try {
      const started = asObject(await client.request('thread/start', {
        model: requestModel,
        modelProvider: 'craft_agent',
        cwd: this.workingDirectory,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
        ...(request.systemPrompt ? { baseInstructions: request.systemPrompt } : {}),
      }));
      const threadId = String(asObject(started.thread).id ?? '');
      await client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: request.prompt }],
        model: requestModel,
        outputSchema: request.outputSchema ?? null,
      });
      await done;
      return { text, model: requestModel };
    } finally {
      client.stop();
    }
  }

  async ensureBranchReady(): Promise<void> { await this.ensureThread(); }

  destroy(): void {
    this.client?.stop();
    this.client = null;
    this.callbackServer?.close();
    this.callbackServer = null;
    this.callbackPort = 0;
    super.destroy();
  }
}

export const CodexBackend = CodexAgent;
