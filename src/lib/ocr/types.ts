export interface OcrBox { x: number; y: number; width: number; height: number }
export interface OcrLine { text: string; confidence: number; box: OcrBox }
export interface OcrProgress { stage: 'inspect' | 'text' | 'models' | 'detect' | 'recognize'; completed: number; total: number }
export type WorkerReply = { kind: 'progress'; progress: OcrProgress }
  | { kind: 'result'; lines: OcrLine[] }
  | { kind: 'error'; message: string }
