import type { SVGProps } from "react";

export default function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-28 -21 56 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <title>Hirephant Logo</title>
      <path d="M -10 22 Q -12 22 -12 21 C -12 9 -14 9 -16 5 Q -18 1 -18 -2 C -18 -8 -17 -20 0 -20 C 17 -20 18 -8 18 -2 Q 18 1 16 5 C 14 9 12 9 12 21 Q 12 22 10 22 L 4 22 Q 2 22 2 21 L 1 15 Q 0 15.5 -1 15 L -2 21 Q -2 22 -4 22 Z M -14 -15 Q -27 -22 -27 -10 Q -27 0 -16 5 M 14 -15 Q 27 -22 27 -10 Q 27 0 16 5 M 0 0 C 0 4 0 7 5 9 C 8 7 7 10 9 11 C 8 12 2 11 5 9" />
    </svg>
  );
}
