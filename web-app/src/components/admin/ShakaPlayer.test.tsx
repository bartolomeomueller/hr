// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShakaPlayer } from "./ShakaPlayer";

const { attachMock, loadMock, destroyMock, importGate, resolveShakaImport } =
  vi.hoisted(() => {
    let resolveImport: () => void;
    const importGate = new Promise<void>((resolve) => {
      resolveImport = resolve;
    });

    return {
      attachMock: vi.fn(() => Promise.resolve()),
      loadMock: vi.fn(),
      destroyMock: vi.fn(),
      importGate,
      resolveShakaImport: () => {
        resolveImport();
      },
    };
  });

vi.mock("shaka-player/dist/shaka-player.ui.js", async () => {
  await importGate;

  return {
    default: {
      polyfill: {
        installAll: vi.fn(),
      },
      Player: class {
        static isBrowserSupported() {
          return true;
        }

        attach = attachMock;
      },
      ui: {
        Overlay: class {
          destroy = destroyMock;

          getControls() {
            return {
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
              getPlayer: () => ({
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                load: loadMock,
              }),
            };
          }
        },
      },
    },
  };
});

describe("ShakaPlayer", () => {
  beforeEach(() => {
    attachMock.mockClear();
    loadMock.mockReset();
    destroyMock.mockReset();
  });

  it("does not attach a stale player after cleanup while shaka is still importing", async () => {
    const { unmount } = render(<ShakaPlayer manifestUrl="/manifest.mpd" />);

    unmount();
    resolveShakaImport();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(attachMock).not.toHaveBeenCalled();
  });

  it("loads the given manifest url", async () => {
    render(<ShakaPlayer manifestUrl="/manifest.mpd" />);
    resolveShakaImport();

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith("/manifest.mpd");
    });
  });
});
