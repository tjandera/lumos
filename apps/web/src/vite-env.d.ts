/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_AI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
