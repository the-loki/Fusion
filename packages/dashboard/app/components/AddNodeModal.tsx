import { useCallback, useEffect, useMemo, useState } from "react";
import type { NodeProjectMappingInput, ProjectInfo } from "../api";
import { validateProjectPath } from "../utils/projectDetection";
import type { ToastType } from "../hooks/useToast";
import { useMobileScrollLock } from "../hooks/useMobileScrollLock";
import "./AddNodeModal.css";

export interface AddNodeInput {
  name: string;
  type: "local" | "remote";
  url?: string;
  apiKey?: string;
  maxConcurrent: number;
  projectMappings: NodeProjectMappingInput[];
  apiKeyMode?: "auto-generate" | "provide";
  extraClis?: Array<"claude-cli" | "droid-cli">;
  persistentStorage?: boolean;
  resourceSizing?: {
    cpus?: number;
    memoryMB?: number;
  };
  dockerAdvanced?: {
    host?: string;
    context?: string;
    tlsVerify?: boolean;
    envOverrides?: Record<string, string>;
    volumeMounts?: Array<{ hostPath: string; containerPath: string; mode: "ro" | "rw" }>;
  };
}

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: AddNodeInput) => Promise<void>;
  addToast: (message: string, type?: ToastType) => void;
  projects: ProjectInfo[];
}

interface FormErrors {
  name?: string;
  url?: string;
  maxConcurrent?: string;
  projectMappings: Record<string, string>;
}

const MAX_CONCURRENT_MIN = 1;
const MAX_CONCURRENT_MAX = 10;

function validateInput(input: AddNodeInput): FormErrors {
  const errors: FormErrors = { projectMappings: {} };

  if (!input.name.trim()) {
    errors.name = "Name is required";
  }

  if (input.type === "remote" && !input.url?.trim()) {
    errors.url = "URL is required for remote nodes";
  }

  if (!Number.isFinite(input.maxConcurrent) || input.maxConcurrent < MAX_CONCURRENT_MIN || input.maxConcurrent > MAX_CONCURRENT_MAX) {
    errors.maxConcurrent = `Concurrency must be between ${MAX_CONCURRENT_MIN} and ${MAX_CONCURRENT_MAX}`;
  }

  for (const mapping of input.projectMappings) {
    const validation = validateProjectPath(mapping.path);
    if (!validation.valid) {
      errors.projectMappings[mapping.projectId] = validation.error ?? "Path is invalid";
    }
  }

  return errors;
}

export function AddNodeModal({ isOpen, onClose, onSubmit, addToast, projects }: AddNodeModalProps) {
  useMobileScrollLock(isOpen);
  const [name, setName] = useState("");
  const [type, setType] = useState<"local" | "remote">("local");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(2);
  const [apiKeyMode, setApiKeyMode] = useState<"auto-generate" | "provide">("auto-generate");
  const [selectedProjectPaths, setSelectedProjectPaths] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FormErrors>({ projectMappings: {} });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setType("local");
    setUrl("");
    setApiKey("");
    setMaxConcurrent(2);
    setApiKeyMode("auto-generate");
    setSelectedProjectPaths({});
    setErrors({ projectMappings: {} });
    setIsSubmitting(false);
  }, []);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }, [isSubmitting, onClose, resetForm]);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, isOpen, resetForm]);

  const input = useMemo<AddNodeInput>(() => ({
    name: name.trim(),
    type,
    url: type === "remote" ? url.trim() || undefined : undefined,
    apiKey: type === "remote" && apiKeyMode === "provide" ? apiKey || undefined : undefined,
    maxConcurrent,
    apiKeyMode,
    projectMappings: Object.entries(selectedProjectPaths).map(([projectId, path]) => ({ projectId, path: path.trim() })),
  }), [apiKey, apiKeyMode, maxConcurrent, name, selectedProjectPaths, type, url]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    const validationErrors = validateInput(input);
    setErrors(validationErrors);

    if (
      validationErrors.name
      || validationErrors.url
      || validationErrors.maxConcurrent
      || Object.keys(validationErrors.projectMappings).length > 0
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(input);
      addToast(`Node "${input.name}" registered`, "success");
      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to register node";
      addToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [addToast, closeModal, input, isSubmitting, onSubmit]);

  const toggleProjectSelection = (project: ProjectInfo) => {
    setSelectedProjectPaths((current) => {
      if (project.id in current) {
        const { [project.id]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [project.id]: project.path };
    });
  };

  const updateProjectPath = (projectId: string, path: string) => {
    setSelectedProjectPaths((current) => ({ ...current, [projectId]: path }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay open" onClick={closeModal}>
      <div className="modal modal-md add-node-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add Node">
        <div className="modal-header">
          <h3>Add Node</h3>
          <button className="modal-close" onClick={closeModal} disabled={isSubmitting} aria-label="Close add node modal">
            &times;
          </button>
        </div>

        <div className="modal-body add-node-modal__body">
          <p className="add-node-modal__description">Register an existing Fusion node by providing its connection details and concurrency settings.</p>

          <label className="add-node-modal__field">
            <span>Name</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Build Machine"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name && <span className="form-error add-node-modal__error">{errors.name}</span>}
          </label>

          <div className="add-node-modal__type-toggle">
            <button
              type="button"
              className={`add-node-modal__type-btn ${type === "local" ? "active" : ""}`}
              data-type="local"
              onClick={() => setType("local")}
              disabled={isSubmitting}
              aria-pressed={type === "local"}
            >
              Local
            </button>
            <button
              type="button"
              className={`add-node-modal__type-btn ${type === "remote" ? "active" : ""}`}
              data-type="remote"
              onClick={() => setType("remote")}
              disabled={isSubmitting}
              aria-pressed={type === "remote"}
            >
              Remote
            </button>
          </div>

          {type === "remote" && (
            <div className="add-node-modal__remote-fields" data-testid="remote-fields-container" data-visible>
              <label className="add-node-modal__field">
                <span>Reachable URL / Hostname</span>
                <input
                  className="input"
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://node.example.com"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.url)}
                />
                {errors.url && <span className="form-error add-node-modal__error">{errors.url}</span>}
              </label>

              <label className="add-node-modal__field">
                <span>API Key Mode</span>
                <select
                  className="select"
                  value={apiKeyMode}
                  onChange={(event) => setApiKeyMode(event.target.value as "auto-generate" | "provide")}
                  disabled={isSubmitting}
                >
                  <option value="auto-generate">Auto-generate</option>
                  <option value="provide">Provide key manually</option>
                </select>
              </label>

              {apiKeyMode === "provide" && (
                <label className="add-node-modal__field">
                  <span>API Key</span>
                  <input
                    className="input"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Enter node API key"
                    disabled={isSubmitting}
                  />
                </label>
              )}
            </div>
          )}

          <label className="add-node-modal__field">
            <span>Max Concurrent</span>
            <input
              className="input"
              type="number"
              min={MAX_CONCURRENT_MIN}
              max={MAX_CONCURRENT_MAX}
              value={maxConcurrent}
              onChange={(event) => setMaxConcurrent(Number(event.target.value))}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.maxConcurrent)}
            />
            <span className="add-node-modal__hint">Max simultaneous task agents (1–10)</span>
            {errors.maxConcurrent && <span className="form-error add-node-modal__error">{errors.maxConcurrent}</span>}
          </label>

          <section className="add-node-modal__projects" aria-label="Project path mappings">
            <h4 className="add-node-modal__projects-title">Attach Existing Projects</h4>
            <p className="add-node-modal__hint">Select existing projects to run on this node and provide the node-specific absolute path for each one.</p>
            {projects.length === 0 ? (
              <p className="add-node-modal__hint">No projects are currently registered.</p>
            ) : (
              <div className="add-node-modal__project-list">
                {projects.map((project) => {
                  const selected = project.id in selectedProjectPaths;
                  const error = errors.projectMappings[project.id];
                  return (
                    <div key={project.id} className="card add-node-modal__project-card">
                      <label className="checkbox-label add-node-modal__project-toggle">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProjectSelection(project)}
                          disabled={isSubmitting}
                        />
                        <span>{project.name}</span>
                      </label>
                      {selected && (
                        <label className="add-node-modal__field">
                          <span>Path on this node</span>
                          <input
                            className="input"
                            type="text"
                            value={selectedProjectPaths[project.id] ?? ""}
                            onChange={(event) => updateProjectPath(project.id, event.target.value)}
                            disabled={isSubmitting}
                            placeholder="/absolute/path/to/project"
                            aria-invalid={Boolean(error)}
                          />
                          {error && <span className="form-error add-node-modal__error">{error}</span>}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>

        <div className="modal-actions">
          <button className="btn btn-sm" onClick={closeModal} disabled={isSubmitting}>Cancel</button>
          <button className="btn btn-primary btn-sm" data-testid="add-node-submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Node"}
          </button>
        </div>
      </div>
    </div>
  );
}
