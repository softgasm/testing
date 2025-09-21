"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ExternalLink,
  Plus,
  Github,
  RefreshCw,
  Folder,
  GitBranch,
  Cloud,
  Container as ContainerIcon,
  CheckCircle,
  XCircle,
  Settings,
  Play,
  Edit,
  Eye,
  ChevronDown,
  Loader2,
  X,
} from "lucide-react";
import {
  useGitHubData,
  Repository,
  Workflow,
  Infrastructure,
  Container,
} from "../hooks/useGitHubData";
import WorkflowEditorModal from "../ui/WorkflowEditorModal";
import InfrastructureEditorModal from "../ui/InfrastructureEditorModal";
import ContainerEditorModal from "../ui/ContainerEditorModal";
import {
  getGitHubAppInstallUrl,
  checkGitHubAppInstallation,
} from "../../lib/github-app-client";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  repository?: string | null;
  status: string;
  managerDeviceUUID?: string;
  createdAt?: string;
  updatedAt?: string;
}

type TabType =
  | "projects"
  | "repositories"
  | "cicd"
  | "infrastructure"
  | "container";

const Projects: React.FC<{
  className?: string;
  onOpenWorkflowEditor?: () => void;
  onOpenInfrastructureEditor?: () => void;
  onOpenContainerEditor?: () => void;
}> = ({
  className = "",
  onOpenWorkflowEditor,
  onOpenInfrastructureEditor,
  onOpenContainerEditor,
}) => {
  const {
    repositories = [],
    workflows: remoteWorkflows = [],
    infrastructure: remoteInfrastructure = [],
    containers: remoteContainers = [],
    connectionStatus = { connected: false, user: null },
    refreshData: refreshGitHubData,
    loading: githubLoading,
  } = useGitHubData();

  // Local copies to support optimistic updates
  const [workflows, setWorkflows] = useState<Workflow[]>(remoteWorkflows);
  const [infrastructure, setInfrastructure] =
    useState<Infrastructure[]>(remoteInfrastructure);
  const [containers, setContainers] = useState<Container[]>(remoteContainers);

  // Keep local copies in sync when remote data updates
  useEffect(() => setWorkflows(remoteWorkflows), [remoteWorkflows]);
  useEffect(
    () => setInfrastructure(remoteInfrastructure),
    [remoteInfrastructure]
  );
  useEffect(() => setContainers(remoteContainers), [remoteContainers]);

  // refs to hold latest callbacks so toolbar event listeners can call them
  const refreshDataRef = useRef<((force?: boolean) => Promise<void>) | null>(
    null
  );
  const checkAppInstallationRef = useRef<(() => Promise<void>) | null>(null);

  // Optimistic update listener: when other parts of the app create files,
  // they dispatch `syncertica:github-item-created` with minimal detail.
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as
          | Record<string, unknown>
          | undefined;
        if (!detail || !detail.type) return;
        const t = String(detail.type);

        if (t === "workflow") {
          const newWorkflow: Workflow = {
            id: String(
              detail.id ||
                detail.path ||
                `${detail.repository}/${detail.filename}`
            ),
            name: String(
              detail.name || detail.filename || detail.path || "new-workflow"
            ),
            filename: String(detail.filename || detail.path || ""),
            path: String(detail.path || detail.filename || ""),
            state: "active",
            status: "",
            conclusion: "",
            html_url: "",
            repository: String(detail.repository || ""),
            updated_at: new Date().toISOString(),
          };
          // prepend if not exists
          setWorkflows((prev) => {
            const exists = prev.some(
              (w) => w.path === newWorkflow.path || w.id === newWorkflow.id
            );
            if (exists) return prev;
            return [newWorkflow, ...prev];
          });
        }

        if (t === "infrastructure") {
          const newInfra: Infrastructure = {
            id: String(
              detail.id || detail.path || `${detail.repository}/${detail.name}`
            ),
            name: String(detail.name || detail.path || "new-infra"),
            type: "",
            path: String(detail.path || ""),
            content: "",
            repository: String(detail.repository || ""),
          };
          setInfrastructure((prev) => {
            const exists = prev.some(
              (i) => i.path === newInfra.path || i.id === newInfra.id
            );
            if (exists) return prev;
            return [newInfra, ...prev];
          });
        }

        if (t === "container") {
          const newContainer: Container = {
            id: String(
              detail.id || detail.path || `${detail.repository}/${detail.name}`
            ),
            name: String(detail.name || detail.path || "new-container"),
            type: "",
            path: String(detail.path || ""),
            content: "",
            repository: String(detail.repository || ""),
          };
          setContainers((prev) => {
            const exists = prev.some(
              (c) => c.path === newContainer.path || c.id === newContainer.id
            );
            if (exists) return prev;
            return [newContainer, ...prev];
          });
        }
      } catch (err) {
        console.error(
          "Error handling optimistic github-item-created event:",
          err
        );
      }
    };

    window.addEventListener(
      "syncertica:github-item-created",
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "syncertica:github-item-created",
        handler as EventListener
      );
  }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("projects");

  // Projects state
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repository, setRepository] = useState("");
  const [status, setStatus] = useState("active");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingInstallation, setCheckingInstallation] =
    useState<boolean>(false);

  // Modal states
  // replaced by manageAccessRepo modal
  const [showContentViewer, setShowContentViewer] = useState<{
    type: "infrastructure" | "container";
    item: Infrastructure | Container;
  } | null>(null);
  const [runningWorkflow, setRunningWorkflow] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] =
    useState<Project | null>(null);
  const [showWorkflowEditor, setShowWorkflowEditor] = useState<{
    open: boolean;
    workflow?: Workflow | null;
  } | null>(null);
  const [showInfraEditor, setShowInfraEditor] = useState<{
    open: boolean;
    item?: Infrastructure | null;
  } | null>(null);
  const [showContainerEditor, setShowContainerEditor] = useState<{
    open: boolean;
    item?: Container | null;
  } | null>(null);
  const [manageAccessRepo, setManageAccessRepo] = useState<Repository | null>(
    null
  );
  type Collaborator = { id?: number; login: string };
  type Invitation = { id: number; invitee?: { login: string }; email?: string };
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingCollabs, setLoadingCollabs] = useState(false);
  type WorkerLite = {
    id: string;
    name: string;
    email: string;
    githubUsername?: string | null;
  };
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [showAddPersonDropdown, setShowAddPersonDropdown] = useState(false);
  const [showWorkerSelection, setShowWorkerSelection] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerLite | null>(null);
  const [usernameInput, setUsernameInput] = useState("");

  // Action handlers
  const handleRepoSettings = (repoId: string) => {
    const repo = repositories.find((r) => r.id === repoId) || null;
    if (repo) {
      setManageAccessRepo(repo);
      fetchCollaborators(repo.full_name);
    }
  };

  const handleRunWorkflow = async (workflow: Workflow) => {
    try {
      setRunningWorkflow(workflow.id);
      console.log("Attempting to run workflow:", workflow);

      // Check if this is a manually triggerable workflow
      if (
        !workflow.filename.includes(".yml") &&
        !workflow.filename.includes(".yaml")
      ) {
        alert(
          "This workflow file format is not supported for manual triggering."
        );
        return;
      }

      // GitHub API accepts either workflow filename or workflow ID
      // Try using filename first, then fall back to workflow_id if available
      let workflowIdentifier: string | number = workflow.filename;

      // If workflow_id exists (numeric ID from GitHub), prefer that
      if (workflow.workflow_id) {
        workflowIdentifier = workflow.workflow_id;
      }

      console.log(
        "Using workflow identifier:",
        workflowIdentifier,
        "for workflow:",
        workflow.name
      );

      // Try the simplified endpoint approach
      const response = await fetch("/api/github/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "trigger",
          workflowId: workflowIdentifier,
          filename: workflow.filename,
          repository: workflow.repository,
          ref: "main",
          inputs: {},
        }),
      });

      console.log("Response status:", response.status);
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      // try JSON first, fall back to text
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        try {
          payload = await response.text();
        } catch {
          payload = null;
        }
      }

      console.log("API Response payload:", payload);

      if (response.ok) {
        // success
        alert(
          `Workflow "${workflow.name}" has been triggered successfully! Check the Actions tab in GitHub to see the progress.`
        );
        await refreshData();
        return;
      }

      // Handle common GitHub errors with actionable messages
      if (response.status === 401) {
        alert(
          `Authentication failed (401): Bad credentials.\n\nAction: Ensure your GITHUB_TOKEN is set and valid in your environment (restart dev server after changes).`
        );
        return;
      }

      if (response.status === 403) {
        // Prefer to read message from payload.details or payload.message
        const errorObj = payload as { details?: string; message?: string };
        const ghMessage = errorObj?.details
          ? errorObj.details
          : errorObj?.message
          ? errorObj.message
          : JSON.stringify(payload);
        alert(
          `Permission denied (403): ${ghMessage}\n\nAction: The authenticated user needs admin or write rights on the target repository, or use a token with appropriate scopes (repo + workflow). If using a GitHub App, ensure it's installed on the repository with Actions/workflows write permission.`
        );
        return;
      }

      if (response.status === 404) {
        alert(
          `Not found (404): The workflow or repository could not be found.\n\nAction: Verify the repository and filename are correct and the workflow file exists.\nDetails: ${
            payload && typeof payload === "object"
              ? JSON.stringify(payload)
              : payload
          }`
        );
        return;
      }

      // Fallback: show the raw error payload
      alert(
        `Failed to run workflow: ${response.status} ${
          response.statusText
        }\n\nDetails: ${
          payload && typeof payload === "object"
            ? JSON.stringify(payload)
            : payload
        }`
      );
    } catch (error) {
      console.error("Error running workflow:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(
        `Failed to run workflow: ${errorMessage}\n\nNote: Only workflows with 'workflow_dispatch' trigger can be run manually.`
      );
    } finally {
      setRunningWorkflow(null);
    }
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setShowWorkflowEditor({ open: true, workflow });
  };

  const handleViewContent = (
    type: "infrastructure" | "container",
    item: Infrastructure | Container
  ) => {
    setShowContentViewer({ type, item });
  };

  const handleEditInfrastructure = (infra: Infrastructure) => {
    setShowInfraEditor({ open: true, item: infra });
  };

  const handleEditContainer = (container: Container) => {
    setShowContainerEditor({ open: true, item: container });
  };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjectsList(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error("Failed to fetch projects", err);
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAppInstallation = useCallback(async () => {
    setCheckingInstallation(true);
    try {
      const result = await checkGitHubAppInstallation();

      if (result.error) {
        console.warn("GitHub App installation check failed:", result.error);
        // If the error indicates all installations are claimed, show a user-friendly message
        if (result.error.includes("already claimed by other managers")) {
          console.warn("All GitHub App installations are claimed by other managers");
        }
        return;
      }

      // If we have installations but no persisted ID yet, try to persist it
      if (result.installed && result.installations.length > 0) {
        try {
          // Call our callback endpoint to ensure installation ID is persisted
          const installationId = result.installations[0].id;
          const persistResponse = await fetch("/api/github/app/callback", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installation_id: installationId }),
          });

          if (persistResponse.ok) {
            const persistResult = await persistResponse.json();
            if (persistResult.success) {
              console.log(`Successfully persisted installation ID ${installationId}`);
            }
          } else if (persistResponse.status === 409) {
            // Installation already persisted to another manager - check the error message
            const errorResult = await persistResponse.json();
            if (errorResult.error?.includes("already linked to another manager")) {
              console.warn("This GitHub App installation is already linked to another manager");
            } else {
              console.log("Installation ID already persisted for this manager");
            }
          } else {
            console.warn("Failed to persist installation ID:", persistResponse.status);
          }
        } catch (persistError) {
          console.error("Error persisting installation ID:", persistError);
          // Don't fail the whole check - just log the error
        }
      }
    } catch (error) {
      console.error("Error checking GitHub App installation:", error);
    } finally {
      setCheckingInstallation(false);
    }
  }, []);

  const createProject = async () => {
    if (!name) return alert("Project name is required");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          repository: repository || null,
          status,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created: Project = await res.json();
      setProjectsList((p) => [created, ...p]);
      setShowAdd(false);
      setName("");
      setDescription("");
      setRepository("");
      setStatus("active");
      try {
        window.dispatchEvent(
          new CustomEvent("syncertica:stats-changed", { detail: {} })
        );
      } catch (e) {
        console.debug("Could not dispatch stats-changed event:", e);
      }
    } catch (err) {
      console.error("Create project failed", err);
      alert("Failed to create project");
    }
  };

  const updateProject = async (projectId: string) => {
    if (!name) return alert("Project name is required");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          repository: repository || null,
          status,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: Project = await res.json();
      setProjectsList((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setShowAdd(false);
      setEditingProject(null);
      setName("");
      setDescription("");
      setRepository("");
      setStatus("active");
    } catch (err) {
      console.error("Update project failed", err);
      alert("Failed to update project");
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setProjectsList((prev) => prev.filter((p) => p.id !== projectId));
      setConfirmDeleteProject(null);
    } catch (err) {
      console.error("Delete project failed", err);
      alert("Failed to delete project");
    }
  };

  const fetchCollaborators = async (fullName: string) => {
    try {
      setLoadingCollabs(true);
      const res = await fetch(
        `/api/github/collaborators?repo=${encodeURIComponent(fullName)}`
      );
      if (res.ok) {
        const data = await res.json();
        setCollaborators(
          Array.isArray(data.collaborators) ? data.collaborators : []
        );
        setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
      } else {
        setCollaborators([]);
        setInvitations([]);
      }
    } finally {
      setLoadingCollabs(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) {
        const data = await res.json();
        const raw: unknown = data;
        const arr = Array.isArray(raw) ? raw : [];
        const mapped: WorkerLite[] = arr.reduce<WorkerLite[]>((acc, w) => {
          const ww = w as {
            id?: string;
            name?: string;
            email?: string;
            githubUsername?: string | null;
            github_username?: string | null;
          };
          if (!ww || !ww.id || !ww.name || !ww.email) return acc;
          const githubUsername =
            ww.githubUsername ?? ww.github_username ?? null;
          acc.push({
            id: ww.id,
            name: ww.name,
            email: ww.email,
            githubUsername,
          });
          return acc;
        }, []);
        setWorkers(mapped);
      }
    } finally {
    }
  };

  const addCollaborator = async ({
    repoFullName,
    username,
    email,
  }: {
    repoFullName: string;
    username?: string;
    email?: string;
  }) => {
    // check duplicates among collaborators or invitations
    const already =
      collaborators.some((c) => (username ? c.login === username : false)) ||
      invitations.some(
        (i) =>
          (username ? i.invitee?.login === username : false) ||
          (email ? i.email === email : false)
      );
    if (already) {
      alert(
        "This person is already a collaborator or has a pending invitation."
      );
      return;
    }
    const res = await fetch("/api/github/collaborators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repoFullName, username, email }),
    });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Failed to add collaborator: ${res.status} ${txt}`);
    }
    await fetchCollaborators(repoFullName);
  };

  const removeCollaborator = async ({
    repoFullName,
    username,
  }: {
    repoFullName: string;
    username: string;
  }) => {
    const res = await fetch("/api/github/collaborators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repoFullName, username }),
    });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Failed to remove collaborator: ${res.status} ${txt}`);
    }
    await fetchCollaborators(repoFullName);
  };

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchProjects();
      if (refreshGitHubData) {
        await refreshGitHubData();
      }
      // Also refresh GitHub App installation status
      await checkAppInstallation();
    } finally {
      setRefreshing(false);
    }
  }, [fetchProjects, refreshGitHubData, checkAppInstallation]);

  // keep refs up-to-date for external listeners
  useEffect(() => {
    refreshDataRef.current = refreshData;
    checkAppInstallationRef.current = checkAppInstallation;
  }, [refreshData, checkAppInstallation]);

  // Initial load: fetch projects and check app installation using stable callbacks
  useEffect(() => {
    (async () => {
      try {
        await refreshDataRef.current?.();
      } catch {
        // ignore
      }
    })();
  }, []);

  // Listen to toolbar actions so toolbar buttons can trigger project-level actions
  useEffect(() => {
    const onToolbarClick = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { toolName?: string }
        | undefined;
      const name = detail?.toolName || "";
      if (!name) return;
      const n = name.toLowerCase();
      if (n.includes("refresh")) {
        // Trigger Projects refresh with animation
        (async () => {
          setRefreshing(true);
          try {
            await refreshDataRef.current?.();
          } finally {
            setRefreshing(false);
          }
        })();
      }
      if (n.includes("disconnect")) {
        // When toolbar disconnect is clicked, re-check installation and refresh status
        (async () => {
          try {
            // Attempt to call the same disconnect flow the Projects UI uses
            await fetch("/api/status/github_status", {
              method: "DELETE",
              credentials: "include",
            });
          } catch {
            // ignore
          }
          // Give browser a moment then refresh project/github state
          setTimeout(() => {
            checkAppInstallationRef.current?.();
            // force a refresh to bypass cooldown so connection status updates immediately
            refreshDataRef.current?.(true);
          }, 200);
        })();
      }
    };

    const onToolbarDropdown = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { toolName?: string; itemLabel?: string }
        | undefined;
      const name = detail?.toolName || "";
      const label = detail?.itemLabel || "";
      const combined = `${name} ${label}`.toLowerCase();
      if (combined.includes("refresh")) {
        (async () => {
          setRefreshing(true);
          try {
            await refreshDataRef.current?.();
          } finally {
            setRefreshing(false);
          }
        })();
      }
      if (combined.includes("disconnect")) {
        (async () => {
          try {
            await fetch("/api/status/github_status", {
              method: "DELETE",
              credentials: "include",
            });
          } catch {}
          setTimeout(() => {
            checkAppInstallationRef.current?.();
            refreshDataRef.current?.(true);
          }, 200);
        })();
      }
    };

    window.addEventListener(
      "syncertica:toolbar-click",
      onToolbarClick as EventListener
    );
    window.addEventListener(
      "syncertica:toolbar-dropdown-click",
      onToolbarDropdown as EventListener
    );
    return () => {
      window.removeEventListener(
        "syncertica:toolbar-click",
        onToolbarClick as EventListener
      );
      window.removeEventListener(
        "syncertica:toolbar-dropdown-click",
        onToolbarDropdown as EventListener
      );
    };
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getTabClasses = (tab: TabType) => {
    return `py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
      activeTab === tab
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
    }`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Github className="w-8 h-8 text-gray-800" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
              <p className="text-gray-600">
                GitHub Integration & DevOps Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {connectionStatus.connected ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-green-700 font-medium">Connected</span>
                  {connectionStatus.user && (
                    <span className="text-gray-600">
                      as {connectionStatus.user.login}
                    </span>
                  )}
                  <button
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors ml-2"
                    onClick={() =>
                      (window.location.href = "/api/github/disconnect")
                    }
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-red-700 font-medium">
                    {checkingInstallation ? "Checking..." : "Not Connected"}
                  </span>
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors ml-2 disabled:opacity-50"
                    disabled={checkingInstallation}
                    onClick={() =>
                      window.open(getGitHubAppInstallUrl(), "_blank")
                    }
                  >
                    {checkingInstallation ? "Checking..." : "Connect"}
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={refreshData}
                disabled={refreshing || githubLoading}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                title={`Refresh all data: ${projectsList.length} projects, ${repositories.length} repos, ${workflows.length} workflows, ${infrastructure.length} infra, ${containers.length} containers`}
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    refreshing || githubLoading ? "animate-spin" : ""
                  }`}
                />
                {refreshing || githubLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("projects")}
            className={getTabClasses("projects")}
          >
            <Folder className="w-4 h-4" /> Projects ({projectsList.length})
          </button>
          <button
            onClick={() => setActiveTab("repositories")}
            className={getTabClasses("repositories")}
          >
            <Folder className="w-4 h-4" /> Repositories ({repositories.length})
          </button>
          <button
            onClick={() => setActiveTab("cicd")}
            className={getTabClasses("cicd")}
          >
            <GitBranch className="w-4 h-4" /> CI/CD ({workflows.length})
          </button>
          <button
            onClick={() => setActiveTab("infrastructure")}
            className={getTabClasses("infrastructure")}
          >
            <Cloud className="w-4 h-4" /> Infrastructure (
            {infrastructure.length})
          </button>
          <button
            onClick={() => setActiveTab("container")}
            className={getTabClasses("container")}
          >
            <ContainerIcon className="w-4 h-4" /> Container ({containers.length}
            )
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Projects Tab */}
        {activeTab === "projects" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Projects ({projectsList.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="w-4 h-4" /> Add Project
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Loading projects...</p>
              </div>
            ) : projectsList.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No projects yet</p>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 mx-auto"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="w-4 h-4" /> Create Your First Project
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {projectsList.map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Folder className="w-5 h-5 text-blue-500" />
                          <h4 className="font-medium text-gray-900">
                            {project.name}
                          </h4>
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              project.status === "active"
                                ? "bg-green-100 text-green-800"
                                : project.status === "on-hold"
                                ? "bg-yellow-100 text-yellow-800"
                                : project.status === "completed"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {project.status}
                          </span>
                        </div>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {project.description}
                          </p>
                        )}
                        {project.repository && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                            <Github className="w-3 h-3" />
                            <span>{project.repository}</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {project.createdAt && (
                            <span>Created {formatDate(project.createdAt)}</span>
                          )}
                          {project.updatedAt && (
                            <span>Updated {formatDate(project.updatedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                          title="Edit Project"
                          onClick={() => {
                            setEditingProject(project);
                            setShowAdd(true);
                            setName(project.name);
                            setDescription(project.description || "");
                            setRepository(project.repository || "");
                            setStatus(project.status || "active");
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete Project"
                          onClick={() => setConfirmDeleteProject(project)}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Repositories Tab */}
        {activeTab === "repositories" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Repositories ({repositories.length})
              </h3>
            </div>

            {repositories.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {connectionStatus.connected
                    ? "No repositories found"
                    : "Connect GitHub to view repositories"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {repositories.map((repo: Repository) => (
                  <div
                    key={repo.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Folder className="w-5 h-5 text-blue-500" />
                          <h4 className="font-medium text-gray-900">
                            {repo.name}
                          </h4>
                          {repo.private && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {repo.description || "No description"}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>{repo.language || "Unknown"}</span>
                          <span>⭐ {repo.stargazers_count}</span>
                          <span>🍴 {repo.forks_count}</span>
                          <span>Updated {formatDate(repo.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.open(repo.html_url, "_blank")}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="Manage access permissions"
                          onClick={() => handleRepoSettings(repo.id)}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CI/CD Tab */}
        {activeTab === "cicd" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Workflow Files ({workflows.length})
              </h3>
              <button
                onClick={() => onOpenWorkflowEditor && onOpenWorkflowEditor()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Workflow
              </button>
            </div>

            {workflows.length === 0 ? (
              <div className="text-center py-12">
                <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {connectionStatus.connected
                    ? "No workflow files found"
                    : "Connect GitHub to view workflows"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {workflows.map((workflow: Workflow) => {
                  // Debug log each workflow
                  console.log("Workflow data:", {
                    id: workflow.id,
                    name: workflow.name,
                    filename: workflow.filename,
                    workflow_id: workflow.workflow_id,
                    path: workflow.path,
                  });

                  return (
                    <div
                      key={String(
                        workflow.id ?? `${workflow.repository}/${workflow.path}`
                      )}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <GitBranch className="w-5 h-5 text-green-500" />
                            <h4 className="font-medium text-gray-900">
                              {workflow.filename || workflow.name}
                            </h4>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                              {workflow.state || workflow.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {workflow.repository} • {workflow.path}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>
                              Status: {workflow.conclusion || workflow.status}
                            </span>
                            <span>
                              Updated {formatDate(workflow.updated_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              window.open(workflow.html_url, "_blank")
                            }
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                            title="View on GitHub"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
                            title="Run Workflow"
                            onClick={() => handleRunWorkflow(workflow)}
                            disabled={runningWorkflow === workflow.id}
                          >
                            {runningWorkflow === workflow.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                            title="Edit Workflow"
                            onClick={() => handleEditWorkflow(workflow)}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Infrastructure Tab */}
        {activeTab === "infrastructure" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Infrastructure Files ({infrastructure.length})
              </h3>
              <button
                onClick={() => {
                  if (onOpenInfrastructureEditor) onOpenInfrastructureEditor();
                  else setShowInfraEditor({ open: true });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Infrastructure
              </button>
            </div>

            {infrastructure.length === 0 ? (
              <div className="text-center py-12">
                <Cloud className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {connectionStatus.connected
                    ? "No infrastructure files found"
                    : "Connect GitHub to view infrastructure files"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {infrastructure.map((infra: Infrastructure) => (
                  <div
                    key={String(
                      infra.id ?? `${infra.repository}/${infra.path}`
                    )}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Cloud className="w-5 h-5 text-orange-500" />
                          <h4 className="font-medium text-gray-900">
                            {infra.name}
                          </h4>
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                            {infra.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {infra.repository} • {infra.path}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="View Content"
                          onClick={() =>
                            handleViewContent("infrastructure", infra)
                          }
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                          title="Edit Infrastructure"
                          onClick={() => handleEditInfrastructure(infra)}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Container Tab */}
        {activeTab === "container" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Container Files ({containers.length})
              </h3>
              <button
                onClick={() => {
                  if (onOpenContainerEditor) onOpenContainerEditor();
                  else setShowContainerEditor({ open: true });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Container
              </button>
            </div>

            {containers.length === 0 ? (
              <div className="text-center py-12">
                <ContainerIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {connectionStatus.connected
                    ? "No container files found"
                    : "Connect GitHub to view container files"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {containers.map((container: Container) => (
                  <div
                    key={String(
                      container.id ??
                        `${container.repository}/${container.path}`
                    )}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <ContainerIcon className="w-5 h-5 text-purple-500" />
                          <h4 className="font-medium text-gray-900">
                            {container.name}
                          </h4>
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                            {container.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {container.repository} • {container.path}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="View Content"
                          onClick={() =>
                            handleViewContent("container", container)
                          }
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                          title="Edit Container"
                          onClick={() => handleEditContainer(container)}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Project Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h4 className="text-lg font-semibold mb-4">
              {editingProject ? "Edit Project" : "Create New Project"}
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingProject) updateProject(editingProject.id);
                else createProject();
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Project description (optional)"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repository
                  </label>
                  {githubLoading ? (
                    <div className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      <span className="text-gray-500">
                        Loading repositories...
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                        value={repository}
                        onChange={(e) => setRepository(e.target.value)}
                      >
                        <option value="">Select a repository (optional)</option>
                        {repositories.map((repo: Repository) => (
                          <option key={repo.id} value={repo.html_url}>
                            {repo.full_name}
                          </option>
                        ))}
                        <option value="custom">Custom Repository URL</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  )}

                  {repository === "custom" && (
                    <input
                      type="url"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://github.com/username/repository"
                      onChange={(e) => setRepository(e.target.value)}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setShowAdd(false);
                    setEditingProject(null);
                    setName("");
                    setDescription("");
                    setRepository("");
                    setStatus("active");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingProject ? "Save Changes" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Access Modal */}
      {manageAccessRepo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-[500px] max-w-[90vw] mx-4 max-h-[80vh] overflow-y-auto">
            <h4 className="text-lg font-semibold mb-4">
              Manage Access - {manageAccessRepo.full_name}
            </h4>

            <div className="space-y-4">
              {/* Add Person Section */}
              <div className="border-b pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">Add Collaborator</span>
                  <div className="relative">
                    <button
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700"
                      onClick={() =>
                        setShowAddPersonDropdown(!showAddPersonDropdown)
                      }
                    >
                      Add Person
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {showAddPersonDropdown && (
                      <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                        <button
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-t-lg"
                          onClick={() => {
                            setShowWorkerSelection(true);
                            setShowEmailInput(false);
                            setShowAddPersonDropdown(false);
                            fetchWorkers();
                          }}
                        >
                          From Worker List
                        </button>
                        <button
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-b-lg"
                          onClick={() => {
                            setShowEmailInput(true);
                            setShowWorkerSelection(false);
                            setShowAddPersonDropdown(false);
                          }}
                        >
                          Other Person (GitHub username)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Worker Selection Modal */}
                {showWorkerSelection && (
                  <div className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-medium">Select Worker</h5>
                      <button
                        onClick={() => {
                          setShowWorkerSelection(false);
                          setSelectedWorker(null);
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                      <p className="text-sm text-blue-800">
                        Tip: Ensure the worker&apos;s GitHub username is set on
                        their profile so we can add them directly.
                      </p>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {workers.map((worker) => (
                        <div
                          key={worker.id}
                          className={`p-2 border rounded cursor-pointer transition-colors ${
                            selectedWorker?.id === worker.id
                              ? "bg-blue-50 border-blue-200"
                              : "hover:bg-gray-100"
                          }`}
                          onClick={() => setSelectedWorker(worker)}
                        >
                          <div className="font-medium text-sm">
                            {worker.name}
                          </div>
                          <div className="text-xs text-gray-600">
                            {worker.email}
                          </div>
                        </div>
                      ))}
                      {workers.length === 0 && (
                        <p className="text-sm text-gray-500">
                          No workers found
                        </p>
                      )}
                    </div>

                    {selectedWorker && (
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                          onClick={() => {
                            setShowWorkerSelection(false);
                            setSelectedWorker(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          onClick={async () => {
                            if (!selectedWorker) return;
                            const username = selectedWorker.githubUsername;
                            if (username) {
                              // Use the stored GitHub username directly
                              setShowWorkerSelection(false);
                              setSelectedWorker(null);
                              // call addCollaborator with repo and username
                              await addCollaborator({
                                repoFullName: manageAccessRepo!.full_name,
                                username,
                              });
                            } else {
                              // Warn and show manual input so user can fill the username
                              alert(
                                "This worker doesn't have Github Username, please input first"
                              );
                              setShowWorkerSelection(false);
                              setShowEmailInput(true);
                              // prefill worker email or keep usernameInput empty
                              setUsernameInput("");
                            }
                          }}
                        >
                          Add Worker
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Username Input Modal */}
                {showEmailInput && (
                  <div className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-medium">Add by GitHub Username</h5>
                      <button
                        onClick={() => {
                          setShowEmailInput(false);
                          setUsernameInput("");
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter GitHub username (e.g. octocat)"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                    />

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        onClick={() => {
                          setShowEmailInput(false);
                          setUsernameInput("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        onClick={async () => {
                          const username = usernameInput.trim();
                          if (!username) return;
                          await addCollaborator({
                            repoFullName: manageAccessRepo.full_name,
                            username,
                          });
                          setShowEmailInput(false);
                          setUsernameInput("");
                        }}
                      >
                        Add Collaborator
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collaborators List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">
                    Collaborators ({collaborators.length})
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto border rounded">
                  {loadingCollabs ? (
                    <div className="p-4 text-center">
                      <p className="text-sm text-gray-500">
                        Loading collaborators...
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {collaborators.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600">
                                {c.login.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-sm font-medium">
                              @{c.login}
                            </span>
                          </div>
                          <button
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            onClick={() =>
                              removeCollaborator({
                                repoFullName: manageAccessRepo.full_name,
                                username: c.login,
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}

                      {invitations.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between p-3 bg-amber-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-amber-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-amber-600">
                                ⏳
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {i.invitee?.login || i.email}
                              </div>
                              <div className="text-xs text-amber-600">
                                Waiting for approval
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {collaborators.length === 0 &&
                        invitations.length === 0 && (
                          <div className="p-4 text-center">
                            <p className="text-sm text-gray-500">
                              No collaborators yet.
                            </p>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setManageAccessRepo(null);
                  setCollaborators([]);
                  setInvitations([]);
                  setShowAddPersonDropdown(false);
                  setShowWorkerSelection(false);
                  setShowEmailInput(false);
                  setSelectedWorker(null);
                  setUsernameInput("");
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Viewer Modal */}
      {showContentViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-[800px] max-w-[90vw] mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {showContentViewer.type === "infrastructure"
                  ? "Infrastructure"
                  : "Container"}{" "}
                Content
              </h4>
              <button
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                onClick={() => setShowContentViewer(null)}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">Name:</span>
                <span>{showContentViewer.item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">Type:</span>
                <span>{showContentViewer.item.type}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">Path:</span>
                <span className="text-sm text-gray-600">
                  {showContentViewer.item.path}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">Repository:</span>
                <span className="text-sm text-gray-600">
                  {showContentViewer.item.repository}
                </span>
              </div>
              <div>
                <span className="font-medium block mb-2">Content:</span>
                <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto border">
                  {showContentViewer.item.content || "No content available"}
                </pre>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setShowContentViewer(null)}
              >
                Close
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => {
                  const editUrl = `https://github.com/${showContentViewer.item.repository}/edit/main/${showContentViewer.item.path}`;
                  window.open(editUrl, "_blank");
                }}
              >
                Edit on GitHub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editors */}
      {showWorkflowEditor?.open && (
        <WorkflowEditorModal
          isOpen={!!showWorkflowEditor?.open}
          onClose={() => setShowWorkflowEditor(null)}
          workflow={
            showWorkflowEditor && showWorkflowEditor.workflow
              ? {
                  id: showWorkflowEditor.workflow.id,
                  filename: showWorkflowEditor.workflow.filename,
                  repository: showWorkflowEditor.workflow.repository,
                  content: (
                    showWorkflowEditor.workflow as unknown as {
                      content?: string;
                    }
                  ).content,
                }
              : undefined
          }
          mode={"edit"}
          onSave={async (content, filename, repository) => {
            if (!filename || !repository) return;
            // Save through contents API; we need path
            const wf =
              showWorkflowEditor && showWorkflowEditor.workflow
                ? showWorkflowEditor.workflow
                : null;
            if (!wf) return;
            // Fetch sha first
            const infoRes = await fetch(
              `/api/github/contents?repo=${encodeURIComponent(
                repository!
              )}&path=${encodeURIComponent(wf.path)}`
            );
            const info = infoRes.ok ? await infoRes.json() : {};
            const sha = info.sha;
            const res = await fetch("/api/github/contents", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: repository,
                path: wf.path,
                content: btoa(content),
                sha,
                message: `chore(workflow): update ${filename}`,
              }),
            });
            if (!res.ok) alert("Failed to save workflow");
            await refreshData();
          }}
        />
      )}

      {showInfraEditor?.open && (
        <InfrastructureEditorModal
          isOpen={!!showInfraEditor?.open}
          onClose={() => setShowInfraEditor(null)}
          item={showInfraEditor?.item || undefined}
          onSaved={async () => await refreshData()}
        />
      )}

      {showContainerEditor?.open && (
        <ContainerEditorModal
          isOpen={!!showContainerEditor?.open}
          onClose={() => setShowContainerEditor(null)}
          item={showContainerEditor?.item || undefined}
          onSaved={async () => await refreshData()}
        />
      )}

      {/* Confirm Delete Project */}
      {confirmDeleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h4 className="text-lg font-semibold mb-4">Delete Project</h4>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete project &quot;
              {confirmDeleteProject.name}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                onClick={() => setConfirmDeleteProject(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                onClick={() => deleteProject(confirmDeleteProject.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
