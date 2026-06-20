import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type BacklogItem,
  type CheckHistoryEntry,
  type DashboardEvent,
  type DashboardSummary,
  fetchBacklog,
  fetchChecks,
  fetchEvents,
  fetchReview,
  fetchState,
  fetchSummary,
  type ProjectSnapshot,
  type ProjectSummary,
  type ReviewPayload,
  type WorkflowState,
} from '../lib/api';

export const ALL_PROJECTS = '__all_projects__';

export type DashboardData = {
  projects: ProjectSummary[];
  selectedRoot: string;
  selectedProject: ProjectSummary | null;
  selectedSnapshot: ProjectSnapshot | null;
  summary: DashboardSummary | null;
  state: WorkflowState | null;
  checks: CheckHistoryEntry[];
  review: ReviewPayload | null;
  backlog: BacklogItem[];
  events: DashboardEvent[];
  eventsTruncated: boolean;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  detailError: string | null;
  refresh: () => void;
  selectProject: (root: string) => void;
};

export function useDashboardData(): DashboardData {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedRoot, setSelectedRoot] = useState<string>(ALL_PROJECTS);
  const [state, setState] = useState<WorkflowState | null>(null);
  const [checks, setChecks] = useState<CheckHistoryEntry[]>([]);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [eventsTruncated, setEventsTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  const selectProject = useCallback((root: string) => setSelectedRoot(root), []);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      setLoading(true);
      setError(null);
      try {
        const nextSummary = await fetchSummary();
        if (cancelled) return;
        setSummary(nextSummary);
        setSelectedRoot((current) => {
          if (current === ALL_PROJECTS) return current;
          return nextSummary.projects.some((project) => project.root === current)
            ? current
            : ALL_PROJECTS;
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectData() {
      if (!selectedRoot || selectedRoot === ALL_PROJECTS) {
        setState(null);
        setChecks([]);
        setReview(null);
        setBacklog([]);
        setEvents([]);
        setEventsTruncated(false);
        setDetailError(null);
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [nextState, nextChecks, nextReview, nextBacklog, nextEvents] = await Promise.all([
          fetchState(selectedRoot),
          fetchChecks(selectedRoot),
          fetchReview(selectedRoot),
          fetchBacklog(selectedRoot),
          fetchEvents(selectedRoot, 100),
        ]);
        if (cancelled) return;
        setState(nextState);
        setChecks(nextChecks);
        setReview(nextReview);
        setBacklog(nextBacklog);
        setEvents(nextEvents.events);
        setEventsTruncated(nextEvents.truncated);
      } catch (loadError) {
        if (!cancelled) setDetailError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadProjectData();
    return () => {
      cancelled = true;
    };
  }, [selectedRoot, refreshToken]);

  const projects = summary?.projects ?? [];
  const selectedProject = selectedRoot === ALL_PROJECTS
    ? null
    : projects.find((project) => project.root === selectedRoot) ?? null;
  const selectedSnapshot = selectedRoot === ALL_PROJECTS
    ? null
    : summary?.snapshots.find((snapshot) => snapshot.project.root === selectedRoot) ?? null;

  return useMemo(() => ({
    projects,
    selectedRoot,
    selectedProject,
    selectedSnapshot,
    summary,
    state,
    checks,
    review,
    backlog,
    events,
    eventsTruncated,
    loading,
    detailLoading,
    error,
    detailError,
    refresh,
    selectProject,
  }), [projects, selectedRoot, selectedProject, selectedSnapshot, summary, state, checks, review, backlog, events, eventsTruncated, loading, detailLoading, error, detailError, refresh, selectProject]);
}
