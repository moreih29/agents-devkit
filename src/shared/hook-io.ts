/** 훅 스크립트 공통 I/O: stdin JSON 읽기 + stdout JSON 응답 */

export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk: Buffer) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

export function respond(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj));
}

export function pass(): void {
  respond({ continue: true });
}
