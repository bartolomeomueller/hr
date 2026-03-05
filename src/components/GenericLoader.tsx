export function GenericLoader() {
  // Use css fade-in animation with delay so no js needs to run.
  // Suspense with SSR will not run any fallback component code.
  return (
    <div className="opacity-0 animate-[fade-in_0.2s_forwards] delay-400 transform-none">
      Bitte gib uns einen kleinen Augenblick, um alles für dich vorzubereiten..
      <style>
        {/* see https://css-loaders.com/bouncing/ */}
        {`
        .loader {
          height: 60px;
          aspect-ratio: 2;
          border-bottom: 3px solid #0000;
          background: 
            linear-gradient(90deg,#524656 50%,#0000 0)
            -25% 100%/50% 3px repeat-x border-box;
          position: relative;
          animation: l3-0 .75s linear infinite;
        }
        .loader:before {
          content: "";
          position: absolute;
          inset: auto 42.5% 0;
          aspect-ratio: 1;
          border-radius: 50%;
          background: #CF4647;
          animation: l3-1 .75s cubic-bezier(0,900,1,900) infinite;
        }
        @keyframes l3-0 {
          to {background-position: -125% 100%}
        }
        @keyframes l3-1 {
          0%,2% {bottom: 0%}
          98%,to {bottom:.1%}
        }`}
      </style>
      <div className="loader"></div>
    </div>
  );
}
