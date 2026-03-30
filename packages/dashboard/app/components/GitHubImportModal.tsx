import { useState, useEffect, useCallback, useRef } from "react";
import type { Task } from "@kb/core";
import { apiFetchGitHubIssues, apiImportGitHubIssue, fetchGitRemotes, type GitHubIssue, type GitRemote } from "../api";
import { Loader2 } from "lucide-react";

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (task: Task) => void;
  tasks: Task[];
}

export function GitHubImportModal({ isOpen, onClose, onImport, tasks }: GitHubImportModalProps) {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [labels, setLabels] = useState("");
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Git remotes state
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [loadingRemotes, setLoadingRemotes] = useState(false);
  const [selectedRemoteName, setSelectedRemoteName] = useState<string>("");
  const mountedRef = useRef(false);

  // Build set of already imported URLs from existing tasks
  const importedUrls = new Set<string>();
  for (const task of tasks) {
    const match = task.description.match(/Source: (https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+)/);
    if (match) {
      importedUrls.add(match[1]);
    }
  }

  // Reset state when modal opens and fetch remotes
  useEffect(() => {
    if (isOpen) {
      setOwner("");
      setRepo("");
      setLabels("");
      setIssues([]);
      setSelectedIssueNumber(null);
      setError(null);
      setImporting(false);
      setRemotes([]);
      setLoadingRemotes(true);
      setSelectedRemoteName("");

      mountedRef.current = true;

      // Fetch git remotes
      fetchGitRemotes()
        .then((fetchedRemotes) => {
          if (!mountedRef.current) return;

          setRemotes(fetchedRemotes);
          setLoadingRemotes(false);

          // Auto-populate if exactly one remote and fields are empty
          if (fetchedRemotes.length === 1) {
            const remote = fetchedRemotes[0];
            setOwner(remote.owner);
            setRepo(remote.repo);
            setSelectedRemoteName(remote.name);
          }
        })
        .catch(() => {
          // Silently fail - manual input remains available
          if (mountedRef.current) {
            setLoadingRemotes(false);
          }
        });

      return () => {
        mountedRef.current = false;
      };
    }
  }, [isOpen]);

  // Handle remote selection change
  const handleRemoteChange = useCallback((remoteName: string) => {
    setSelectedRemoteName(remoteName);
    if (remoteName === "") {
      // Manual mode - clear fields
      setOwner("");
      setRepo("");
    } else {
      const remote = remotes.find((r) => r.name === remoteName);
      if (remote) {
        setOwner(remote.owner);
        setRepo(remote.repo);
      }
    }
  }, [remotes]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const handleLoad = useCallback(async () => {
    if (!owner.trim() || !repo.trim()) {
      setError("Owner and repo are required");
      return;
    }

    setLoading(true);
    setError(null);
    setIssues([]);
    setSelectedIssueNumber(null);

    try {
      const labelArray = labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      const fetchedIssues = await apiFetchGitHubIssues(owner.trim(), repo.trim(), 30, labelArray.length > 0 ? labelArray : undefined);
      setIssues(fetchedIssues);
      if (fetchedIssues.length === 0) {
        setError("No open issues found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch issues");
    } finally {
      setLoading(false);
    }
  }, [owner, repo, labels]);

  const handleImport = useCallback(async () => {
    if (selectedIssueNumber === null) return;

    setImporting(true);
    setError(null);

    try {
      const task = await apiImportGitHubIssue(owner.trim(), repo.trim(), selectedIssueNumber);
      onImport(task);
      onClose();
    } catch (err: any) {
      if (err.message?.includes("already imported")) {
        setError(err.message);
      } else {
        setError(err.message || "Failed to import issue");
      }
    } finally {
      setImporting(false);
    }
  }, [selectedIssueNumber, owner, repo, onImport, onClose]);

  const selectedIssue = issues.find((i) => i.number === selectedIssueNumber);

  if (!isOpen) return null;

  // Determine if we should show the remote dropdown
  const showRemoteDropdown = remotes.length > 1 || (remotes.length === 1 && !loadingRemotes);
  const hasRemotes = remotes.length > 0;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Import from GitHub</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Remote Selection Dropdown */}
          {(showRemoteDropdown || loadingRemotes) && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="gh-remote">
                  Repository
                  {loadingRemotes && <Loader2 size={12} className="spin" style={{ marginLeft: 8, display: "inline" }} />}
                </label>
                <select
                  id="gh-remote"
                  value={selectedRemoteName}
                  onChange={(e) => handleRemoteChange(e.target.value)}
                  disabled={loadingRemotes || loading || importing}
                >
                  {hasRemotes && <option value="">Select a remote...</option>}
                  {loadingRemotes && <option value="">Loading remotes...</option>}
                  {!hasRemotes && !loadingRemotes && <option value="">No GitHub remotes detected</option>}
                  {remotes.map((remote) => (
                    <option key={remote.name} value={remote.name}>
                      {remote.name} ({remote.owner}/{remote.repo})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Form Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="gh-owner">Owner</label>
              <input
                id="gh-owner"
                type="text"
                placeholder="e.g. dustinbyrne"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                disabled={loading || importing}
              />
            </div>
            <div className="form-group">
              <label htmlFor="gh-repo">Repo</label>
              <input
                id="gh-repo"
                type="text"
                placeholder="e.g. kb"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                disabled={loading || importing}
              />
            </div>
            <div className="form-group">
              <label htmlFor="gh-labels">Labels (optional)</label>
              <input
                id="gh-labels"
                type="text"
                placeholder="bug,enhancement"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                disabled={loading || importing}
              />
            </div>
            <div className="form-group form-group--action">
              <label>&nbsp;</label>
              <button className="btn btn-primary" onClick={handleLoad} disabled={loading || importing || !owner.trim() || !repo.trim()}>
                {loading ? <Loader2 size={14} className="spin" /> : "Load"}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && <div className="form-error">{error}</div>}

          {/* Issues List */}
          {issues.length > 0 && (
            <>
              <div className="issues-list">
                <h4>Found {issues.length} issues:</h4>
                {issues.map((issue) => {
                  const isImported = importedUrls.has(issue.html_url);
                  return (
                    <div
                      key={issue.number}
                      className={`issue-item ${selectedIssueNumber === issue.number ? "selected" : ""} ${isImported ? "imported" : ""}`}
                      onClick={() => !isImported && setSelectedIssueNumber(issue.number)}
                    >
                      <input
                        type="radio"
                        name="issue"
                        checked={selectedIssueNumber === issue.number}
                        onChange={() => setSelectedIssueNumber(issue.number)}
                        disabled={isImported}
                      />
                      <span className="issue-number">#{issue.number}</span>
                      <span className="issue-title">{issue.title}</span>
                      {issue.labels.length > 0 && (
                        <span className="issue-labels">
                          {issue.labels.map((l) => (
                            <span key={l.name} className="label-chip">
                              {l.name}
                            </span>
                          ))}
                        </span>
                      )}
                      {isImported && <span className="imported-badge">Imported</span>}
                    </div>
                  );
                })}
              </div>

              {/* Preview */}
              {selectedIssue && (
                <div className="issue-preview">
                  <h4>Preview</h4>
                  <div className="preview-title">{selectedIssue.title}</div>
                  <div className="preview-body">
                    {selectedIssue.body
                      ? selectedIssue.body.slice(0, 200) + (selectedIssue.body.length > 200 ? "…" : "")
                      : "(no description)"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={selectedIssueNumber === null || importing}
          >
            {importing ? <Loader2 size={14} className="spin" /> : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
