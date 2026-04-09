import { SignedIn, SignedOut, UserButton } from "@daveyplate/better-auth-ui";
import { Link } from "@tanstack/react-router";
import { LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeaderAccount() {
  return (
    <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
      <SignedOut>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild className="text-muted-foreground">
            <Link to="/auth/$authView" params={{ authView: "sign-in" }}>
              <LogIn className="size-4" />
              Log in
            </Link>
          </Button>
          <Button asChild className="rounded-full px-4 shadow-sm">
            <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
              <Sparkles className="size-4" />
              Start for free
            </Link>
          </Button>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="flex min-w-0 items-center gap-3">
          <UserButton
            className="rounded-full bg-secondary text-secondary-foreground hover:bg-accent"
            align="end"
            size="default"
          />
        </div>
      </SignedIn>
    </div>
  );
}
