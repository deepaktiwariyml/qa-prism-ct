/** How a cell's dependencies are rendered into its manifest/build file. */
export interface DependencyRender {
  format: 'npm-json' | 'pip-lines' | 'maven-xml';
  token: string;
}

/** Shape of a stack cell's manifest.json */
export interface Manifest {
  id: string;
  supports: {
    platforms: string[];
    language: string;
    framework: string;
    reporters: string[];
  };
  variables: Record<string, { type: string; default: string }>;
  dependencyRender: DependencyRender;
  dependencies: Record<string, string>;
  reporterDependencies: Record<string, Record<string, string>>;
  /** Arbitrary template tokens supplied per reporter (e.g. a config snippet). */
  reporterTokens: Record<string, Record<string, string>>;
  files: string;
  partials: string[];
  postGenerate: string[];
  /** Human note shown after generation (e.g. build prerequisites). */
  notes?: string;
}

/** Master registry index */
export interface RegistryIndex {
  cells: Array<{
    id: string;
    framework: string;
    language: string;
    platforms: string[];
    reporters: string[];
    path: string;
  }>;
}

/** A user's resolved selection from the configurator dropdowns */
export interface Selection {
  platform: string;
  language: string;
  framework: string;
  reporter: string;
  projectName?: string;
  webBaseUrl?: string;
  apiBaseUrl?: string;
}

/** Result of resolving a selection against the registry */
export interface ResolveResult {
  matched: boolean;
  manifest?: Manifest;
  cellPath?: string;
  reason?: string;
}
