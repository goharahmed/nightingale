import { SidebarHeader } from "@/components/ui/sidebar";

import logoUrl from "@/assets/images/logo.png";

export const Header = () => (
  <SidebarHeader>
    <div className="flex w-full justify-center py-2">
      <img src={logoUrl} className="w-5/6" />
    </div>
  </SidebarHeader>
);
