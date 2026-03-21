// LSP Client — 범용 Language Server Protocol 클라이언트 (stdio 통신)
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class LspClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private initialized = false;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private contentLength = -1;

  constructor(
    private command: string,
    private args: string[],
  ) {
    super();
  }

  async initialize(rootUri: string): Promise<void> {
    if (this.initialized) return;

    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '' },
    });

    // 부모 프로세스 종료를 막지 않도록 unref
    this.process.unref();
    (this.process.stdin as any)?.unref?.();
    (this.process.stdout as any)?.unref?.();
    (this.process.stderr as any)?.unref?.();

    this.process.stdout!.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
    this.process.on('exit', () => { this.initialized = false; this.process = null; });

    // initialize handshake
    const result = await this.request('initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: {},
          references: {},
          publishDiagnostics: {},
        },
      },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
    });

    this.notify('initialized', {});
    this.initialized = true;
    return result as void;
  }

  async request(method: string, params: object): Promise<unknown> {
    if (!this.process && method !== 'initialize') {
      throw new Error('LSP server not running');
    }

    const id = ++this.requestId;
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.send(message);

    const timeoutMs = method === 'initialize' ? 60000 : 30000;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }

  notify(method: string, params: object): void {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.send(message);
  }

  private send(message: string): void {
    const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
    this.process?.stdin?.write(header + message);
  }

  // JSON-RPC Content-Length 프로토콜 파싱
  private onData(data: string): void {
    this.buffer += data;

    while (true) {
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (Buffer.byteLength(this.buffer) < this.contentLength) return;

      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const msg = JSON.parse(body);
        if ('id' in msg && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        } else if (msg.method) {
          // notifications/diagnostics 등
          this.emit(msg.method, msg.params);
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  }

  // 파일 열기 알림 (LSP 도구 호출 전 필수)
  notifyDidOpen(uri: string, languageId: string, text: string): void {
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  isReady(): boolean {
    return this.initialized && this.process !== null;
  }

  shutdown(): void {
    if (this.process) {
      try {
        this.request('shutdown', {}).then(() => {
          this.notify('exit', {});
        }).catch(() => {
          this.process?.kill();
        });
      } catch {
        this.process.kill();
      }
    }
    this.initialized = false;
  }
}
