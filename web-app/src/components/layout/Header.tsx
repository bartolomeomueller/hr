import { Link } from "@tanstack/react-router";
import HeaderAccount from "@/components/layout/HeaderAccount";
import Logo from "@/components/layout/Logo";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 text-foreground backdrop-blur">
      <div className="flex items-center gap-4 px-4 py-2">
        <Link to="/" className="flex items-center gap-2">
          <Logo aria-hidden="true" className="size-10 text-primary" />
          <h1 className="text-xl font-semibold text-primary">Hirephant</h1>
        </Link>
        <HeaderAccount />
      </div>
    </header>
  );
}
