import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";

export default function Header() {
  return (
    <header className="flex items-center border-b border-border bg-background p-4 pb-2 text-foreground">
      <Link to="/" className="flex items-center gap-2">
        <Home className="text-primary"></Home>
        <h1 className="text-xl font-semibold text-primary">Talent Match</h1>
      </Link>
    </header>
  );
}
