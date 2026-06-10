import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type BacklogItem,
  type CheckHistoryEntry,
  fetchBacklog,
  fetchChecks,
  fetchProjects,
  fetchReview,
  fetchState,
  type ProjectSummary,
  type ReviewPayload,
  type WorkflowState,
} from '../lib/api';

export type DashboardData = {
  projects: ProjectSummary[];
  selectedRoot: string | null;
  state: WorkflowState | null;
  checks: CheckHistoryEntry[];
  review: ReviewPayload | null;
  backlog: BacklogItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  selectProject: (root: string) => void;
};

export function useDashboardData(): DashboardData {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [state, setState] = useState<WorkflowState | null>(null);
  const [checks, setChecks] = useState<CheckHistoryEntry[]>([]);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  const selectProject = useCallback((root: string) => setSelectedRoot(root), []);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoading(true);
      setError(null);
      try {
        const nextProjects = await fetchProjects();
        if (cancelled) return;
        setProjects(nextProjects);
        setSelectedRoot((current) => current || nextProjects[0]?.root || null);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectData() {
      setLoading(true);
      setError(null);
      try {
        const [nextState, nextChecks, nextReview, nextBacklog] = await Promise.all([
          fetchState(selectedRoot),
          fetchChecks(selectedRoot),
          fetchReview(selectedRoot),
          fetchBacklog(selectedRoot),
        ]);
        if (cancelled) return;
        setState(nextState);
        setChecks(nextChecks);
        setReview(nextReview);
        setBacklog(nextBacklog);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProjectData();
    return () => {
      cancelled = true;
    };
  }, [selectedRoot, refreshToken]);

  return useMemo(() => ({
    projects,
    selectedRoot,
    state,
    checks,
    review,
    backlog,
    loading,
    error,
    refresh,
    selectProject,
  }), [projects, selectedRoot, state, checks, review, backlog, loading, error, refresh, selectProject]);
}
