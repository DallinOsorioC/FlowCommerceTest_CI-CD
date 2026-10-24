export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function retryDelayMs(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
