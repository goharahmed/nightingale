
import squareLogo from '@/assets/images/logo_square.png'

export const LoadingScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
    <img src={squareLogo} width={180} height={180} />
  </div>
);
