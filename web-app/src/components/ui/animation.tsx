import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// This component keeps the last child as a ref, so that when the child disappears, it can still show the child while animating it out.
export function SlideInFromTop({
  children,
  isVisible,
  className,
  ...props
}: {
  children?: React.ReactNode;
  isVisible: boolean;
  className?: string;
  props?: React.ComponentProps<"div">;
}) {
  const [childrenState, setChildrenState] = useState(children);

  useEffect(() => {
    if (isVisible && children) {
      setChildrenState(children);
    }
  }, [children, isVisible]);

  const handleOnTransitionEnd = () => {
    if (!isVisible) {
      setChildrenState(undefined);
    }
  };

  return (
    <div
      onTransitionEnd={handleOnTransitionEnd}
      className={cn(
        "grid transition-all duration-300 ease-in-out",
        isVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
        "py-1",
      )}
      aria-hidden={!isVisible}
      {...props}
    >
      <div className="overflow-hidden">{childrenState}</div>
    </div>
  );
}
