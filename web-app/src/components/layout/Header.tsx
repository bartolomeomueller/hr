import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import HeaderAccount from "@/components/layout/HeaderAccount";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 text-foreground backdrop-blur">
      <div className="flex items-center gap-4 px-4 py-2">
        <Link to="/" className="flex items-center gap-2">
          <Home className="text-primary"></Home>
          <h1 className="text-xl font-semibold text-primary">Talent Match</h1>
        </Link>
        <HeaderAccount />
      </div>
    </header>
  );
}
