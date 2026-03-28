import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";

export default function Header() {
  return (
    <header className="flex items-center bg-gray-800 p-4 text-white shadow-lg">
      <Link to="/" className="flex items-center gap-2">
        <Home></Home>
        <h1 className="text-xl font-semibold">Talent Match</h1>
      </Link>
    </header>
  );
}
