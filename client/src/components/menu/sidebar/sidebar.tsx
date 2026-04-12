import {
  Sidebar as ShadCnSidebar,
  SidebarFooter,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Stats } from "./stats";
import { Header } from "./header";
import { MainNavigation } from "./main-navigation";
import { FolderNavigation } from "./folder-navigation";
import { Actions } from "./actions";
import { useMenuFocus } from "@/contexts/menu-focus-context";
import { FolderTreeIcon, ListFilterIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";

type SidebarTab = "browse" | "library";

const SidebarTabs = ({
  activeTab,
  onTabChange,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}) => (
  <div className="flex gap-1 px-3 py-2">
    <button
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        activeTab === "browse"
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      }`}
      onClick={() => onTabChange("browse")}
    >
      <ListFilterIcon className="size-3.5" />
      Browse
    </button>
    <button
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        activeTab === "library"
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      }`}
      onClick={() => onTabChange("library")}
    >
      <FolderTreeIcon className="size-3.5" />
      Library
    </button>
  </div>
);

export const Sidebar = ({ children }: PropsWithChildren<{}>) => {
  const { actionsRef, setFocus } = useMenuFocus();
  const [activeTab, setActiveTab] = useState<SidebarTab>("browse");
  const [mainNavigationCallbacks, setMainNavigationCallbacks] = useState<(() => void)[]>([]);
  const [actionsCallback, setActionsCallback] = useState<(() => void) | null>(null);

  const sidebarCallbacks = useMemo(
    () => [...mainNavigationCallbacks, ...(actionsCallback ? [actionsCallback] : [])],
    [mainNavigationCallbacks, actionsCallback],
  );

  const registerMainNavigationCallbacks = useCallback((callbacks: (() => void)[]) => {
    setMainNavigationCallbacks(callbacks);
  }, []);

  const registerActionsCallback = useCallback((callback: (() => void) | null) => {
    setActionsCallback(() => callback);
  }, []);

  useEffect(() => {
    actionsRef.current.sidebarCount = sidebarCallbacks.length;

    actionsRef.current.onConfirmSidebar = (index: number) => {
      sidebarCallbacks[index]?.();
    };

    setFocus((prev) => {
      const maxIndex = Math.max(0, sidebarCallbacks.length - 1);
      const nextSidebarIndex = Math.min(prev.sidebarIndex, maxIndex);
      if (nextSidebarIndex === prev.sidebarIndex) {
        return prev;
      }
      return { ...prev, sidebarIndex: nextSidebarIndex };
    });

    return () => {
      actionsRef.current.onConfirmSidebar = null;
      actionsRef.current.sidebarCount = 0;
    };
  }, [actionsRef, sidebarCallbacks, setFocus]);

  return (
    <SidebarProvider>
      <ShadCnSidebar>
        <Header />

        <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "browse" ? (
          <MainNavigation registerCallbacks={registerMainNavigationCallbacks} />
        ) : (
          <FolderNavigation registerCallbacks={registerMainNavigationCallbacks} />
        )}

        <SidebarFooter>
          <Stats />
          <SidebarSeparator />
          <Actions
            focusedSidebarIndex={mainNavigationCallbacks.length}
            registerCallback={registerActionsCallback}
          />
        </SidebarFooter>
      </ShadCnSidebar>
      {children}
    </SidebarProvider>
  );
};
