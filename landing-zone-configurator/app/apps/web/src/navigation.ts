import { useCallback, useEffect, useState } from "react";
import { standaloneTemplate, templates } from "./templates";
export type View =
  | "templates"
  | "preview"
  | "editor"
  | "repositories"
  | "credentials";
export type EditorStep = "basics" | "projects" | "review";
function readRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const template = templates.find((item) => path === `/templates/${item.id}`);
  const step: EditorStep = path.endsWith("/projects")
    ? "projects"
    : path.endsWith("/review")
      ? "review"
      : "basics";
  const view: View = template
    ? "preview"
    : /^\/configurations\/edit(?:\/(basics|projects|review))?$/.test(path)
      ? "editor"
      : path === "/credentials"
        ? "credentials"
        : path === "/repositories"
          ? "repositories"
          : "templates";
  return { view, selected: template ?? standaloneTemplate, step };
}
export function useNavigation(restoreEditor: boolean) {
  const [route, setRoute] = useState(() =>
    restoreEditor && window.location.pathname === "/"
      ? {
          view: "editor" as const,
          selected: standaloneTemplate,
          step: "basics" as const,
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
        : view === "editor"
          ? `/configurations/edit/${detail ?? "basics"}`
          : view === "credentials"
            ? "/credentials"
            : view === "repositories"
              ? "/repositories"
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
