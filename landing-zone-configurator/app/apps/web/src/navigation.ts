import { useCallback, useEffect, useState } from "react";
import { standaloneTemplate, templates } from "./templates";
export type View =
  | "workspaces"
  | "templates"
  | "preview"
  | "editor"
  | "repositories"
  | "credentials"
  | "deployments"
  | "history"
  | "organisation"
  | "applications";
export type EditorStep =
  | "basics"
  | "folders"
  | "network"
  | "platform"
  | "projects"
  | "operations"
  | "review";
export type DeploymentStep = "preparation" | "plan" | "apply" | "history";
function readRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const template = templates.find((item) => path === `/templates/${item.id}`);
  const step: EditorStep = path.endsWith("/network")
    ? "network"
    : path.endsWith("/platform")
      ? "platform"
      : path.endsWith("/operations")
        ? "operations"
        : path.endsWith("/folders")
          ? "folders"
          : path.endsWith("/projects")
            ? "projects"
            : path.endsWith("/review")
              ? "review"
              : "basics";
  const view: View = template
    ? "preview"
    : path === "/applications"
      ? "applications"
      : /^\/configurations\/edit(?:\/(basics|folders|network|platform|projects|operations|review))?$/.test(
            path,
          )
        ? "editor"
        : path === "/organisation"
          ? "organisation"
          : path === "/deployments/history"
            ? "history"
            : /^\/deployments(?:\/(preparation|plan|apply))?$/.test(path)
              ? "deployments"
              : path === "/credentials"
                ? "credentials"
                : path === "/repositories" || path === "/configurations"
                  ? "repositories"
                  : path === "/templates"
                    ? "templates"
                    : "workspaces";
  const deploymentStep: DeploymentStep =
    path === "/deployments/history"
      ? "history"
      : path === "/deployments/apply"
        ? "apply"
        : path === "/deployments/plan"
          ? "plan"
          : "preparation";
  return {
    view,
    selected: template ?? standaloneTemplate,
    step,
    deploymentStep,
  };
}
export function useNavigation(restoreEditor: boolean) {
  const [route, setRoute] = useState(() =>
    restoreEditor && window.location.pathname === "/"
      ? {
          view: "editor" as const,
          selected: standaloneTemplate,
          step: "basics" as const,
          deploymentStep: "preparation" as const,
        }
      : readRoute(),
  );
  useEffect(() => {
    if (restoreEditor && window.location.pathname === "/") {
      window.history.replaceState(
        null,
        "",
        `/configurations/edit/basics${window.location.search}`,
      );
      setRoute(readRoute());
    }
    const update = () => setRoute(readRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [restoreEditor]);
  const navigate = useCallback((view: View, detail?: string) => {
    const path =
      view === "preview"
        ? `/templates/${detail ?? "standalone"}`
        : view === "applications"
          ? "/applications"
          : view === "editor"
            ? `/configurations/edit/${detail ?? "basics"}`
            : view === "organisation"
              ? "/organisation"
              : view === "history"
                ? "/deployments/history"
                : view === "deployments"
                  ? detail === "plan" || detail === "apply"
                    ? `/deployments/${detail}`
                    : "/deployments"
                  : view === "credentials"
                    ? "/credentials"
                    : view === "repositories"
                      ? "/configurations"
                      : view === "workspaces"
                        ? "/workspaces"
                        : "/templates";
    if (
      window.location.pathname !== path ||
      window.location.search ||
      window.location.hash
    ) {
      window.history.pushState(null, "", path);
      setRoute(readRoute());
    }
  }, []);
  return { ...route, navigate };
}
