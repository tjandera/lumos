/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_AI?: string;
  readonly VITE_FEATURE_ROOM_PHOTO?: string;
  readonly VITE_AI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
