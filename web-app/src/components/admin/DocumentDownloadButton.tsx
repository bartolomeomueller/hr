import { useMutation } from "@tanstack/react-query";
import type * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { orpc } from "@/orpc/client";

export function DocumentDownloadButton({
  documentUuid,
  interviewUuid,
  children,
  ...buttonProps
}: {
  documentUuid: string;
  interviewUuid: string;
} & Omit<
  React.ComponentProps<typeof Button>,
  "onAuxClick" | "onClick" | "onMouseEnter" | "type"
>) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [shouldOpenWhenReady, setShouldOpenWhenReady] = useState(false);
  const { mutate, isPending } = useMutation({
    ...orpc.createPresignedS3DocumentDownloadUrlByUuid.mutationOptions(),
    onSuccess: (data) => {
      setDownloadUrl(data.downloadUrl);

      if (!shouldOpenWhenReady) return;

      window.open(data.downloadUrl, "_blank");
      setShouldOpenWhenReady(false);
    },
    onError: () => {
      setShouldOpenWhenReady(false);
    },
  });

  const hasFreshDownloadUrl =
    downloadUrl !== null && isPreSignedURLStillValid(downloadUrl);
  const openDocument = () => {
    if (hasFreshDownloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }

    setShouldOpenWhenReady(true);
    mutate({
      documentUuid,
      interviewUuid,
    });
  };

  return (
    <Button
      {...buttonProps}
      type="button"
      onMouseEnter={() => {
        if (hasFreshDownloadUrl || isPending) return;

        mutate({
          documentUuid,
          interviewUuid,
        });
      }}
      onClick={openDocument}
      onAuxClick={(event) => {
        if (event.button !== 1) return;

        event.preventDefault();
        openDocument();
      }}
    >
      {children}
    </Button>
  );
}
