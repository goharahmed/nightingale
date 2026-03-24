import {
  Sidebar as ShadCnSidebar,
  SidebarFooter,
  SidebarProvider,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Stats } from './stats';
import { Header } from './header';
import { MainNavigation } from './main-navigation';
import { Actions } from './actions';
import { useMenuFocus } from '@/contexts/menu-focus-context';
import {
  useEffect,
  useRef,
  type RefObject,
  type PropsWithChildren,
} from 'react';

export const SIDEBAR_ITEM_COUNT = 3;

export type SidebarCallbacks = RefObject<((() => void) | null)[]>;

export const Sidebar = ({ children }: PropsWithChildren<{}>) => {
  const { actionsRef } = useMenuFocus();
  const sidebarCallbacks = useRef<((() => void) | null)[]>([null, null, null]);

  useEffect(() => {
    actionsRef.current.sidebarCount = SIDEBAR_ITEM_COUNT;

    actionsRef.current.onConfirmSidebar = (index: number) => {
      sidebarCallbacks.current[index]?.();
    };

    return () => {
      actionsRef.current.onConfirmSidebar = null;
      actionsRef.current.sidebarCount = 0;
    };
  }, [actionsRef]);

  return (
    <SidebarProvider>
      <ShadCnSidebar>
        <Header />

        <MainNavigation sidebarCallbacks={sidebarCallbacks} />

        <SidebarFooter>
          <Stats />
          <SidebarSeparator />
          <Actions sidebarCallbacks={sidebarCallbacks} />
        </SidebarFooter>
      </ShadCnSidebar>
      {children}
    </SidebarProvider>
  );
};
