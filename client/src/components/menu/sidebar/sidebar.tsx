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

export const Sidebar = ({ children }: { children?: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <ShadCnSidebar>
        <Header />

        <MainNavigation />

        <SidebarFooter>
          <Stats />
          <SidebarSeparator />
          <Actions />
        </SidebarFooter>
      </ShadCnSidebar>
      {children}
    </SidebarProvider>
  );
};
