import { useEffect, useState, useCallback } from "react";
import { fetchTaskFileDiffs, type TaskFileDiff } from "../api";

interface UseChangedFilesResult {
  files: TaskFileDiff[];
  loading: boolean;
  error: string | null;
  selectedFile: TaskFileDiff | null;
  setSelectedFile: (file: TaskFileDiff) => void;
  resetSelection: () => void;
}

export function useChangedFiles(
  taskId: string,
  _worktree: string | undefined,
  column: string,
  projectId?: string,
): UseChangedFilesResult {
  const [files, setFiles] = useState<TaskFileDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<TaskFileDiff | null>(null);

  const canLoad = column === "in-progress" || column === "in-review" || column === "done";

  useEffect(() => {
    if (!taskId || !canLoad) {
      setFiles([]);
      setLoading(false);
      setError(null);
      setSelectedFile(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchTaskFileDiffs(taskId, projectId);
        if (cancelled) return;
        setFiles(result);
        setSelectedFile((current) => {
          if (result.length === 0) return null;
          if (current) {
            const match = result.find(
              (file) => file.path === current.path && file.oldPath === current.oldPath,
            );
            if (match) return match;
          }
          return null;
        });
      } catch (err) {
        if (cancelled) return;
        setFiles([]);
        setSelectedFile(null);
        setError(err instanceof Error ? err.message : "Failed to load changed files");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [taskId, column, projectId, canLoad]);

  const resetSelection = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return { files, loading, error, selectedFile, setSelectedFile, resetSelection };
}
