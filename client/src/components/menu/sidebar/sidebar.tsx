import {
  Sidebar as ShadCnSidebar,
  SidebarFooter,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Stats } from "./stats";
import { Header } from "./header";
import { MainNavigation } from "./main-navigation";
import { Actions } from "./actions";
import { useMenuFocus } from "@/contexts/menu-focus-context";
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export const Sidebar = ({ children }: PropsWithChildren<{}>) => {
  const { actionsRef, setFocus } = useMenuFocus();
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

        <MainNavigation registerCallbacks={registerMainNavigationCallbacks} />

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
