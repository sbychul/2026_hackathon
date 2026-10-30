export interface OcrBox { x: number; y: number; width: number; height: number }
export interface OcrLine { text: string; confidence: number; box: OcrBox }
export interface ModelDownload { name: string; label: string; loaded: number; total: number }
export interface OcrProgress { stage: 'inspect' | 'text' | 'models' | 'detect' | 'recognize'; completed: number; total: number; downloads?: ModelDownload[]; modelsReady?: boolean }
export type WorkerReply = { kind: 'progress'; progress: OcrProgress }
  | { kind: 'result'; lines: OcrLine[] }
  | { kind: 'error'; message: string }
