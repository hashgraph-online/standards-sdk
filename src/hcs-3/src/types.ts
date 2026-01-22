export type LoadType = 'script' | 'image' | 'video' | 'audio' | 'glb' | 'css';

export interface LoadQueueItem {
  element: HTMLElement;
  type: LoadType;
  order: number;
  resolve: () => void;
}

export interface HCSConfig {
  cdnUrl: string;
  network: string;
  retryAttempts: number;
  retryBackoff: number;
  debug: boolean;
  showLoadingIndicator: boolean;
  loadingCallbackName: string | null;
}

export interface HCSConfigMapping {
  hcsCdnUrl: keyof HCSConfig;
  hcsNetwork: keyof HCSConfig;
  hcsRetryAttempts: keyof HCSConfig;
  hcsRetryBackoff: keyof HCSConfig;
  hcsDebug: keyof HCSConfig;
  hcsShowLoadingIndicator: keyof HCSConfig;
  hcsLoadingCallbackName: keyof HCSConfig;
}

export interface HCSSDK {
  config: HCSConfig;
  configMapping: HCSConfigMapping;
  LoadedScripts: Record<string, string>;
  LoadedWasm: Record<string, WebAssembly.Instance>;
  LoadedImages: Record<string, string>;
  LoadedVideos: Record<string, string>;
  LoadedAudios: Record<string, HTMLAudioElement>;
  LoadedAudioUrls: Record<string, string>;
  LoadedGLBs: Record<string, string>;
  scriptLoadedEvent: Event;
  loadQueue: LoadQueueItem[];
  isProcessingQueue: boolean;

  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  loadConfigFromHTML(): void;
  updateLoadingStatus(id: string, status: string): void;
  fetchWithRetry(
    url: string,
    retries?: number,
    backoff?: number,
  ): Promise<Response>;
  retrieveHCS1Data(
    topicId: string,
    cdnUrl?: string,
    network?: string,
  ): Promise<Blob>;
  isDuplicate(topicId: string): boolean;
  loadScript(scriptElement: HTMLElement): Promise<void>;
  loadStylesheet(linkElement: HTMLElement): Promise<void>;
  loadImage(imageElement: HTMLElement): Promise<void>;
  loadMedia(videoElement: HTMLElement, mediaType: string): Promise<void>;
  loadGLB(glbElement: HTMLElement): Promise<void>;
  loadResource(
    element: HTMLElement,
    type: string,
    order: number,
  ): Promise<void>;
  processQueue(): Promise<void>;
  loadAndPlayAudio(topicId: string, autoplay?: boolean, volume?: number): void;
  playAudio(topicId: string, volume?: number): void;
  preloadAudio(topicId: string): Promise<string>;
  preloadImage(topicId: string): Promise<string>;
  pauseAudio(topicId: string): void;
  init(): Promise<void>;
}

export type HCSWindow = Window & { HCS: HCSSDK; HCSReady?: () => void };
