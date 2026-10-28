export class SecretReference {
  constructor(public readonly secretName: string) {}
  toJSON() { return "***REDACTED***"; }
}

export class MissingVariableError extends Error {
  constructor(public readonly key: string) {
    super(`Missing variable reference: ${key}`);
    this.name = "MissingVariableError";
  }
}

export interface ExecutionMetadata {
  runId: string;
  tenantId: string;
  workflowVersionId: string;
  runMode?: string | undefined;
  workerId?: string | undefined;
}

export interface BrowserContextState {
  currentUrl?: string | undefined;
  pageTitle?: string | undefined;
  sessionId?: string | undefined;
  activeTabId?: string | undefined;
  pageCookies?: any[] | undefined;
  lastScreenshotUrl?: string | undefined;
  isRunning?: boolean | undefined;
  lastAction?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface DesktopContextState {
  activeProcessId?: number | undefined;
  activeWindowHandle?: string | undefined;
  activeWindowTitle?: string | undefined;
  activeApplication?: string | undefined;
  runningApps?: Array<{ pid: number; name: string; title: string }> | undefined;
  lastScreenshotUrl?: string | undefined;
  lastAction?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface FileContextState {
  lastOpenedFile?: string | undefined;
  lastSavedFile?: string | undefined;
  workingDirectory?: string | undefined;
  activeFiles?: string[] | undefined;
  recentFiles?: string[] | undefined;
}

export interface HumanInterventionState {
  underHumanControl?: boolean | undefined;
  interventionRequired?: boolean | undefined;
  triggeringStepId?: string | undefined;
  pausedAt?: string | undefined;
  lastTakeoverAt?: string | undefined;
  lastReleasedAt?: string | undefined;
  reason?: string | undefined;
  correctionsCount?: number | undefined;
}

export interface RuntimeContextState {
  inputs: Record<string, any>;
  variables: Record<string, any>;
  outputs: Record<string, any>;
  artifacts: Record<string, any>;
  executionMetadata: ExecutionMetadata;
  scopes: Array<Record<string, any>>;

  // Universal State Handoff Contract
  active_application?: string | undefined;
  active_window?: string | undefined;
  current_step?: string | undefined;
  browser_context?: BrowserContextState | undefined;
  desktop_context?: DesktopContextState | undefined;
  file_context?: FileContextState | undefined;
  checkpoints?: Record<string, any> | undefined;
  learned_context?: Record<string, any> | undefined;
  human_intervention_state?: HumanInterventionState | undefined;
}

export class RuntimeContext {
  private state: RuntimeContextState;

  constructor(initialState: RuntimeContextState) {
    // Deep clone the non-secret data, keep secrets as references if possible.
    this.state = {
      inputs: { ...initialState.inputs },
      variables: { ...initialState.variables },
      outputs: { ...initialState.outputs },
      artifacts: { ...initialState.artifacts },
      executionMetadata: { ...initialState.executionMetadata },
      scopes: initialState.scopes ? [...initialState.scopes] : [],
      active_application: initialState.active_application,
      active_window: initialState.active_window,
      current_step: initialState.current_step,
      browser_context: initialState.browser_context ? { ...initialState.browser_context } : {},
      desktop_context: initialState.desktop_context ? { ...initialState.desktop_context } : {},
      file_context: initialState.file_context ? { ...initialState.file_context } : {},
      checkpoints: initialState.checkpoints ? { ...initialState.checkpoints } : {},
      learned_context: initialState.learned_context ? { ...initialState.learned_context } : {},
      human_intervention_state: initialState.human_intervention_state ? { ...initialState.human_intervention_state } : {}
    };
  }

  public setActiveApplication(app: string, windowTitle?: string): void {
    this.state.active_application = app;
    if (windowTitle !== undefined) {
      this.state.active_window = windowTitle;
    }
    if (!this.state.desktop_context) this.state.desktop_context = {};
    this.state.desktop_context.activeApplication = app;
    if (windowTitle !== undefined) {
      this.state.desktop_context.activeWindowTitle = windowTitle;
    }
  }

  public getActiveApplication(): string | undefined {
    return this.state.active_application;
  }

  public getActiveWindow(): string | undefined {
    return this.state.active_window;
  }

  public updateBrowserContext(updates: Partial<BrowserContextState>): void {
    this.state.browser_context = {
      ...(this.state.browser_context || {}),
      ...updates
    };
  }

  public getBrowserContext(): BrowserContextState {
    return this.state.browser_context || {};
  }

  public updateDesktopContext(updates: Partial<DesktopContextState>): void {
    this.state.desktop_context = {
      ...(this.state.desktop_context || {}),
      ...updates
    };
    if (updates.activeApplication) {
      this.state.active_application = updates.activeApplication;
    }
    if (updates.activeWindowTitle) {
      this.state.active_window = updates.activeWindowTitle;
    }
  }

  public getDesktopContext(): DesktopContextState {
    return this.state.desktop_context || {};
  }

  public updateFileContext(updates: Partial<FileContextState>): void {
    this.state.file_context = {
      ...(this.state.file_context || {}),
      ...updates
    };
  }

  public getFileContext(): FileContextState {
    return this.state.file_context || {};
  }

  public recordHumanIntervention(intervention: Partial<HumanInterventionState>): void {
    this.state.human_intervention_state = {
      ...(this.state.human_intervention_state || {}),
      ...intervention
    };
  }

  public getHumanInterventionState(): HumanInterventionState {
    return this.state.human_intervention_state || {};
  }

  public get executionMetadata(): ExecutionMetadata {
    return this.state.executionMetadata;
  }

  public pushScope(scopeData: Record<string, any>) {
    this.state.scopes.push(scopeData);
  }

  public popScope() {
    this.state.scopes.pop();
  }

  public get(key: string): any {
    if (this.isUnsafeKey(key)) throw new Error(`Unsafe variable access: ${key}`);

    // Search scopes from innermost to outermost
    for (let i = this.state.scopes.length - 1; i >= 0; i--) {
      const scope = this.state.scopes[i]!;
      const baseKey = key.split('.')[0]!;
      if (baseKey in scope) {
        return this.resolvePath(scope, key);
      }
    }
    
    // Check top-level structures
    if (key.startsWith("inputs.")) return this.resolvePath(this.state.inputs, key.slice(7));
    if (key.startsWith("variables.")) return this.resolvePath(this.state.variables, key.slice(10));
    if (key.startsWith("artifacts.")) return this.resolvePath(this.state.artifacts, key.slice(10));
    if (key === "active_application") return this.state.active_application;
    if (key === "active_window") return this.state.active_window;
    if (key === "current_step") return this.state.current_step;
    if (key === "browser_context") return this.state.browser_context;
    if (key === "desktop_context") return this.state.desktop_context;
    if (key === "file_context") return this.state.file_context;
    if (key.startsWith("browser_context.")) return this.resolvePath(this.state.browser_context, key.slice(16));
    if (key.startsWith("desktop_context.")) return this.resolvePath(this.state.desktop_context, key.slice(16));
    if (key.startsWith("file_context.")) return this.resolvePath(this.state.file_context, key.slice(13));
    
    // Default to variables / inputs / outputs if no prefix
    const baseKey = key.split('.')[0]!;
    if (baseKey in this.state.variables) return this.resolvePath(this.state.variables, key);
    if (baseKey in this.state.inputs) return this.resolvePath(this.state.inputs, key);
    if (baseKey in this.state.outputs) return this.resolvePath(this.state.outputs, key);

    return undefined;
  }

  public set(key: string, value: any) {
    if (this.isUnsafeKey(key)) throw new Error(`Unsafe variable modification: ${key}`);

    if (key === "current_step") {
      this.state.current_step = value;
      this.state.variables[key] = value;
    } else if (key === "active_application") {
      this.state.active_application = value;
      this.state.variables[key] = value;
    } else if (key === "active_window") {
      this.state.active_window = value;
      this.state.variables[key] = value;
    } else if (key.startsWith("outputs.")) {
      this.state.outputs[key.slice(8)] = value;
    } else if (key.startsWith("artifacts.")) {
      this.state.artifacts[key.slice(10)] = value;
    } else if (key.startsWith("variables.")) {
      this.state.variables[key.slice(10)] = value;
    } else {
      this.state.variables[key] = value;
    }
  }

  private isUnsafeKey(key: string): boolean {
    const parts = key.split('.');
    return parts.some(p => p === "__proto__" || p === "constructor" || p === "prototype");
  }

  private resolvePath(obj: any, path: string): any {
    if (this.isUnsafeKey(path)) throw new Error(`Unsafe variable access: ${path}`);
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
        if (part === "extracted" || part === "value" || part === "text") {
          continue;
        }
      }
      current = current[part];
    }
    return current;
  }

  public getState(): RuntimeContextState {
    return this.state;
  }
}

export class VariableResolver {
  constructor(private context: RuntimeContext) {}

  public resolve(template: any): any {
    if (typeof template === "string") {
      const fullMatch = template.match(/^\{\{([a-zA-Z0-9_.]+)\}\}$/);
      if (fullMatch) {
        const key = fullMatch[1]!;
        if (key.startsWith("SECRET:")) {
          return new SecretReference(key.slice(7));
        }
        const val = this.context.get(key);
        if (val === undefined) {
          throw new MissingVariableError(key);
        }
        return val;
      }
      
      // Inline substitution for string templates (e.g. "Hello {{name}}")
      return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
        if (key.startsWith("SECRET:")) {
          return "***REDACTED***";
        }
        const val = this.context.get(key);
        if (val === undefined) {
          throw new MissingVariableError(key);
        }
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      });
    }

    if (Array.isArray(template)) {
      return template.map(t => this.resolve(t));
    }

    if (template !== null && typeof template === "object") {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(template)) {
        result[k] = this.resolve(v);
      }
      return result;
    }

    return template;
  }
}
